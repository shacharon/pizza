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

export const route2Config = {
  PIPELINE_TIMEOUT_MS,
  MAX_RESULTS_TO_ENRICH,
  SUMMARY_EARLY_TIMEOUT_MS,
  MESSAGE_ONLY_TIMEOUT_MS,
} as const;
