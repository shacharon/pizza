/**
 * Google Maps Cache Manager
 * Handles cache service initialization and Promise.race cleanup
 */

import { GoogleCacheService } from '../../../../../lib/cache/googleCacheService.js';
import { RedisService } from '../../../../../infra/redis/redis.service.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

let cacheService: GoogleCacheService | null = null;
let cacheInitialized = false;

/**
 * P0 Fix: Wrapper for Promise.race that properly cleans up timeout
 * Prevents zombie promises and memory leaks from dangling timeouts
 * 
 * @param cachePromise - The cache operation promise
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result from cache or throws timeout error
 */
export async function raceWithCleanup<T>(
  cachePromise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  // CRITICAL FIX: Attach .catch() to cachePromise to prevent unhandled rejection
  // when timeout wins the race but cache rejects later
  void cachePromise.catch(() => {
    // Swallow rejection silently - error is already handled by the race winner
    // This prevents "[FATAL] Unhandled Promise Rejection" logs
  });

  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Cache operation timeout')), timeoutMs);
    });

    // Race between cache and timeout
    const result = await Promise.race([cachePromise, timeoutPromise]);

    return result;

  } finally {
    // P0 Fix: Always clear timeout to prevent memory leak
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    // Note: cachePromise continues running if it loses the race
    // This is acceptable - Redis will complete the operation
    // The catch handler above ensures no unhandled rejection warnings
  }
}

/**
 * Initialize cache service (singleton)
 */
export async function initializeCacheService(): Promise<void> {
  if (cacheInitialized) return;
  cacheInitialized = true;

  // Check if caching is enabled via environment flag
  const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false'; // Enabled by default
  if (!enableCache) {
    logger.info({
      event: 'CACHE_SERVICE_READY',
      hasRedis: false,
      cacheEnabled: false,
      msg: '[GoogleMapsCache] Caching disabled via ENABLE_GOOGLE_CACHE=false'
    });
    return;
  }

  // Get Redis URL from env or use default localhost
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  logger.info({
    event: 'CACHE_INIT_ATTEMPT',
    redisUrl: redisUrl.replace(/:[^:@]+@/, ':****@'),
    msg: '[GoogleMapsCache] Attempting Redis connection'
  });

  try {
    // Use shared Redis client (initialized by server.ts)
    const redis = RedisService.getClientOrNull();

    if (redis) {
      cacheService = new GoogleCacheService(redis, logger);
      logger.info({
        event: 'CACHE_SERVICE_READY',
        hasRedis: true,
        msg: '[GoogleMapsCache] ✓ Cache service active with shared Redis client'
      });
    } else {
      throw new Error('Shared Redis client not available (may still be initializing)');
    }
  } catch (err) {
    // Non-fatal: just disable caching
    logger.warn({
      event: 'CACHE_SERVICE_DISABLED',
      error: (err as Error).message,
      msg: '[GoogleMapsCache] Redis unavailable, caching disabled (non-fatal, will use direct Google API)'
    });
    cacheService = null;
  }
}

/**
 * Get cache service instance (null if disabled)
 * 
 * HARDENING: If cache service is null but not explicitly disabled,
 * attempt synchronous initialization (may be race condition on startup)
 */
export function getCacheService(): GoogleCacheService | null {
  // Fast path: Already initialized (success or explicitly disabled)
  if (cacheService !== null || cacheInitialized) {
    return cacheService;
  }

  // Slow path: Not initialized yet (race condition on startup)
  // Check if caching is explicitly disabled
  const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false';
  if (!enableCache) {
    cacheInitialized = true; // Mark as initialized (disabled)
    logger.debug({
      event: 'cache_service_check',
      reason: 'explicitly_disabled'
    }, '[GoogleMapsCache] Cache disabled via env flag');
    return null;
  }

  // Attempt synchronous initialization (last resort)
  try {
    const redis = RedisService.getClientOrNull();
    if (redis) {
      cacheService = new GoogleCacheService(redis, logger);
      cacheInitialized = true;
      logger.info({
        event: 'CACHE_SERVICE_READY',
        hasRedis: true,
        initTrigger: 'lazy_sync',
        msg: '[GoogleMapsCache] ✓ Cache service initialized synchronously'
      });
      return cacheService;
    } else {
      // Redis not available - fail closed (disabled)
      cacheInitialized = true;
      logger.warn({
        event: 'cache_service_not_available',
        reason: 'redis_client_null',
        msg: '[GoogleMapsCache] Redis client not available, caching disabled'
      });
      return null;
    }
  } catch (err) {
    // Initialization failed - fail closed (disabled)
    cacheInitialized = true;
    logger.warn({
      event: 'cache_service_not_available',
      reason: 'init_error',
      error: (err as Error).message,
      msg: '[GoogleMapsCache] Cache init failed, caching disabled'
    });
    return null;
  }
}

// Initialize cache on module load (non-blocking)
initializeCacheService().catch((err) => {
  logger.warn({
    error: err.message,
    msg: '[GoogleMapsCache] Cache initialization failed (non-fatal)'
  });
});
