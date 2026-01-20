/**
 * Job Store Factory
 * DI: Choose between Redis and InMemory based on config
 */

import { getConfig } from '../../../config/env.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { getRedisClient } from '../../../lib/redis/redis-client.js';
import type { ISearchJobStore } from './job-store.interface.js';
import { InMemorySearchJobStore } from './inmemory-search-job.store.js';
import { RedisSearchJobStore } from './redis-search-job.store.js';

let searchJobStoreInstance: ISearchJobStore | null = null;

/**
 * Get or create the search job store singleton
 * Uses Redis if enabled and configured, otherwise falls back to InMemory
 */
export async function getSearchJobStore(): Promise<ISearchJobStore> {
  if (searchJobStoreInstance) {
    return searchJobStoreInstance;
  }

  const config = getConfig();

  if (config.enableRedisJobStore && config.redisUrl) {
    logger.info({
      store: 'redis',
      redisUrl: config.redisUrl.replace(/:[^:@]+@/, ':****@'), // Hide password in logs
      ttlSeconds: config.redisJobTtlSeconds,
      enableRedisJobStore: config.enableRedisJobStore,
      msg: '[JobStore] Initializing Redis store'
    });

    try {
      // Get shared Redis client
      const redisClient = await getRedisClient({
        url: config.redisUrl,
        maxRetriesPerRequest: 3,
        connectTimeout: 2000,
        commandTimeout: 1000, // Longer timeout for JobStore operations
        enableOfflineQueue: false
      });

      if (redisClient) {
        searchJobStoreInstance = new RedisSearchJobStore(redisClient, config.redisJobTtlSeconds);
        logger.info({
          store: 'redis',
          msg: '[JobStore] ✓ Redis store initialized successfully'
        });
      } else {
        throw new Error('Redis client connection failed');
      }
    } catch (err) {
      logger.error({
        error: (err as Error).message,
        msg: '[JobStore] Failed to initialize Redis, falling back to InMemory'
      });
      searchJobStoreInstance = new InMemorySearchJobStore();
    }
  } else {
    logger.info({
      store: 'inmemory',
      enableRedisJobStore: config.enableRedisJobStore,
      hasRedisUrl: !!config.redisUrl,
      msg: '[JobStore] Initializing InMemory store'
    });
    searchJobStoreInstance = new InMemorySearchJobStore();
  }

  return searchJobStoreInstance;
}

/**
 * Singleton accessor with async initialization
 */
let cachedStorePromise: Promise<ISearchJobStore> | null = null;

export const searchJobStore = new Proxy({} as ISearchJobStore, {
  get(_, prop) {
    // Return a function that resolves the store first
    return async function(...args: any[]) {
      if (!cachedStorePromise) {
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
