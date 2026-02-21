/**
 * Route2 pipeline configuration
 * Centralizes timeout and enrichment constants (env overrides with safe defaults)
 */

const PIPELINE_TIMEOUT_MS = Number(process.env.ROUTE2_PIPELINE_TIMEOUT_MS) || 45_000;
const MAX_RESULTS_TO_ENRICH = Math.max(1, parseInt(process.env.MAX_RESULTS_TO_ENRICH || '10', 10));

export const route2Config = {
  PIPELINE_TIMEOUT_MS,
  MAX_RESULTS_TO_ENRICH,
} as const;
