/**
 * Feature flags for frontend (unified search, action proposals, etc.).
 * Single source of truth: backend reads from env; frontend gets flags via GET /api/v1/flags.
 *
 * Env vars (optional):
 * - UNIFIED_SEARCH: 'true' | 'false' — default: true in development, false in production/staging
 * - ACTION_PROPOSALS: 'true' | 'false' — default: false
 */

function getEnv(): 'production' | 'staging' | 'development' | 'test' {
  const env = process.env.NODE_ENV || process.env.ENV || 'development';
  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'staging' || env === 'stage') return 'staging';
  if (env === 'test') return 'test';
  return 'development';
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Returns feature flags for the frontend. Same shape as expected by FlagsStore.
 */
export function getFeatureFlags(): Record<string, boolean> {
  const env = getEnv();
  const isDev = env === 'development';

  const unifiedSearchDefault = isDev;
  const actionProposalsDefault = false;

  return {
    unifiedSearch: parseBool(process.env.UNIFIED_SEARCH, unifiedSearchDefault),
    actionProposals: parseBool(process.env.ACTION_PROPOSALS, actionProposalsDefault),
  };
}
