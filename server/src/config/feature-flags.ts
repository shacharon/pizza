/**
 * Feature flags for frontend (unified search, action proposals, etc.).
 * Single source of truth: backend reads from env; frontend gets flags via GET /api/v1/flags.
 *
 * Env vars (optional):
 * - UNIFIED_SEARCH: 'true' | 'false' — default: true (enabled in prod and dev)
 * - ACTION_PROPOSALS: 'true' | 'false' — default: false
 */

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Returns feature flags for the frontend. Same shape as expected by FlagsStore.
 */
export function getFeatureFlags(): Record<string, boolean> {
  const actionProposalsDefault = false;

  return {
    unifiedSearch: parseBool(process.env.UNIFIED_SEARCH, true),
    actionProposals: parseBool(process.env.ACTION_PROPOSALS, actionProposalsDefault),
  };
}
