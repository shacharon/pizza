/**
 * Place Details enrichment policy – cost-safe decision only (no API calls).
 * Trigger only when user intent explicitly requires vibe/dietary; enrich top N; skip if cached.
 */

import type {
  PlaceDetailsEnrichmentConfig,
  PlaceDetailsEnrichmentIntentInput,
  PlaceDetailsEnrichmentPlan,
} from './place-details-policy.types.js';

/**
 * Whether user intent explicitly requires vibe or dietary signals (so Details enrichment is justified).
 * Pure function; no I/O.
 */
export function shouldRunPlaceDetailsEnrichment(
  intentInput: PlaceDetailsEnrichmentIntentInput,
  config: { enabled: boolean }
): boolean {
  if (!config.enabled) return false;
  const hasDietary =
    intentInput.hasDietaryIntent === true ||
    intentInput.isKosherRequested === true ||
    intentInput.isGlutenFreeRequested === true;
  const hasVibe = intentInput.hasVibeIntent === true;
  return hasDietary || hasVibe;
}

/**
 * Build enrichment plan: which placeIds to enrich (top N, excluding cached), and counts for logging.
 * Does not call Google; caller uses plan.placeIdsToEnrich for future Details calls.
 *
 * @param results - Ranked results (with placeId); take top N by order.
 * @param config - maxResultsToEnrich, etc.
 * @param cachedPlaceIds - Set of placeIds that already have valid cached hints (skip Details for these).
 */
export function getPlaceDetailsEnrichmentPlan(
  results: Array<{ placeId?: string }>,
  config: Pick<PlaceDetailsEnrichmentConfig, 'maxResultsToEnrich'>,
  cachedPlaceIds: Set<string> = new Set()
): PlaceDetailsEnrichmentPlan {
  const topN = Math.max(0, config.maxResultsToEnrich);
  const candidates = results.slice(0, topN);
  const candidateCount = candidates.length;

  const placeIdsToEnrich: string[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const r of candidates) {
    const placeId = r.placeId ?? '';
    if (!placeId) continue;
    if (cachedPlaceIds.has(placeId)) {
      cacheHits += 1;
      continue;
    }
    cacheMisses += 1;
    placeIdsToEnrich.push(placeId);
  }

  return {
    requested: true,
    placeIdsToEnrich,
    candidateCount,
    cacheHits,
    cacheMisses,
    skippedReason: null,
  };
}

/**
 * Full decision + plan: when not requested, returns plan with requested: false and skippedReason.
 * Use this from the integration hook.
 */
export function decidePlaceDetailsEnrichment(
  intentInput: PlaceDetailsEnrichmentIntentInput,
  results: Array<{ placeId?: string }>,
  config: PlaceDetailsEnrichmentConfig,
  cachedPlaceIds: Set<string> = new Set()
): PlaceDetailsEnrichmentPlan {
  const requested = shouldRunPlaceDetailsEnrichment(intentInput, config);
  if (!requested) {
    return {
      requested: false,
      placeIdsToEnrich: [],
      candidateCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      skippedReason: 'not_requested',
    };
  }
  if (!results.length) {
    return {
      requested: true,
      placeIdsToEnrich: [],
      candidateCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      skippedReason: 'no_candidates',
    };
  }
  return getPlaceDetailsEnrichmentPlan(results, config, cachedPlaceIds);
}

/**
 * Build intent input from intent + post-constraints (for use by orchestrator).
 * No backend assumptions beyond DTO fields.
 */
export function buildPlaceDetailsIntentInput(params: {
  dietaryPreferences?: string[];
  isKosher?: boolean | null;
  isGlutenFree?: boolean | null;
  hasVibeIntent?: boolean;
}): PlaceDetailsEnrichmentIntentInput {
  return {
    hasDietaryIntent: Array.isArray(params.dietaryPreferences) && params.dietaryPreferences.length > 0,
    isKosherRequested: params.isKosher === true,
    isGlutenFreeRequested: params.isGlutenFree === true,
    hasVibeIntent: params.hasVibeIntent === true,
  };
}
