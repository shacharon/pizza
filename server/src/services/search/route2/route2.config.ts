/**
 * Route2 pipeline configuration
 * Centralizes timeout and enrichment constants (env overrides with safe defaults)
 */

const PIPELINE_TIMEOUT_MS = Number(process.env.ROUTE2_PIPELINE_TIMEOUT_MS) || 45_000;
const MAX_RESULTS_TO_ENRICH = Math.max(1, parseInt(process.env.MAX_RESULTS_TO_ENRICH || '10', 10));
/** Early SUMMARY LLM per-call timeout (ms). Range 1200–1800. */
const SUMMARY_EARLY_TIMEOUT_MS = Math.min(1800, Math.max(1200, Number(process.env.ROUTE2_SUMMARY_EARLY_TIMEOUT_MS) || 1500));
/** MESSAGE_ONLY LLM per-call timeout (ms). Range 900–1200. */
const MESSAGE_ONLY_TIMEOUT_MS = Math.min(1200, Math.max(900, Number(process.env.ROUTE2_MESSAGE_ONLY_TIMEOUT_MS) || 1000));

/** Place Details enrichment (vibe/dietary): top N, TTL-based cache. Policy only; no API calls here. */
const PLACE_DETAILS_ENRICHMENT_MAX = Math.max(1, Math.min(10, parseInt(process.env.PLACE_DETAILS_ENRICHMENT_MAX || '5', 10)));
const PLACE_DETAILS_CACHE_TTL_MS = parseInt(process.env.PLACE_DETAILS_CACHE_TTL_MS || '86400000', 10); // 24h default

export const route2Config = {
  PIPELINE_TIMEOUT_MS,
  MAX_RESULTS_TO_ENRICH,
  SUMMARY_EARLY_TIMEOUT_MS,
  MESSAGE_ONLY_TIMEOUT_MS,
  /** Place Details enrichment policy (cost control). */
  placeDetailsEnrichment: {
    enabled: process.env.PLACE_DETAILS_ENRICHMENT_ENABLED !== 'false',
    maxResultsToEnrich: PLACE_DETAILS_ENRICHMENT_MAX,
    cacheTtlMs: PLACE_DETAILS_CACHE_TTL_MS,
    cacheKeyPrefix: process.env.PLACE_DETAILS_CACHE_KEY_PREFIX || 'pd:hints',
  },
} as const;
