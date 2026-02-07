/**
 * Shared Redis Client Factory
 * Provides a single Redis client instance to be reused across the application
 * (Cache, JobStore, etc.)
 */

import { Redis, type Redis as RedisClient } from 'ioredis';
import { logger } from '../logger/structured-logger.js';

let redisClientInstance: RedisClient | null = null;
let redisInitialized = false;

export interface RedisClientOptions {
  url: string;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  enableOfflineQueue?: boolean;
}

/**
 * Get or create the shared Redis client
 * @param options Redis connection options
 * @returns Redis client or null if connection fails
 */
export async function getRedisClient(options: RedisClientOptions): Promise<RedisClient | null> {
  if (redisClientInstance) {
    return redisClientInstance;
  }

  if (redisInitialized) {
    return redisClientInstance; // Already attempted, failed
  }

  redisInitialized = true;

  const {
    url,
    maxRetriesPerRequest = 2,
    connectTimeout = 2000,
    commandTimeout = 2000, // P1: Increased to 2s for reliability
    enableOfflineQueue = false
  } = options;

  try {
    logger.info({
      event: 'REDIS_INIT_ATTEMPT',
      redisUrl: url.replace(/:[^:@]+@/, ':****@'),
      msg: '[Redis] Attempting connection to shared client'
    });

    const redis = new Redis(url, {
      maxRetriesPerRequest,
      connectTimeout,
      commandTimeout,
      retryStrategy: (times: number) => {
        if (times > maxRetriesPerRequest) return null;
        return Math.min(times * 100, 500);
      },
      lazyConnect: true,
      enableOfflineQueue,
      enableReadyCheck: true
    });

    // Error handler
    redis.on('error', (err: Error) => {
      logger.warn({
        error: err.message,
        msg: '[Redis] Connection error (non-critical)'
      });
    });

    // Ready handler
    redis.on('ready', () => {
      logger.info({ msg: '[Redis] Client ready' });
    });

    // Attempt connection with timeout
    const connectPromise = redis.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout after 2s')), connectTimeout)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // Quick PING test
    const pingResult = await redis.ping();
    const connected = pingResult === 'PONG';

    if (connected) {
      logger.info({
        event: 'REDIS_CONNECTED',
        redisUrl: url.replace(/:[^:@]+@/, ':****@'),
        msg: '[Redis] ✓ Shared client connected successfully'
      });

      redisClientInstance = redis;
      return redis;
    } else {
      throw new Error('PING test failed');
    }
  } catch (err) {
    logger.warn({
      event: 'REDIS_CONNECTION_FAILED',
      error: (err as Error).message,
      msg: '[Redis] Failed to connect, services will degrade gracefully'
    });
    return null;
  }
}

/**
 * Get existing Redis client (must be initialized first via getRedisClient)
 * @returns Redis client or null
 */
export function getExistingRedisClient(): RedisClient | null {
  if (!redisClientInstance && !redisInitialized) {
    logger.warn(
      {
        event: 'redis_client_not_initialized',
        pid: process.pid,
        stack: new Error().stack?.split('\n').slice(2, 4).join('\n'),
      },
      '[Redis] getExistingRedisClient called before initialization - caller should use getRedisClient first'
    );
  }
  return redisClientInstance;
}

/**
 * Close the Redis connection (for graceful shutdown)
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClientInstance) {
    await redisClientInstance.quit();
    logger.info({ msg: '[Redis] Client connection closed' });
    redisClientInstance = null;
    redisInitialized = false;
  }
}
