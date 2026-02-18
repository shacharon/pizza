/**
 * Lock Service
 * Redis-based distributed locking for background job idempotency
 * 
 * Extracted from wolt-enrichment.service.ts and tenbis-enrichment.service.ts
 * to eliminate duplication and centralize lock acquisition logic.
 */

import type { Redis as RedisClient } from 'ioredis';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Lock acquisition result
 */
export interface LockResult {
  acquired: boolean;
  reason: 'acquired' | 'held' | 'error';
  error?: string;
}

/**
 * Attempt to acquire distributed lock for background job
 * 
 * Uses Redis SET NX (set if not exists) with TTL for automatic expiration.
 * This ensures only one job per key across all instances.
 * 
 * @param redis - Redis client
 * @param lockKey - Full Redis key for the lock (e.g., "wolt:lock:place123")
 * @param ttlSeconds - Lock TTL in seconds
 * @param eventPrefix - Prefix for log events (e.g., "wolt", "tenbis")
 * @param placeId - Place ID for logging (optional)
 * @returns Lock acquisition result with reason
 */
export async function tryAcquireLock(
  redis: RedisClient,
  lockKey: string,
  ttlSeconds: number,
  eventPrefix: string,
  placeId?: string
): Promise<LockResult> {
  try {
    const result = await redis.set(
      lockKey,
      '1',
      'EX',
      ttlSeconds,
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
        event: `${eventPrefix}_lock_error`,
        placeId,
        error,
      },
      `[${eventPrefix}] Lock acquisition error (non-fatal)`
    );
    return { acquired: false, reason: 'error', error };
  }
}

/**
 * Release distributed lock
 * 
 * @param redis - Redis client
 * @param lockKey - Full Redis key for the lock
 * @param eventPrefix - Prefix for log events (e.g., "wolt", "tenbis")
 * @param placeId - Place ID for logging (optional)
 */
export async function releaseLock(
  redis: RedisClient,
  lockKey: string,
  eventPrefix: string,
  placeId?: string
): Promise<void> {
  try {
    await redis.del(lockKey);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      {
        event: `${eventPrefix}_lock_release_error`,
        placeId,
        error,
      },
      `[${eventPrefix}] Lock release error (non-fatal)`
    );
  }
}
