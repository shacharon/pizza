/**
 * Wolt Link Enrichment - Data Contracts & Types
 * 
 * Design: Redis-cached, non-blocking enrichment with WebSocket patch events
 * - Initial response: restaurants with wolt.status='PENDING' if cache miss
 * - Background job: matches restaurant → Wolt link, stores in Redis
 * - WS event: RESULT_PATCH updates specific restaurant by placeId
 * 
 * No DB. TTL-based cache only.
 */

// ============================================================================
// 1. Restaurant DTO Extension
// ============================================================================

/**
 * Wolt enrichment status for a single restaurant
 * 
 * Lifecycle:
 * - PENDING: Enrichment in progress (cache miss, job triggered)
 * - FOUND: Wolt link found and cached
 * - NOT_FOUND: No Wolt link exists (cached negative result)
 */
export type WoltEnrichmentStatus = 'FOUND' | 'NOT_FOUND' | 'PENDING';

/**
 * Wolt enrichment data attached to RestaurantResult
 * 
 * Usage:
 * ```ts
 * interface RestaurantResult {
 *   // ... existing fields
 *   wolt?: WoltEnrichment;  // Optional: only present if enrichment attempted
 * }
 * ```
 */
export interface WoltEnrichment {
  /**
   * Enrichment status
   * - PENDING: Background job running, check WS for updates
   * - FOUND: url field contains valid Wolt link
   * - NOT_FOUND: No Wolt presence for this restaurant
   */
  status: WoltEnrichmentStatus;

  /**
   * Wolt restaurant page URL
   * - null if status='NOT_FOUND' or status='PENDING'
   * - Valid URL string if status='FOUND'
   */
  url: string | null;
}

// ============================================================================
// 2. WebSocket RESULT_PATCH Event
// ============================================================================

/**
 * WebSocket event for patching individual restaurant results
 * 
 * Sent when:
 * - Wolt enrichment job completes (FOUND or NOT_FOUND)
 * - Future: Other async enrichments (reviews, photos, etc.)
 * 
 * Client behavior:
 * - Match restaurant by placeId
 * - Merge patch.wolt into existing restaurant.wolt
 * - Re-render affected card only
 */
/**
 * Provider enrichment state (matches search.types.ts)
 */
export interface ProviderState {
  status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
  url: string | null;
  updatedAt?: string; // ISO timestamp of last update (optional, only in patches)
}

export interface WSServerResultPatch {
  type: 'RESULT_PATCH';

  /**
   * Original search requestId (for subscription matching)
   */
  requestId: string;

  /**
   * Restaurant identifier (matches RestaurantResult.placeId)
   */
  placeId: string;

  /**
   * Partial update payload
   * Contains only fields that changed (currently: wolt only)
   */
  patch: {
    /**
     * NEW: Structured providers field
     */
    providers?: {
      wolt?: ProviderState;
    };
    /**
     * DEPRECATED: Legacy wolt field (kept for backward compatibility)
     * Wolt enrichment update
     * - status: 'FOUND' | 'NOT_FOUND' (never PENDING in patch)
     * - url: string | null
     */
    wolt?: {
      status: 'FOUND' | 'NOT_FOUND';
      url: string | null;
    };
  };
}

/**
 * Type guard for RESULT_PATCH events
 */
export function isResultPatchEvent(event: any): event is WSServerResultPatch {
  return (
    event &&
    typeof event === 'object' &&
    event.type === 'RESULT_PATCH' &&
    typeof event.requestId === 'string' &&
    typeof event.placeId === 'string' &&
    event.patch &&
    typeof event.patch === 'object' &&
    event.patch.wolt &&
    (event.patch.wolt.status === 'FOUND' || event.patch.wolt.status === 'NOT_FOUND') &&
    (event.patch.wolt.url === null || typeof event.patch.wolt.url === 'string')
  );
}

// ============================================================================
// 3. Redis Storage Schema
// ============================================================================

/**
 * Redis key patterns for Wolt enrichment cache
 * 
 * Namespace: provider:wolt:* (provider enrichment namespace)
 */
export const WOLT_REDIS_KEYS = {
  /**
   * Cache key for Wolt link by placeId
   * 
   * Pattern: provider:wolt:<placeId>
   * Example: provider:wolt:ChIJ7cv00DxMHRURm-NuI6SVf8k
   */
  place: (placeId: string): string => `provider:wolt:${placeId}`,

  /**
   * Anti-thrash lock to prevent duplicate parallel enrichment jobs
   * 
   * Pattern: provider:wolt:lock:<placeId>
   * Value: '1' (simple flag)
   * TTL: 60s (job should complete or fail within this window)
   * 
   * Usage:
   * - SET NX (only if not exists) before starting job
   * - If SET fails → job already running, skip duplicate work
   * - Lock auto-expires after 60s (handles crashed jobs)
   */
  lock: (placeId: string): string => `provider:wolt:lock:${placeId}`,
} as const;

