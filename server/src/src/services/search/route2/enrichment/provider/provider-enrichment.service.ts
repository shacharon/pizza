/**
 * Provider Enrichment Service (Generic)
 * 
 * Cache-first enrichment that attaches provider link data to restaurant results.
 * Supports multiple providers: wolt, tenbis, mishloha
 * 
 * - Checks Redis cache for each restaurant (by placeId)
 * - If cache hit: attach providers.{provider}.status/url from cache (FOUND | NOT_FOUND)
 * - If cache miss: attach providers.{provider}.status='PENDING', trigger background job
 * 
 * Idempotency: Redis locks (SET NX) ensure only one job per placeId across all instances
 * Non-blocking: Always returns immediately with enriched results
 */

import type { RestaurantResult } from '../../../types/restaurant.types.js';
import type { Route2Context } from '../../types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { getRedisClient } from '../../../../../lib/redis/redis-client.js';
import type { Redis as RedisClient } from 'ioredis';
import {
  PROVIDER_REDIS_KEYS,
  PROVIDER_CACHE_TTL_SECONDS,
  type ProviderCacheEntry,
  type ProviderEnrichment,
  type ProviderId,
  isProviderEnrichmentEnabled,
  getProviderDisplayName,
} from './provider.contracts.js';
import { tryAcquireLock } from '../lock-service.js';

/**
 * Structured log event types
 */
type ProviderEnrichmentEvent =
  | 'provider_cache_hit'
  | 'provider_cache_miss'
  | 'provider_lock_acquired'
  | 'provider_lock_skipped'
  | 'provider_enrichment_disabled'
  | 'provider_enrichment_error';

/**
 * Track config logging per provider (runs once per process per provider)
 */
const configLoggedMap = new Map<ProviderId, boolean>();

/**
 * Log structured event
 */
function logProviderEvent(
  providerId: ProviderId,
  event: ProviderEnrichmentEvent,
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
      providerId,
      ...data,
    },
    `[ProviderEnrichment:${providerId}] ${event}`
  );
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
 * Log config once per process per provider
 */
function logConfigOnce(providerId: ProviderId): void {
  if (configLoggedMap.get(providerId)) {
    return;
  }

  configLoggedMap.set(providerId, true);

  const displayName = getProviderDisplayName(providerId);

  logger.info(
    {
      event: 'provider_enrichment_config',
      providerId,
      enabledFlag: isProviderEnrichmentEnabled(providerId),
      hasRedisUrl: Boolean(process.env.REDIS_URL),
      redisUrlHost: redactRedisUrl(process.env.REDIS_URL),
    },
    `[${displayName}] Enrichment config`
  );
}

/**
 * Log when enqueue is skipped
 */
