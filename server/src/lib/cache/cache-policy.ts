/**
 * Cache Policy (PURE)
 * Pure functions for cache TTL and retention policy decisions
 * 
 * Responsibility:
 * - Determine TTL based on query characteristics
 * - Determine empty result caching policy
 * - No side effects, no IO
 */

/**
 * Get TTL for a query based on time-sensitivity
 * Time-sensitive queries (e.g., "open now") get shorter TTL (5 min)
 * General queries get longer TTL (15 min)
 */
export function getTTLForQuery(query: string): number {
  const timeKeywords = ['open', 'now', 'פתוח', 'עכשיו'];
  const normalized = query.toLowerCase();
  const isTimeSensitive = timeKeywords.some(k => normalized.includes(k));
  return isTimeSensitive ? 300 : 900; // 5 min or 15 min
}

/**
 * Get TTL for empty results
 * Empty results get shorter TTL (2 min) to avoid caching transient failures
 */
export function getTTLForEmptyResults(): number {
  return 120; // 2 minutes
}

/**
 * Get L1 (in-memory) TTL
 * L1 cache has shorter TTL (max 60 seconds) for fresher data
 */
export function getL1TTL(baseTtlSeconds: number, isEmpty: boolean): number {
  if (isEmpty) {
    return 30; // 30 seconds for empty results
  }
  return Math.min(baseTtlSeconds, 60); // Cap at 60 seconds
}

/**
 * Determine if value represents empty results
 */
export function isEmptyResults(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}
