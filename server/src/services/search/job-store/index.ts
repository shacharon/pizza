/**
 * Job Store Factory
 * DI: Choose between Redis and InMemory based on config
 */

import { getConfig } from '../../../config/env.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import type { ISearchJobStore } from './job-store.interface.js';
import { InMemorySearchJobStore } from './inmemory-search-job.store.js';
import { RedisSearchJobStore } from './redis-search-job.store.js';

let searchJobStoreInstance: ISearchJobStore | null = null;

/**
 * Get or create the search job store singleton
 * Uses Redis if enabled and configured, otherwise falls back to InMemory
 */
export function getSearchJobStore(): ISearchJobStore {
  if (searchJobStoreInstance) {
    return searchJobStoreInstance;
  }

  const config = getConfig();

  if (config.enableRedisJobStore && config.redisUrl) {
    logger.info({
      store: 'redis',
      redisUrl: config.redisUrl.replace(/:[^:@]+@/, ':****@'), // Hide password in logs
      ttlSeconds: config.redisJobTtlSeconds,
      msg: '[JobStore] Initializing Redis store'
    });

    try {
      searchJobStoreInstance = new RedisSearchJobStore(config.redisUrl, config.redisJobTtlSeconds);
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
      msg: '[JobStore] Initializing InMemory store'
    });
    searchJobStoreInstance = new InMemorySearchJobStore();
  }

  return searchJobStoreInstance;
}

/**
 * Singleton accessor
 */
export const searchJobStore = new Proxy({} as ISearchJobStore, {
  get(_, prop) {
    const store = getSearchJobStore();
    const value = (store as any)[prop];
    return typeof value === 'function' ? value.bind(store) : value;
  }
});
