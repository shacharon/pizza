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
 * MUST be called after Redis is ready (called from server.ts boot sequence)
 */
export async function initializeCacheService(): Promise<void> {
  if (cacheInitialized) return;
  cacheInitialized = true;

  // Check if caching is enabled via environment flag
  const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false'; // Enabled by default
  if (!enableCache) {
    logger.info({
      event: 'CACHE_STARTUP',
      cacheEnabled: false,
      hasRedis: false,
      reason: 'explicitly_disabled',
      msg: '[GoogleMapsCache] ✗ Cache DISABLED via ENABLE_GOOGLE_CACHE=false'
    });
    return;
  }

  try {
    // Use shared Redis client (initialized by server.ts)
    const redis = RedisService.getClientOrNull();

    if (redis) {
      cacheService = new GoogleCacheService(redis, logger);
      logger.info({
        event: 'CACHE_STARTUP',
        cacheEnabled: true,
        hasRedis: true,
        reason: 'redis_available',
        msg: '[GoogleMapsCache] ✓ Cache ENABLED with shared Redis client'
      });
    } else {
      throw new Error('Shared Redis client not available');
    }
  } catch (err) {
    // Non-fatal: just disable caching
    logger.warn({
      event: 'CACHE_STARTUP',
      cacheEnabled: false,
      hasRedis: false,
      reason: 'redis_unavailable',
      error: (err as Error).message,
      msg: '[GoogleMapsCache] ✗ Cache DISABLED - Redis unavailable (non-fatal, will use direct Google API)'
    });
    cacheService = null;
  }
}

/**
 * Get cache service instance (null if disabled)
 * Returns null if cache is not initialized yet or explicitly disabled
 */
export function getCacheService(): GoogleCacheService | null {
  return cacheService;
}

// DO NOT auto-initialize on module load - causes race condition with Redis startup
// Cache must be initialized explicitly in server.ts AFTER Redis is ready
