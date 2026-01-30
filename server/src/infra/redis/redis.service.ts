/**
 * Redis Service - Singleton Manager for Shared Redis Client
 * 
 * Purpose:
 * - Prevent /ws-ticket 503 spam after deploy/restart
 * - Enforce correct startup order (Redis before API listen)
 * - Provide fail-closed behavior in production
 * 
 * Usage:
 * ```typescript
 * // Server startup (before listen):
 * await RedisService.start({ url: REDIS_URL }, { timeout: 8000, env: 'production' });
 * 
 * // In services:
 * if (!RedisService.isReady()) {
 *   return res.status(503).json({ errorCode: 'WS_TICKET_REDIS_NOT_READY' });
 * }
 * const client = RedisService.getClientOrNull();
 * ```
 */

import { Redis, type Redis as RedisClient } from 'ioredis';
import { logger } from '../../lib/logger/structured-logger.js';

export interface RedisServiceOptions {
  url: string;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  enableOfflineQueue?: boolean;
}

export interface RedisStartupOptions {
  timeout?: number; // Total startup timeout (default: 8000ms)
  env?: 'production' | 'development' | 'staging';
  failClosed?: boolean; // Override fail-closed behavior (default: true in production)
}

class RedisServiceSingleton {
  private client: RedisClient | null = null;
  private startPromise: Promise<void> | null = null;
  private initError: Error | null = null;
  private started = false;

  /**
   * Start Redis connection (EAGER initialization)
   * Should be called once on server startup, before app.listen()
   * 
   * Behavior:
   * - Production: Fails closed (process.exit(1) if Redis unavailable)
   * - Development: Continues without Redis (degraded mode)
   * 
   * @param options Redis connection options
   * @param startupOptions Startup behavior (timeout, env, failClosed)
   * @throws Error if Redis connection fails in production
   */
  async start(
    options: RedisServiceOptions,
    startupOptions: RedisStartupOptions = {}
  ): Promise<void> {
    // Already started - return existing promise
    if (this.startPromise) {
      return this.startPromise;
    }

    // Create startup promise
    this.startPromise = this._start(options, startupOptions);
    return this.startPromise;
  }

  private async _start(
    options: RedisServiceOptions,
    startupOptions: RedisStartupOptions
  ): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    const {
      url,
      maxRetriesPerRequest = 2,
      connectTimeout = 2000,
      commandTimeout = 2000,
      enableOfflineQueue = false
    } = options;

    const {
      timeout = 8000,
      env = process.env.NODE_ENV || 'development',
      failClosed = env === 'production' // Fail-closed in production by default
    } = startupOptions;

    // Extract host:port for logging (no secrets)
    const urlMatch = url.match(/:\/\/([^@]+@)?([^/]+)/);
    const hostPort = urlMatch ? urlMatch[2] : 'unknown';

    logger.info({
      event: 'redis_connect_start',
      redisUrl: hostPort,
      env,
      failClosed,
      connectTimeout,
      startupTimeout: timeout
    }, '[RedisService] Starting Redis connection');

    const startTime = Date.now();

    try {
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

      // Error handler (non-fatal during normal operation)
      redis.on('error', (err: Error) => {
        // Only log if not during startup (startup errors are handled below)
        if (this.client) {
          logger.warn({
            event: 'redis_error',
            error: err.message
          }, '[RedisService] Redis error (non-fatal)');
        }
      });

      // Ready handler
      redis.on('ready', () => {
        logger.info({ event: 'redis_ready' }, '[RedisService] Redis client ready');
      });

      // Connect with startup timeout
      const connectPromise = redis.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Startup timeout after ${timeout}ms`)), timeout)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      // Verify connection with PING
      const pingResult = await redis.ping();
      if (pingResult !== 'PONG') {
        throw new Error('PING test failed');
      }

      const durationMs = Date.now() - startTime;

      logger.info({
        event: 'redis_connect_ok',
        redisUrl: hostPort,
        durationMs
      }, '[RedisService] ✓ Redis connected successfully');

      this.client = redis;
      this.initError = null;

    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.initError = err as Error;

      logger.error({
        event: 'redis_connect_fail',
        error: (err as Error).message,
        durationMs,
        redisUrl: hostPort,
        env,
        failClosed
      }, '[RedisService] Redis connection failed');

      this.client = null;

      // Fail-closed in production: exit process
      if (failClosed) {
        logger.fatal({
          event: 'redis_connect_fatal',
          error: (err as Error).message,
          env
        }, '[RedisService] FATAL: Redis required but unavailable - exiting process');

        // Give logger time to flush
        await new Promise(resolve => setTimeout(resolve, 100));

        process.exit(1);
      }

      // Development: log warning and continue (degraded mode)
      logger.warn({
        event: 'redis_connect_degraded',
        env
      }, '[RedisService] Continuing in degraded mode (development only)');
    }
  }

  /**
   * Check if Redis is ready
   * Fast, synchronous check for readiness
   */
  isReady(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * Get Redis client or null if not available
   * Safe to call anytime
   */
  getClientOrNull(): RedisClient | null {
    return this.client;
  }

  /**
   * Get initialization error (if any)
   */
  getError(): Error | null {
    return this.initError;
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info({ event: 'redis_closed' }, '[RedisService] Connection closed');
      this.client = null;
      this.startPromise = null;
      this.started = false;
      this.initError = null;
    }
  }
}

// Export singleton instance
export const RedisService = new RedisServiceSingleton();
