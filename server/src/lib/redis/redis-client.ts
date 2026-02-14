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
  logger.info({
    event: 'GET_REDIS_CLIENT_CALLED',
    hasExistingInstance: !!redisClientInstance,
    alreadyInitialized: redisInitialized,
    msg: '[Redis] getRedisClient() function entry'
  });
  
  if (redisClientInstance) {
    return redisClientInstance;
  }

  if (redisInitialized) {
    return redisClientInstance; // Already attempted, failed
  }

  const {
    url,
    maxRetriesPerRequest = 2,
    connectTimeout = 2000,
    commandTimeout = 2000, // P1: Increased to 2s for reliability
    enableOfflineQueue = false
  } = options;

  try {
    // AWS ElastiCache TLS support: detect rediss:// and add TLS config
    const useTls = url.startsWith('rediss://');
    
    logger.info({
      event: 'REDIS_INIT_ATTEMPT',
      redisUrl: url.replace(/:[^:@]+@/, ':****@'),
      useTls,
      maxRetriesPerRequest,
      connectTimeout,
      commandTimeout,
      msg: '[Redis] Attempting connection to shared client'
    });

    logger.info({
      event: 'REDIS_CLIENT_CREATE_START',
      msg: '[Redis] About to create Redis client instance'
    });
    
    let redis: RedisClient;
    try {
      redis = new Redis(url, {
        maxRetriesPerRequest,
        connectTimeout,
        commandTimeout,
        retryStrategy: (times: number) => {
          if (times > maxRetriesPerRequest) return null;
          return Math.min(times * 100, 500);
        },
        lazyConnect: true,
        enableOfflineQueue,
        enableReadyCheck: true,
        // AWS ElastiCache with TLS requires rejectUnauthorized: false
        // because ElastiCache uses self-signed certificates
        ...(useTls && {
          tls: {
            rejectUnauthorized: false
          }
        })
      });
    } catch (instantiationError) {
      const err = instantiationError as Error;
      logger.error({
        event: 'REDIS_CLIENT_INSTANTIATION_FAILED',
        error: err.message,
        errorName: err.name,
        stack: err.stack,
        useTls,
        msg: '[Redis] CRITICAL: Failed to instantiate Redis client'
      });
      throw instantiationError;
    }

    logger.info({
      event: 'REDIS_CLIENT_CREATED',
      msg: '[Redis] Redis client instance created successfully'
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
      redisInitialized = true; // Only mark as initialized after successful connection
      return redis;
    } else {
      throw new Error('PING test failed');
    }
  } catch (err) {
    const error = err as Error & { code?: string; errno?: string | number };
    logger.warn({
      event: 'REDIS_CONNECTION_FAILED',
      error: error.message,
      errorCode: error.code,
      errorErrno: error.errno,
      errorName: error.name,
      useTls: url.startsWith('rediss://'),
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
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
