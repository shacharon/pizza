/**
 * Job Store Factory
 * DI: Choose between Redis and InMemory based on config
 */

import { getConfig } from '../../../config/env.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { RedisService } from '../../../infra/redis/redis.service.js';
import type { ISearchJobStore } from './job-store.interface.js';
import { InMemorySearchJobStore } from './inmemory-search-job.store.js';
import { RedisSearchJobStore } from './redis-search-job.store.js';

// Singleton instance - initialized once per process, reused across all requests
let searchJobStoreInstance: ISearchJobStore | null = null;

/**
 * Get or create the search job store singleton
 * Uses Redis if enabled and configured, otherwise falls back to InMemory
 * 
 * IMPORTANT: This is a singleton - the store is initialized ONCE per process,
 * not per request. Subsequent calls return the cached instance immediately.
 * 
 * PRODUCTION SAFETY: In production, Redis JobStore is REQUIRED for multi-instance scale.
 * Deployment will fail if ENABLE_REDIS_JOBSTORE=true but Redis unavailable.
 */
export async function getSearchJobStore(): Promise<ISearchJobStore> {
  if (searchJobStoreInstance) {
    // Return cached singleton (no re-initialization)
    logger.debug({
      store: searchJobStoreInstance instanceof InMemorySearchJobStore ? 'inmemory' : 'redis',
      msg: '[JobStore] Returning cached singleton instance'
    });
    return searchJobStoreInstance;
  }

  const config = getConfig();
  const isProduction = config.env === 'production';

  // P0 Scale Safety: Enforce Redis in production for multi-instance deployments
  if (isProduction && !config.enableRedisJobStore) {
    throw new Error(
      '[P0 Scale] ENABLE_REDIS_JOBSTORE must be true in production for multi-instance ECS scale. ' +
      'In-memory JobStore does not support horizontal scaling. Set ENABLE_REDIS_JOBSTORE=true'
    );
  }

  if (isProduction && !config.redisUrl) {
    throw new Error(
      '[P0 Scale] REDIS_URL must be set in production when ENABLE_REDIS_JOBSTORE=true. ' +
      'Cannot deploy without Redis backend for job persistence across ECS tasks.'
    );
  }

  if (config.enableRedisJobStore && config.redisUrl) {
    logger.info({
      store: 'redis',
      redisUrl: config.redisUrl.replace(/:[^:@]+@/, ':****@'), // Hide password in logs
      ttlSeconds: config.redisJobTtlSeconds,
      enableRedisJobStore: config.enableRedisJobStore,
      msg: '[JobStore] Initializing Redis store'
    });

    try {
      // Get shared Redis client (should already be initialized by server.ts)
      const redisClient = RedisService.getClientOrNull();

      if (redisClient) {
        searchJobStoreInstance = new RedisSearchJobStore(redisClient, config.redisJobTtlSeconds);
        logger.info({
          store: 'redis',
          msg: '[JobStore] ✓ Redis store initialized with shared client'
        });
      } else {
        throw new Error('Redis client not available (initialization may not have completed)');
      }
    } catch (err) {
      logger.error({
        error: (err as Error).message,
        msg: '[JobStore] Failed to initialize Redis'
      });

      // P0 Scale Safety: Fail-closed in production (no in-memory fallback)
      if (isProduction) {
        throw new Error(
          `[P0 Scale] Redis JobStore initialization failed in production: ${(err as Error).message}. ` +
          'Deployment blocked to prevent data loss in multi-instance ECS. Fix Redis connection.'
        );
      }

      logger.warn({
        env: config.env,
        msg: '[JobStore] Falling back to InMemory (development only)'
      });
      searchJobStoreInstance = new InMemorySearchJobStore();
    }
  } else {
    // Should never reach here in production due to guard above
    logger.info({
      store: 'inmemory',
      env: config.env,
      enableRedisJobStore: config.enableRedisJobStore,
      hasRedisUrl: !!config.redisUrl,
      msg: '[JobStore] Initializing InMemory store (development only)'
    });
    searchJobStoreInstance = new InMemorySearchJobStore();
  }

  return searchJobStoreInstance;
}

/**
 * Singleton accessor with async initialization
 * Ensures only ONE initialization Promise is created, even with concurrent calls
 */
let cachedStorePromise: Promise<ISearchJobStore> | null = null;

export const searchJobStore = new Proxy({} as ISearchJobStore, {
  get(_, prop) {
    // Return a function that resolves the store first
    return async function (...args: any[]) {
      // Ensure only one initialization promise is created (prevents race conditions)
      if (!cachedStorePromise) {
        logger.info({ msg: '[JobStore] Creating singleton initialization promise' });
        cachedStorePromise = getSearchJobStore();
      }
      const store = await cachedStorePromise;
      const value = (store as any)[prop];
      if (typeof value === 'function') {
        return value.apply(store, args);
      }
      return value;
    };
  }
});
