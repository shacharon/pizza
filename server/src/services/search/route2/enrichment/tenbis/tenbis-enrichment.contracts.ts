/**
 * 10bis Link Enrichment - Data Contracts & Types
 * 
 * Design: Redis-cached, non-blocking enrichment with WebSocket patch events
 * - Initial response: restaurants with tenbis.status='PENDING' if cache miss
 * - Background job: matches restaurant → 10bis link, stores in Redis
 * - WS event: RESULT_PATCH updates specific restaurant by placeId
 * 
 * No DB. TTL-based cache only.
 */

// ============================================================================
// 1. Restaurant DTO Extension
// ============================================================================

/**
 * 10bis enrichment status for a single restaurant
 * 
 * Lifecycle:
 * - PENDING: Enrichment in progress (cache miss, job triggered)
 * - FOUND: 10bis link found and cached
 * - NOT_FOUND: No 10bis link exists (cached negative result)
 */
export type TenbisEnrichmentStatus = 'FOUND' | 'NOT_FOUND' | 'PENDING';

/**
 * 10bis enrichment data attached to RestaurantResult
 */
export interface TenbisEnrichment {
  /**
   * Enrichment status
   * - PENDING: Background job running, check WS for updates
   * - FOUND: url field contains valid 10bis link
   * - NOT_FOUND: No 10bis presence for this restaurant
   */
  status: TenbisEnrichmentStatus;

  /**
   * 10bis restaurant page URL
   * - null if status='NOT_FOUND' or status='PENDING'
   * - Valid URL string if status='FOUND'
   */
  url: string | null;
}

// ============================================================================
// 2. Redis Storage Schema
// ============================================================================

/**
 * Redis key patterns for 10bis enrichment cache
 * 
 * Namespace: provider:tenbis:* (provider enrichment namespace)
 */
export const TENBIS_REDIS_KEYS = {
  /**
   * Cache key for 10bis link by placeId
   * 
   * Pattern: provider:tenbis:<placeId>
   * Example: provider:tenbis:ChIJ7cv00DxMHRURm-NuI6SVf8k
   */
  place: (placeId: string): string => `provider:tenbis:${placeId}`,

  /**
   * Anti-thrash lock to prevent duplicate parallel enrichment jobs
   * 
   * Pattern: provider:tenbis:lock:<placeId>
   * Value: '1' (simple flag)
   * TTL: 60s (job should complete or fail within this window)
   */
  lock: (placeId: string): string => `provider:tenbis:lock:${placeId}`,
} as const;

/**
 * TTL constants for 10bis enrichment cache
 * 
 * Design rationale:
 * - FOUND: 7 days (10bis links stable, but allow periodic refresh)
 * - NOT_FOUND: 24 hours (new restaurants may join 10bis frequently)
 * - LOCK: 60 seconds (enrichment job timeout, prevents thrashing)
 */
export const TENBIS_CACHE_TTL_SECONDS = {
  /**
   * TTL for successful 10bis link match
   * 7 days = 604,800 seconds
   */
  FOUND: 7 * 24 * 60 * 60, // 7 days

  /**
   * TTL for negative result (restaurant not on 10bis)
   * 24 hours = 86,400 seconds
   */
  NOT_FOUND: 24 * 60 * 60, // 24 hours

  /**
   * TTL for anti-thrash lock
   * 60 seconds (job execution window)
   */
  LOCK: 60, // 60 seconds
} as const;

/**
 * Timeout and retry configuration for 10bis enrichment
 */
export const TENBIS_JOB_CONFIG = {
  /**
   * Overall job timeout (search + match + cache write)
   * 30 seconds total
   */
  JOB_TIMEOUT_MS: 30000,

  /**
   * Web search timeout (for adapter)
   * 20 seconds for search provider
   */
  SEARCH_TIMEOUT_MS: 20000,

  /**
   * Number of retry attempts on transient failures
   * 2 retries = 3 total attempts (initial + 2 retries)
   */
  MAX_RETRIES: 2,

  /**
   * Initial retry delay in milliseconds
   * Exponential backoff: 1s → 2s → 4s
   */
  RETRY_DELAY_MS: 1000,
} as const;

/**
 * Cached 10bis enrichment data (Redis value object)
 * 
 * Stored as JSON string in Redis
 */
export interface TenbisCacheEntry {
  /**
   * 10bis restaurant URL (null if not found)
   */
  url: string | null;

  /**
   * Cache status (determines TTL on write)
   */
  status: 'FOUND' | 'NOT_FOUND';

  /**
   * ISO timestamp of last cache update
   * For observability and manual cache invalidation
   */
  updatedAt: string;
}
