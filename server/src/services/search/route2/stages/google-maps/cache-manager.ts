/**
 * Google Maps Cache Manager
 * Handles cache service initialization and Promise.race cleanup
 */

import { GoogleCacheService } from '../../../../../lib/cache/googleCacheService.js';
import { getRedisClient } from '../../../../../lib/redis/redis-client.js';
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
    // Use shared Redis client
    const redis = await getRedisClient({
      url: redisUrl,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      commandTimeout: 500, // 500ms command timeout for cache operations
      enableOfflineQueue: false
    });

    if (redis) {
      cacheService = new GoogleCacheService(redis, logger);
      logger.info({
        event: 'CACHE_SERVICE_READY',
        hasRedis: true,
        commandTimeout: 500,
        msg: '[GoogleMapsCache] ✓ Cache service active with shared Redis client'
      });
    } else {
      throw new Error('Shared Redis client unavailable');
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
 */
export function getCacheService(): GoogleCacheService | null {
  return cacheService;
}

// Initialize cache on module load (non-blocking)
initializeCacheService().catch((err) => {
  logger.warn({
    error: err.message,
    msg: '[GoogleMapsCache] Cache initialization failed (non-fatal)'
  });
});