/**
 * TTL constants for Wolt enrichment cache
 * 
 * Design rationale:
 * - FOUND: 7 days (Wolt links stable, but allow periodic refresh)
 * - NOT_FOUND: 24 hours (new restaurants may join Wolt frequently)
 * - LOCK: 60 seconds (enrichment job timeout, prevents thrashing)
 */
export const WOLT_CACHE_TTL_SECONDS = {
  /**
   * TTL for successful Wolt link match
   * 7 days = 604,800 seconds
   */
  FOUND: 7 * 24 * 60 * 60, // 7 days

  /**
   * TTL for negative result (restaurant not on Wolt)
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
 * Timeout and retry configuration for Wolt enrichment
 */
export const WOLT_JOB_CONFIG = {
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
 * Cached Wolt enrichment data (Redis value object)
 * 
 * Stored as JSON string in Redis
 */
export interface WoltCacheEntry {
  /**
   * Wolt restaurant URL (null if not found)
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

// ============================================================================
// 4. Integration Points
// ============================================================================

/**
 * Where RESULT_PATCH is consumed:
 * 
 * Backend:
 * - server/src/infra/websocket/websocket-protocol.ts
 *   → Add WSServerResultPatch to WSServerMessage union type
 * 
 * - server/src/services/search/wolt/wolt-enrichment.service.ts
 *   → Orchestrate: check cache → trigger job → publish patch
 * 
 * - server/src/services/search/wolt/wolt-matcher.worker.ts
 *   → Background job: Google Place → Wolt search → cache + WS publish
 * 
 * Frontend:
 * - llm-angular/src/app/features/unified-search/services/websocket.service.ts
 *   → Parse RESULT_PATCH, emit to result store
 * 
 * - llm-angular/src/app/features/unified-search/state/search-results.store.ts
 *   → Patch restaurant by placeId, trigger change detection
 * 
 * - llm-angular/src/app/features/unified-search/components/restaurant-card/
 *   → Show Wolt link when wolt.status='FOUND'
 */

/**
 * Example Redis operations:
 * 
 * 1. Check cache (in orchestrator):
 * ```ts
 * const key = WOLT_REDIS_KEYS.place(placeId);
 * const cached = await redis.get(key);
 * if (cached) {
 *   const entry: WoltCacheEntry = JSON.parse(cached);
 *   return { status: entry.status, url: entry.url };
 * }
 * return { status: 'PENDING', url: null }; // Trigger job
 * ```
 * 
 * 2. Acquire lock (in worker):
 * ```ts
 * const lockKey = WOLT_REDIS_KEYS.lock(placeId);
 * const acquired = await redis.set(lockKey, '1', 'EX', WOLT_CACHE_TTL_SECONDS.LOCK, 'NX');
 * if (!acquired) {
 *   logger.warn('Wolt enrichment already running for placeId');
 *   return; // Skip duplicate work
 * }
 * ```
 * 
 * 3. Store result (in worker):
 * ```ts
 * const cacheEntry: WoltCacheEntry = {
 *   url: woltUrl || null,
 *   status: woltUrl ? 'FOUND' : 'NOT_FOUND',
 *   updatedAt: new Date().toISOString()
 * };
 * const ttl = woltUrl 
 *   ? WOLT_CACHE_TTL_SECONDS.FOUND 
 *   : WOLT_CACHE_TTL_SECONDS.NOT_FOUND;
 * await redis.setex(
 *   WOLT_REDIS_KEYS.place(placeId),
 *   ttl,
 *   JSON.stringify(cacheEntry)
 * );
 * ```
 * 
 * 4. Publish WS patch (in worker):
 * ```ts
 * const patchEvent: WSServerResultPatch = {
 *   type: 'RESULT_PATCH',
 *   requestId,
 *   placeId,
 *   patch: {
 *     wolt: {
 *       status: cacheEntry.status,
 *       url: cacheEntry.url
 *     }
 *   }
 * };
 * wsManager.publishToChannel('search', requestId, undefined, patchEvent);
 * ```
 */

// ============================================================================
// 5. Acceptance Criteria Validation
// ============================================================================

/**
 * ✓ Initial response always returns restaurants immediately
 *   - Orchestrator fetches from Google → maps to RestaurantResult[]
 *   - Wolt enrichment happens async (non-blocking)
 * 
 * ✓ If cache miss: restaurant.wolt.status='PENDING', url=null
 *   - Check Redis key ext:wolt:place:<placeId>
 *   - Not found → attach { status: 'PENDING', url: null }
 *   - Trigger background job (if lock acquired)
 * 
 * ✓ When enrichment finishes: WS RESULT_PATCH updates only that restaurant
 *   - Job completes → store in Redis with TTL
 *   - Publish WSServerResultPatch with placeId
 *   - Client matches by placeId, merges patch.wolt
 * 
 * ✓ No database persistence
 *   - Only Redis (TTL-based eviction)
 *   - FOUND: 14d, NOT_FOUND: 24h
 * 
 * ✓ Anti-thrash lock prevents duplicate parallel jobs
 *   - ext:wolt:lock:<placeId> with 60s TTL
 *   - SET NX ensures single job per placeId
 */
