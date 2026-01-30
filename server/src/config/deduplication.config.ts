/**
 * Deduplication Configuration
 * Controls job reuse behavior for duplicate search requests
 */

const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

/**
 * Maximum age for RUNNING jobs to be considered valid for reuse
 * Jobs older than this are considered stale and will not be reused
 * 
 * Dev: 90s (shorter for faster feedback during testing)
 * Prod: 300s (5 minutes, allows for slower LLM responses)
 */
export const DEDUP_RUNNING_MAX_AGE_MS = isDev ? 90_000 : 300_000;

/**
 * Fresh window for DONE_SUCCESS jobs (results cached and immediately reusable)
 * Default: 5 seconds
 */
export const DEDUP_SUCCESS_FRESH_WINDOW_MS = 5_000;

/**
 * Log decisions for observability
 */
export function getDeduplicationConfig() {
  return {
    runningMaxAgeMs: DEDUP_RUNNING_MAX_AGE_MS,
    successFreshWindowMs: DEDUP_SUCCESS_FRESH_WINDOW_MS,
    env: isDev ? 'development' : 'production'
  };
}