function logEnqueueSkipped(
  providerId: ProviderId,
  requestId: string,
  reason: 'flag_disabled' | 'no_results' | 'redis_down' | 'already_cached' | 'lock_held' | 'lock_error' | 'queue_unavailable',
  placeId?: string,
  cachedDetails?: { status: string; ageMs: number; hasUrl: boolean },
  errorDetails?: { error: string }
): void {
  logger.info(
    {
      event: 'provider_enqueue_skipped',
      providerId,
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
    `[ProviderEnrichment:${providerId}] Enqueue skipped: ${reason}`
  );
}

/**
 * Get Redis client for provider enrichment
 */
async function getProviderRedisClient(): Promise<RedisClient | null> {
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
 * Check cache for provider enrichment data
 * Returns cached data or null if not found
 */
async function checkProviderCache(
  redis: RedisClient,
  providerId: ProviderId,
  placeId: string
): Promise<ProviderEnrichment | null> {
  try {
    const key = PROVIDER_REDIS_KEYS.place(providerId, placeId);
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    const entry: ProviderCacheEntry = JSON.parse(cached);
    return {
      status: entry.status,
      url: entry.url,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      {
        event: 'provider_cache_read_error',
        providerId,
        placeId,
        error,
      },
      `[ProviderEnrichment:${providerId}] Cache read error (non-fatal)`
    );
    return null;
  }
}

/**
 * Lazy-initialized job queue instances per provider
 */
const jobQueueInstances = new Map<ProviderId, any>();

/**
 * Get or create job queue instance for provider (async for ESM dynamic import)
 */
async function getJobQueue(providerId: ProviderId): Promise<any> {
  const existing = jobQueueInstances.get(providerId);
  if (existing) {
    return existing;
  }

  // Lazy load provider-specific queue instance
  try {
    const { getProviderJobQueue } = await import('./provider-job-queue.instance.js');
    const queue = getProviderJobQueue(providerId);
    jobQueueInstances.set(providerId, queue);
    return queue;
  } catch (err) {
    logger.error(
      {
        event: 'provider_job_queue_init_error',
        providerId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      `[ProviderEnrichment:${providerId}] Failed to initialize job queue`
    );
    return null;
  }
}

/**
 * Trigger background provider matching job
 */
async function triggerMatchJob(
  providerId: ProviderId,
  requestId: string,
  restaurant: RestaurantResult,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  const queue = await getJobQueue(providerId);

  if (!queue) {
    logger.warn(
      {
        event: 'provider_job_queue_unavailable',
        providerId,
        requestId,
        placeId: restaurant.placeId,
      },
      `[ProviderEnrichment:${providerId}] Job queue unavailable, skipping background job`
    );
    logEnqueueSkipped(providerId, requestId, 'queue_unavailable', restaurant.placeId);
    return;
  }

  // Enqueue background job
  queue.enqueue({
    providerId,
    requestId,
    placeId: restaurant.placeId,
    name: restaurant.name,
    cityText,
    addressText: restaurant.address,
  });

  logger.info(
    {
      event: 'provider_job_enqueued',
      providerId,
      requestId,
      restaurantId: restaurant.placeId,
      placeId: restaurant.placeId,
      name: restaurant.name,
      cityText,
      statusSet: 'PENDING',
      reason: 'cache_miss',
    },
    `[ProviderEnrichment:${providerId}] Job enqueued`
  );
}

/**
 * Enrich a single restaurant with provider data
 * 
 * Steps:
 * 1. Check cache → populate providers.{provider} if found
 * 2. If miss → set PENDING, try acquire lock (idempotent key: provider:{provider}:lock:<placeId>)
 * 3. If lock acquired → enqueue background job (once per place)
 * 4. If lock held → skip (another worker handling it)
 */
async function enrichSingleRestaurant(
  redis: RedisClient,
  providerId: ProviderId,
  restaurant: RestaurantResult,
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  const { placeId, name: restaurantName } = restaurant;

  // 1. Check cache
  const cached = await checkProviderCache(redis, providerId, placeId);

  if (cached) {
    // Cache HIT: Attach cached data to structured providers field
    const providerState = {
      status: cached.status,
      url: cached.url,
    };
    
    restaurant.providers = {
      ...restaurant.providers,
      [providerId]: providerState,
    };
    
    logProviderEvent(providerId, 'provider_cache_hit', {
      requestId,
      placeId,
      restaurantName,
      cityText,
      status: cached.status,
    });

    // Read raw cache entry to get updatedAt for observability
    let cachedAgeMs = 0;
    try {
      const key = PROVIDER_REDIS_KEYS.place(providerId, placeId);
      const rawCached = await redis.get(key);
      if (rawCached) {
        const entry: ProviderCacheEntry = JSON.parse(rawCached);
        cachedAgeMs = Date.now() - new Date(entry.updatedAt).getTime();
      }
    } catch {
      // Ignore errors reading cache for log metadata
    }

    logEnqueueSkipped(providerId, requestId, 'already_cached', placeId, {
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
  
  restaurant.providers = {
    ...restaurant.providers,
    [providerId]: pendingState,
  };

  logProviderEvent(providerId, 'provider_cache_miss', {
    requestId,
    placeId,
    restaurantName,
    cityText,
  });

  // 2. Attempt to acquire lock
  const lockKey = PROVIDER_REDIS_KEYS.lock(providerId, placeId);
  const lockResult = await tryAcquireLock(
    redis,
    lockKey,
    PROVIDER_CACHE_TTL_SECONDS.LOCK,
    providerId,
    placeId
  );

  if (lockResult.acquired) {
    // Lock ACQUIRED: Trigger background job
    logProviderEvent(providerId, 'provider_lock_acquired', {
      requestId,
      placeId,
      restaurantName,
      cityText,
    });

    // Trigger background match job (non-blocking)
    void triggerMatchJob(providerId, requestId, restaurant, cityText, ctx);
  } else if (lockResult.reason === 'held') {
    // Lock HELD: Another worker is handling this restaurant (expected, idempotent)
    logProviderEvent(providerId, 'provider_lock_skipped', {
      requestId,
      placeId,
      restaurantName,
      cityText,
    });
    logEnqueueSkipped(providerId, requestId, 'lock_held', placeId);
  } else if (lockResult.reason === 'error') {
    // Lock ERROR: Redis error during lock acquisition (unexpected)
    // NOTE: Result stays PENDING - no retry mechanism in current design
    logger.warn(
      {
        event: 'provider_lock_failed',
        providerId,
        requestId,
        placeId,
        restaurantName,
        lockError: lockResult.error,
      },
      `[ProviderEnrichment:${providerId}] Lock acquisition failed, job not enqueued (result will stay PENDING)`
    );
    logEnqueueSkipped(providerId, requestId, 'lock_error', placeId, undefined, {
      error: lockResult.error || 'unknown',
    });
  }
}

/**
 * Enrich restaurant results with provider link data (cache-first, idempotent)
 * 
 * For each restaurant:
 * 1. Check Redis cache (provider:{providerId}:{placeId})
 *    - Hit: attach providers.{provider} with cached status/url
 *    - Miss: attach providers.{provider}.status='PENDING'
 * 2. On cache miss: attempt lock (provider:{providerId}:lock:{placeId}) for idempotency
 *    - Lock acquired: enqueue background match job (once per placeId)
 *    - Lock held: skip (another worker handling it, idempotent)
 * 
 * Idempotency Strategy:
 * - Redis lock key: provider:{providerId}:lock:{placeId} (TTL: 60s)
 * - SET NX (only if not exists) ensures single job per placeId
 * - Multiple concurrent requests for same place: only first acquires lock
 * - Job queue has secondary deduplication guard (safety net)
 * 
 * @param providerId Provider ID (wolt, tenbis, mishloha)
 * @param results Restaurant results to enrich (mutates in-place)
 * @param requestId Request ID for logging and WS events
 * @param cityText Optional city context from intent stage
 * @param ctx Route2 context
 * @returns Enriched results (same array, mutated)
 */
export async function enrichWithProviderLinks(
  providerId: ProviderId,
  results: RestaurantResult[],
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<RestaurantResult[]> {
  // Log config once per process per provider
  logConfigOnce(providerId);

  // Guard: Feature flag
  if (!isProviderEnrichmentEnabled(providerId)) {
    logProviderEvent(providerId, 'provider_enrichment_disabled', { requestId });
    logEnqueueSkipped(providerId, requestId, 'flag_disabled');
    return results;
  }

  // Guard: No results
  if (results.length === 0) {
    logEnqueueSkipped(providerId, requestId, 'no_results');
    return results;
  }

  // Guard: Redis not available
  const redis = await getProviderRedisClient();
  if (!redis) {
    logProviderEvent(providerId, 'provider_enrichment_error', {
      requestId,
      error: 'Redis not available',
    });
    logEnqueueSkipped(providerId, requestId, 'redis_down');
    return results;
  }

  // Enrich all restaurants in parallel
  try {
    await Promise.all(
      results.map((restaurant) =>
        enrichSingleRestaurant(redis, providerId, restaurant, requestId, cityText, ctx)
      )
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logProviderEvent(providerId, 'provider_enrichment_error', {
      requestId,
      error,
    });
    // Non-fatal: Return results even if enrichment fails
  }

  return results;
}
