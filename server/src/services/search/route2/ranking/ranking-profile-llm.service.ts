/**
 * Ranking Profile LLM Service
 * 
 * Uses LLM to select ranking profile and weights based on query intent.
 * IMPORTANT: LLM never sees restaurant data - only query context.
 * 
 * Includes deterministic profile selector for NEARBY intent detection.
 */

import type { LLMProvider } from '../../../../llm/types.js';
import type { MappingRoute } from '../types.js';
import type { OpenState, PriceIntent, MinRatingBucket } from '../shared/shared-filters.types.js';
import { completeJSONWithPurpose } from '../../../../lib/llm/llm-client.js';
import {
  RankingSelectionSchema,
  normalizeWeights,
  type RankingSelection,
  RANKING_SELECTION_JSON_SCHEMA,
  RANKING_SELECTION_SCHEMA_HASH
} from './ranking-profile.schema.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Near-me keywords (Hebrew + English)
 */
const NEAR_KEYWORDS = [
  'קרוב', 'לידי', 'בקרבתי', 'באזור', 'קרבה',
  'near', 'close', 'nearby', 'around', 'vicinity'
];

/**
 * Check if query contains "near me" intent keywords
 */
function containsNearKeywords(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return NEAR_KEYWORDS.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
}

/**
 * Context for deterministic profile selection
 */
export interface DeterministicProfileContext {
  hasUserLocation: boolean;
  route: MappingRoute;
  biasRadiusMeters?: number;
  query: string;
}

/**
 * Deterministic profile selector (runs before LLM)
 * 
 * INVARIANT: If route === TEXTSEARCH, do NOT select NEARBY profile automatically
 * 
 * Rules:
 * - NEARBY profile when:
 *   - route is NEARBY (explicit intent)
 * - BALANCED with distance bias when:
 *   - route is TEXTSEARCH AND hasUserLocation AND (query contains near keywords OR biasRadiusMeters <= 20000)
 * - Otherwise: null (let LLM decide)
 * 
 * Returns null if no deterministic decision can be made (fall back to LLM)
 */
export function selectDeterministicProfile(
  ctx: DeterministicProfileContext
): RankingSelection | null {
  const { hasUserLocation, route, biasRadiusMeters, query } = ctx;

  // If no user location, can't use distance-based profiles
  if (!hasUserLocation) {
    return null; // Let LLM decide
  }

  // INVARIANT ENFORCEMENT: If route is NEARBY, use NEARBY profile
  if (route === 'NEARBY') {
    return {
      profile: 'NEARBY',
      weights: {
        rating: 0.2,
        reviews: 0.1,
        distance: 0.6,
        openBoost: 0.1
      }
    };
  }

  // INVARIANT ENFORCEMENT: If route is TEXTSEARCH, do NOT use NEARBY profile
  // Instead, use BALANCED with distance bias if near keywords or small radius detected
  if (route === 'TEXTSEARCH') {
    const hasNearKeywords = containsNearKeywords(query);
    const hasSmallRadius = biasRadiusMeters !== undefined && biasRadiusMeters <= 20000;

    if (hasNearKeywords || hasSmallRadius) {
      // TEXTSEARCH with proximity signals → use BALANCED with distance bias
      return {
        profile: 'BALANCED', // Keep TEXTSEARCH profile, not NEARBY
        weights: {
          rating: 0.25,
          reviews: 0.15,
          distance: 0.5, // Higher distance weight for proximity signals
          openBoost: 0.1
        }
      };
    }
  }

  // No deterministic decision - let LLM decide
  return null;
}

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
 * - Try deterministic profile selection first (for NEARBY intent)
 * - If no deterministic decision, use LLM
 * - LLM must ONLY see query + intent + filters (no restaurant data)
 * - Must return profile + weights in strict JSON format
 * - Weights must be normalized to sum to 1
 */
export async function selectRankingProfile(
  ctx: RankingContext,
  provider: LLMProvider,
  requestId: string,
  biasRadiusMeters?: number
): Promise<RankingSelection> {
  const startTime = Date.now();

  // Step 1: Try deterministic profile selection
  const deterministicSelection = selectDeterministicProfile({
    hasUserLocation: ctx.hasUserLocation,
    route: ctx.route,
    biasRadiusMeters,
    query: ctx.query
  });

  if (deterministicSelection) {
    // Build detailed reason for profile decision
    const hasNearKeywords = containsNearKeywords(ctx.query);
    const hasSmallRadius = biasRadiusMeters !== undefined && biasRadiusMeters <= 20000;

    let reason: string;
    let explanation: string;

    if (ctx.route === 'NEARBY') {
      reason = 'nearby_route';
      explanation = 'Route is NEARBY - using NEARBY profile';
    } else if (ctx.route === 'TEXTSEARCH' && (hasNearKeywords || hasSmallRadius)) {
      reason = hasNearKeywords ? 'textsearch_near_keywords' : 'textsearch_small_radius';
      explanation = `Route is TEXTSEARCH with proximity signals - using BALANCED with distance bias (not NEARBY)`;
    } else {
      reason = 'unknown';
      explanation = 'Deterministic selection applied';
    }

    logger.info({
      requestId,
      event: 'ranking_profile_deterministic',
      profile: deterministicSelection.profile,
      weights: deterministicSelection.weights,
      route: ctx.route,
      reason,
      hasNearKeywords,
      hasSmallRadius: hasSmallRadius || false,
      durationMs: Date.now() - startTime
    }, `[RANKING] ${explanation}`);

    return deterministicSelection;
  }

  // Step 2: Fall back to LLM selection
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
      RANKING_SELECTION_JSON_SCHEMA, // Use static schema to ensure root type is object
      {
        temperature: 0,
        requestId,
        stage: 'ranking_profile',
        schemaHash: RANKING_SELECTION_SCHEMA_HASH
      }
    );

    // Normalize weights to ensure they sum to 1
    const normalized = normalizeWeights(result.data.weights);

    logger.info({
      requestId,
      event: 'ranking_profile_selected',
      profile: result.data.profile,
      weights: normalized,
      durationMs: Date.now() - startTime,
      source: 'llm'
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
2. INVARIANT: If route=TEXTSEARCH, do NOT select NEARBY profile (use BALANCED or QUALITY instead)
3. If route=NEARBY, NEARBY profile is appropriate
4. Prefer distance weighting ONLY if hasUserLocation=true AND route=NEARBY
5. If openState filter is present, include openBoost weight (0.05-0.2)
6. If minRatingBucket is present or query implies quality, favor rating+reviews
7. Weights must sum to 1.0 (±0.001)
8. Return ONLY valid JSON - no explanations

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
