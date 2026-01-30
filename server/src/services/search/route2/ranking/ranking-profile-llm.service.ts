/**
 * Ranking Profile LLM Service
 * 
 * Uses LLM to select ranking profile and weights based on query intent.
 * IMPORTANT: LLM never sees restaurant data - only query context.
 */

import type { LLMProvider } from '../../../../llm/types.js';
import type { MappingRoute } from '../types.js';
import type { OpenState, PriceIntent, MinRatingBucket } from '../shared/shared-filters.types.js';
import { completeJSONWithPurpose } from '../../../../lib/llm/llm-client.js';
import { RankingSelectionSchema, normalizeWeights, type RankingSelection } from './ranking-profile.schema.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Ranking Context Input
 * Minimal context for LLM ranking decision (no restaurant data)
 */
export interface RankingContext {
  query: string;
  route: MappingRoute;
  hasUserLocation: boolean;
  appliedFilters: {
    openState: OpenState;
    priceIntent: PriceIntent;
    minRatingBucket: MinRatingBucket;
  };
}

/**
 * Select ranking profile and weights using LLM
 * 
 * HARD RULES:
 * - LLM must ONLY see query + intent + filters (no restaurant data)
 * - Must return profile + weights in strict JSON format
 * - Weights must be normalized to sum to 1
 */
export async function selectRankingProfile(
  ctx: RankingContext,
  provider: LLMProvider,
  requestId: string
): Promise<RankingSelection> {
  const startTime = Date.now();
  
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(ctx);

  try {
    const result = await completeJSONWithPurpose(
      provider,
      'ranking_profile',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      RankingSelectionSchema,
      null, // No static schema - let Zod handle it
      {
        temperature: 0,
        requestId,
        stage: 'ranking_profile'
      }
    );

    // Normalize weights to ensure they sum to 1
    const normalized = normalizeWeights(result.data.weights);
    
    logger.info({
      requestId,
      event: 'ranking_profile_selected',
      profile: result.data.profile,
      weights: normalized,
      durationMs: Date.now() - startTime
    }, '[RANKING] Profile selected by LLM');

    return {
      profile: result.data.profile,
      weights: normalized
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    
    logger.error({
      requestId,
      event: 'ranking_profile_failed',
      error: msg,
      durationMs: Date.now() - startTime
    }, '[RANKING] Failed to select profile, using BALANCED fallback');

    // Fallback to BALANCED profile
    return {
      profile: 'BALANCED',
      weights: {
        rating: 0.25,
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      }
    };
  }
}

/**
 * Build system prompt for ranking profile selection
 */
function buildSystemPrompt(): string {
  return `You are a ranking profile selector for restaurant search results.

Your task: Based on the user's query, search route, location availability, and applied filters, choose the BEST ranking profile and assign weights.

**Ranking Profiles:**
- NEARBY: Prioritize proximity (distance-heavy). Use when user has location and wants nearby results.
- QUALITY: Prioritize rating + reviews (quality-heavy). Use when query implies "best", "top", "high quality", or when rating filters are present.
- OPEN_FOCUS: Boost currently open places. Use when user explicitly wants open places (openState filter present).
- BALANCED: Equal weighting. Use as default when no strong signal.

**Weights (must sum to 1.0):**
- rating: Weight for restaurant rating (0-5 stars normalized to 0-1)
- reviews: Weight for review count (log-scaled)
- distance: Weight for proximity to user location (0-1, lower distance = higher score)
- openBoost: Weight for open/closed state (1 for open, 0 for closed, 0.5 for unknown)

**Hard Rules:**
1. You NEVER see restaurant data - only query context
2. Prefer distance ONLY if hasUserLocation=true OR route=NEARBY
3. If openState filter is present, include openBoost weight (0.05-0.2)
4. If minRatingBucket is present or query implies quality, favor rating+reviews
5. Weights must sum to 1.0 (±0.001)
6. Return ONLY valid JSON - no explanations

**Examples:**

Query: "pizza near me", route: NEARBY, hasUserLocation: true, openState: null
→ Profile: NEARBY, weights: { rating: 0.2, reviews: 0.1, distance: 0.6, openBoost: 0.1 }

Query: "best sushi restaurants", route: TEXTSEARCH, hasUserLocation: false, minRatingBucket: R40
→ Profile: QUALITY, weights: { rating: 0.5, reviews: 0.4, distance: 0, openBoost: 0.1 }

Query: "open restaurants now", route: TEXTSEARCH, hasUserLocation: true, openState: OPEN_NOW
→ Profile: OPEN_FOCUS, weights: { rating: 0.25, reviews: 0.15, distance: 0.4, openBoost: 0.2 }

Query: "italian food", route: TEXTSEARCH, hasUserLocation: true, no filters
→ Profile: BALANCED, weights: { rating: 0.3, reviews: 0.2, distance: 0.4, openBoost: 0.1 }

Return ONLY the JSON object with profile and weights.`;
}

/**
 * Build user prompt with ranking context
 */
function buildUserPrompt(ctx: RankingContext): string {
  const { query, route, hasUserLocation, appliedFilters } = ctx;
  
  const filtersStr = [
    appliedFilters.openState && `openState: ${appliedFilters.openState}`,
    appliedFilters.priceIntent && `priceIntent: ${appliedFilters.priceIntent}`,
    appliedFilters.minRatingBucket && `minRatingBucket: ${appliedFilters.minRatingBucket}`
  ].filter(Boolean).join(', ');

  return `Query: "${query}"
Route: ${route}
Has User Location: ${hasUserLocation}
Applied Filters: ${filtersStr || 'none'}

Select the best ranking profile and weights.`;
}
