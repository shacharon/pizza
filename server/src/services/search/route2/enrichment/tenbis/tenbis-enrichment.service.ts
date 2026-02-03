/**
 * 10bis Enrichment Service
 * 
 * Cache-first enrichment that attaches 10bis link data to restaurant results.
 * - Checks Redis cache for each restaurant (by placeId)
 * - If cache hit: attach providers.tenbis.status/url from cache (FOUND | NOT_FOUND)
 * - If cache miss: attach providers.tenbis.status='PENDING', trigger background job
 * 
 * Idempotency: Redis locks (SET NX) ensure only one job per placeId across all instances
 * Non-blocking: Always returns immediately with enriched results
 */

import type { RestaurantResult } from '../../../types/search.types.js';
import type { Route2Context } from '../../types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { getRedisClient } from '../../../../../lib/redis/redis-client.js';
import type { Redis as RedisClient } from 'ioredis';
import {
  TENBIS_REDIS_KEYS,
  TENBIS_CACHE_TTL_SECONDS,
  type TenbisCacheEntry,
  type TenbisEnrichment,
} from './tenbis-enrichment.contracts.js';

/**
 * Structured log event types
 */
type TenbisEnrichmentEvent =
  | 'tenbis_cache_hit'
  | 'tenbis_cache_miss'
  | 'tenbis_lock_acquired'
  | 'tenbis_lock_skipped'
  | 'tenbis_enrichment_disabled'
  | 'tenbis_enrichment_error';

/**
 * Track if config has been logged (runs once per process)
 */
let configLogged = false;

/**
 * Log structured event
 */
function logTenbisEvent(
  event: TenbisEnrichmentEvent,
  data: {
    requestId: string;
    placeId?: string;
    restaurantName?: string;
    cityText?: string | null;
    status?: string;
    error?: string;
  }
): void {
  const level = event.includes('error') ? 'warn' : 'debug';
  logger[level](
    {
      event,
      ...data,
    },
    `[TenbisEnrichment] ${event}`
  );
}

/**
 * Check if 10bis enrichment is enabled
 */
function isTenbisEnrichmentEnabled(): boolean {
  return process.env.ENABLE_TENBIS_ENRICHMENT === 'true';
}

/**
 * Redact Redis URL to show only protocol+host+port
 */
function redactRedisUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    // Return protocol + hostname + port (no credentials, no path)
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`;
  } catch {
    return 'invalid_url';
  }
}

/**
 * Log config once per process
 */
function logConfigOnce(): void {
  if (configLogged) {
    return;
  }

  configLogged = true;

  logger.info(
    {
      event: 'tenbis_enrichment_config',
      enabledFlag: process.env.ENABLE_TENBIS_ENRICHMENT === 'true',
      hasRedisUrl: Boolean(process.env.REDIS_URL),
      redisUrlHost: redactRedisUrl(process.env.REDIS_URL),
    },
    '[10BIS] Enrichment config'
  );
}

/**
 * Log when enqueue is skipped
 */
function logEnqueueSkipped(
  requestId: string,
  reason: 'flag_disabled' | 'no_results' | 'redis_down' | 'already_cached' | 'lock_held' | 'lock_error' | 'queue_unavailable',
  placeId?: string,
  cachedDetails?: { status: string; ageMs: number; hasUrl: boolean },
  errorDetails?: { error: string }
): void {
  logger.info(
    {
      event: 'tenbis_enqueue_skipped',
      requestId,
      reason,
      ...(placeId && { placeId }),
      ...(cachedDetails && {
        cachedStatus: cachedDetails.status,
        cachedAgeMs: cachedDetails.ageMs,
        cachedHasUrl: cachedDetails.hasUrl,
      }),
      ...(errorDetails && {
        lockError: errorDetails.error,
      }),
    },
    `[TenbisEnrichment] Enqueue skipped: ${reason}`
  );
}

/**
 * Get Redis client for 10bis enrichment
 */
async function getTenbisRedisClient(): Promise<RedisClient | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  return await getRedisClient({
    url: redisUrl,
    maxRetriesPerRequest: 2,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });
}

/**
 * Check cache for 10bis enrichment data
 * Returns cached data or null if not found
 */
async function checkTenbisCache(
  redis: RedisClient,
  placeId: string
): Promise<TenbisEnrichment | null> {
  try {
    const key = TENBIS_REDIS_KEYS.place(placeId);
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    const entry: TenbisCacheEntry = JSON.parse(cached);
    return {
      status: entry.status,
      url: entry.url,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      {
        event: 'tenbis_cache_read_error',
        placeId,
        error,
      },
      '[TenbisEnrichment] Cache read error (non-fatal)'
    );
    return null;
  }
}

/**
 * Lock acquisition result
 */
interface LockResult {
  acquired: boolean;
  reason: 'acquired' | 'held' | 'error';
  error?: string;
}

/**
 * Attempt to acquire lock for background job
 * Returns lock acquisition result with reason
 */
async function tryAcquireLock(
  redis: RedisClient,
  placeId: string
): Promise<LockResult> {
  try {
    const lockKey = TENBIS_REDIS_KEYS.lock(placeId);
    const result = await redis.set(
      lockKey,
      '1',
      'EX',
      TENBIS_CACHE_TTL_SECONDS.LOCK,
      'NX'
    );

    // Redis SET with NX returns 'OK' if set, null if key already exists
    if (result === 'OK') {
      return { acquired: true, reason: 'acquired' };
    } else {
      return { acquired: false, reason: 'held' };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      {
        event: 'tenbis_lock_error',
        placeId,
        error,
      },
      '[TenbisEnrichment] Lock acquisition error (non-fatal)'
    );
    return { acquired: false, reason: 'error', error };
  }
}

// Lazy-initialized job queue
let jobQueueInstance: any = null;

/**
 * Get or create job queue instance (async for ESM dynamic import)
 */
async function getJobQueue(): Promise<any> {
  if (jobQueueInstance) {
    return jobQueueInstance;
  }

  // Lazy load to avoid circular dependencies (ESM-safe dynamic import)
  try {
    const { getTenbisJobQueue } = await import('./tenbis-job-queue.instance.js');
    jobQueueInstance = getTenbisJobQueue();
    return jobQueueInstance;
  } catch (err) {
    logger.error(
      {
        event: 'tenbis_job_queue_init_error',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      '[TenbisEnrichment] Failed to initialize job queue'
    );
    return null;
  }
}

/**
 * Trigger background 10bis matching job
 */
async function triggerMatchJob(
  requestId: string,
  restaurant: RestaurantResult,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  const queue = await getJobQueue();

  if (!queue) {
    logger.warn(
      {
        event: 'tenbis_job_queue_unavailable',
        requestId,
        placeId: restaurant.placeId,
      },
      '[TenbisEnrichment] Job queue unavailable, skipping background job'
    );
    logEnqueueSkipped(requestId, 'queue_unavailable', restaurant.placeId);
    return;
  }

  // Enqueue background job
  queue.enqueue({
    requestId,
    placeId: restaurant.placeId,
    name: restaurant.name,
    cityText,
    addressText: restaurant.address,
  });

  logger.info(
    {
      event: 'tenbis_job_enqueued',
      requestId,
      restaurantId: restaurant.placeId,
      placeId: restaurant.placeId,
      name: restaurant.name,
      cityText,
      statusSet: 'PENDING',
      reason: 'cache_miss',
    },
    '[TenbisEnrichment] Job enqueued'
  );
}

/**
 * Enrich a single restaurant with 10bis data
 * 
 * Steps:
 * 1. Check cache → populate providers.tenbis if found
 * 2. If miss → set PENDING, try acquire lock (idempotent key: provider:tenbis:lock:<placeId>)
 * 3. If lock acquired → enqueue background job (once per place)
 * 4. If lock held → skip (another worker handling it)
 */
async function enrichSingleRestaurant(
  redis: RedisClient,
  restaurant: RestaurantResult,
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  const { placeId, name: restaurantName } = restaurant;

  // 1. Check cache
  const cached = await checkTenbisCache(redis, placeId);

  if (cached) {
    // Cache HIT: Attach cached data to structured providers field
    const providerState = {
      status: cached.status,
      url: cached.url,
    };
    
    // NEW: Structured providers field
    restaurant.providers = {
      ...restaurant.providers,
      tenbis: providerState,
    };
    
    logTenbisEvent('tenbis_cache_hit', {
      requestId,
      placeId,
      restaurantName,
      cityText,
      status: cached.status,
    });

    // Read raw cache entry to get updatedAt for observability
    let cachedAgeMs = 0;
    try {
      const key = TENBIS_REDIS_KEYS.place(placeId);
      const rawCached = await redis.get(key);
      if (rawCached) {
        const entry: TenbisCacheEntry = JSON.parse(rawCached);
        cachedAgeMs = Date.now() - new Date(entry.updatedAt).getTime();
      }
    } catch {
      // Ignore errors reading cache for log metadata
    }

    logEnqueueSkipped(requestId, 'already_cached', placeId, {
      status: cached.status,
      ageMs: cachedAgeMs,
      hasUrl: Boolean(cached.url),
    });
    return;
  }

  // Cache MISS: Attach PENDING status to structured providers field
  const pendingState = {
    status: 'PENDING' as const,
    url: null,
  };
  
  // NEW: Structured providers field
  restaurant.providers = {
    ...restaurant.providers,
    tenbis: pendingState,
  };

  logTenbisEvent('tenbis_cache_miss', {
    requestId,
    placeId,
    restaurantName,
    cityText,
  });

  // 2. Attempt to acquire lock
  const lockResult = await tryAcquireLock(redis, placeId);

  if (lockResult.acquired) {
    // Lock ACQUIRED: Trigger background job
    logTenbisEvent('tenbis_lock_acquired', {
      requestId,
      placeId,
      restaurantName,
      cityText,
    });

    // Trigger background match job (non-blocking)
    void triggerMatchJob(requestId, restaurant, cityText, ctx);
  } else if (lockResult.reason === 'held') {
    // Lock HELD: Another worker is handling this restaurant (expected, idempotent)
    logTenbisEvent('tenbis_lock_skipped', {
      requestId,
      placeId,
      restaurantName,
      cityText,
    });
    logEnqueueSkipped(requestId, 'lock_held', placeId);
  } else if (lockResult.reason === 'error') {
    // Lock ERROR: Redis error during lock acquisition (unexpected)
    // NOTE: Result stays PENDING - no retry mechanism in current design
    logger.warn(
      {
        event: 'tenbis_lock_failed',
        requestId,
        placeId,
        restaurantName,
        lockError: lockResult.error,
      },
      '[TenbisEnrichment] Lock acquisition failed, job not enqueued (result will stay PENDING)'
    );
    logEnqueueSkipped(requestId, 'lock_error', placeId, undefined, {
      error: lockResult.error || 'unknown',
    });
  }
}

/**
 * Enrich restaurant results with 10bis link data (cache-first, idempotent)
 * 
 * For each restaurant:
 * 1. Check Redis cache (provider:tenbis:place:<placeId>)
 *    - Hit: attach providers.tenbis with cached status/url
 *    - Miss: attach providers.tenbis.status='PENDING'
 * 2. On cache miss: attempt lock (provider:tenbis:lock:<placeId>) for idempotency
 *    - Lock acquired: enqueue background match job (once per placeId)
 *    - Lock held: skip (another worker handling it, idempotent)
 * 
 * Idempotency Strategy:
 * - Redis lock key: provider:tenbis:lock:<placeId> (TTL: 60s)
 * - SET NX (only if not exists) ensures single job per placeId
 * - Multiple concurrent requests for same place: only first acquires lock
 * - Job queue has secondary deduplication guard (safety net)
 * 
 * @param results Restaurant results to enrich (mutates in-place)
 * @param requestId Request ID for logging and WS events
 * @param cityText Optional city context from intent stage
 * @param ctx Route2 context
 * @returns Enriched results (same array, mutated)
 */
export async function enrichWithTenbisLinks(
  results: RestaurantResult[],
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<RestaurantResult[]> {
  // Log config once per process
  logConfigOnce();

  // Guard: Feature flag
  if (!isTenbisEnrichmentEnabled()) {
    logTenbisEvent('tenbis_enrichment_disabled', { requestId });
    logEnqueueSkipped(requestId, 'flag_disabled');
    return results;
  }

  // Guard: No results
  if (results.length === 0) {
    logEnqueueSkipped(requestId, 'no_results');
    return results;
  }

  // Guard: Redis not available
  const redis = await getTenbisRedisClient();
  if (!redis) {
    logTenbisEvent('tenbis_enrichment_error', {
      requestId,
      error: 'Redis not available',
    });
    logEnqueueSkipped(requestId, 'redis_down');
    return results;
  }

  // Enrich all restaurants in parallel
  try {
    await Promise.all(
      results.map((restaurant) =>
        enrichSingleRestaurant(redis, restaurant, requestId, cityText, ctx)
      )
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logTenbisEvent('tenbis_enrichment_error', {
      requestId,
      error,
    });
    // Non-fatal: Return results even if enrichment fails
  }

  return results;
}
