/**
 * Cuisine Enforcer Service
 * LLM-based post-Google filtering for explicit cuisine queries
 * 
 * NO HARDCODED RULES - Pure LLM understanding of cuisine signals
 */

import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../../lib/llm/index.js';
import type { LLMProvider } from '../../../../../llm/types.js';
import {
  CuisineEnforcementResponseSchema,
  CUISINE_ENFORCEMENT_JSON_SCHEMA,
  CUISINE_ENFORCEMENT_SCHEMA_HASH,
  type PlaceInput,
  type CuisineEnforcementResponse
} from './cuisine-enforcer.schema.js';

const CUISINE_ENFORCER_VERSION = 'cuisine_enforcer_v3_compact';

/**
 * Minimal system prompt for BOOST-only mode (score-based ranking, no filtering)
 */
const CUISINE_ENFORCER_SYSTEM_PROMPT = `Score cuisine match 0-1 for each place using name/types/address hints.
Return ONLY valid JSON matching schema; no prose.
keepPlaceIds must include ALL input ids in the SAME order as input.
cuisineScores must include a numeric score for EVERY id.`;

export interface CuisineEnforcerInput {
  requiredTerms: string[];
  preferredTerms: string[];
  strictness: 'STRICT' | 'RELAX_IF_EMPTY';
  places: PlaceInput[];
  hardConstraintsExist?: boolean; // If kosher/meatDairy are active
}

/**
 * Compact place representation for LLM (reduce prompt size)
 */
interface CompactPlace {
  id: string;   // placeId
  n: string;    // name (trimmed to 50 chars)
  t: string[];  // first 6 types only
  a?: string | undefined;   // address (trimmed to 60 chars), explicitly allow undefined
}

/**
 * Execute cuisine enforcement via LLM
 * 
 * BOOST-ONLY MODE: Score-based ranking (no filtering).
 * Returns ALL place IDs with cuisineScores (0-1) for ranking.
 * 
 * Optimizations:
 * - Compact JSON payload (not verbose text)
 * - Minimal system prompt
 * - Fast path for small place counts (<=3)
 */
export async function executeCuisineEnforcement(
  input: CuisineEnforcerInput,
  llmProvider: LLMProvider,
  requestId: string
): Promise<CuisineEnforcementResponse> {
  const { requiredTerms, preferredTerms, strictness, places, hardConstraintsExist } = input;

  // Early exit: no places to score
  if (places.length === 0) {
    return {
      keepPlaceIds: [],
      relaxApplied: false,
      relaxStrategy: 'none'
    };
  }

  // Early exit: no required terms and RELAX mode => keep all with neutral scores
  if (requiredTerms.length === 0 && strictness === 'RELAX_IF_EMPTY') {
    return {
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none'
    };
  }

  // Fast path: small result sets don't need LLM scoring (deterministic fallback)
  if (places.length <= 3) {
    logger.info({
      requestId,
      event: 'cuisine_enforcer_fast_path',
      countIn: places.length
    }, '[CUISINE_ENFORCER] Small result set, skipping LLM');

    return {
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: {} // Empty scores = neutral ranking
    };
  }

  logger.info({
    requestId,
    event: 'cuisine_policy_selected',
    policy: 'SOFT_BOOST',
    reason: 'score_only_mode',
    countIn: places.length
  }, `[CUISINE_ENFORCER] BOOST-only mode (score-only, never filter)`);

  try {
    // Build compact JSON payload (reduce prompt size)
    const compactPlaces: CompactPlace[] = places.map(p => ({
      id: p.placeId,
      n: p.name.substring(0, 50),              // Trim long names
      t: p.types.slice(0, 6),                  // First 6 types only
      a: p.address?.substring(0, 60)           // Trim long addresses
    }));

    const userPrompt = JSON.stringify({
      requiredTerms,
      preferredTerms,
      places: compactPlaces
    });

    const messages: Message[] = [
      { role: 'system', content: CUISINE_ENFORCER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    // Resolve LLM config
    const { model, timeoutMs } = resolveLLM('filterEnforcer');

    const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    logger.info({
      requestId,
      event: 'cuisine_enforcement_llm_call',
      version: CUISINE_ENFORCER_VERSION,
      requiredTermsCount: requiredTerms.length,
      preferredTermsCount: preferredTerms.length,
      placesCount: places.length,
      promptChars,
      model,
      schemaHash: CUISINE_ENFORCEMENT_SCHEMA_HASH
    }, '[CUISINE_ENFORCER] Calling LLM for scoring');

    // Call LLM with structured output
    const response = await llmProvider.completeJSON(
      messages,
      CuisineEnforcementResponseSchema,
      {
        model,
        temperature: 0,
        timeout: timeoutMs,
        requestId,
        stage: 'cuisine_enforcer',
        schemaHash: CUISINE_ENFORCEMENT_SCHEMA_HASH
      },
      CUISINE_ENFORCEMENT_JSON_SCHEMA
    );

    // Log top cuisine scores
    if (response.data.cuisineScores) {
      const sortedScores = Object.entries(response.data.cuisineScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([placeId, score]) => {
          const place = places.find(p => p.placeId === placeId);
          return { placeId, placeName: place?.name || 'unknown', score };
        });

      logger.info({
        requestId,
        event: 'cuisine_scores_top10',
        scores: sortedScores
      }, '[CUISINE_ENFORCER] Top 10 cuisine scores');
    }

    logger.info({
      requestId,
      event: 'cuisine_enforcement_llm_success',
      countIn: places.length,
      countOut: response.data.keepPlaceIds.length,
      hasScores: !!response.data.cuisineScores,
      scoresCount: Object.keys(response.data.cuisineScores || {}).length
    }, '[CUISINE_ENFORCER] LLM scoring completed');

    // BOOST mode: Always return all places with scores
    return {
      keepPlaceIds: places.map(p => p.placeId), // Keep all places in original order
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: response.data.cuisineScores || {}
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'cuisine_enforcement_llm_failed',
      error: msg
    }, '[CUISINE_ENFORCER] LLM call failed, returning all places');

    // Fail gracefully: return all places with neutral scores
    return {
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: {} // Empty scores = neutral ranking
    };
  }
}
