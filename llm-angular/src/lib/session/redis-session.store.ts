/**
 * Redis Session Store
 * Server-authoritative session management with Redis backend
 * 
 * NO IN-MEMORY FALLBACK - Redis is required
 * Sessions have 7-day sliding TTL
 * 
 * Redis Key Pattern: session:{sessionId}
 */

import type { Redis as RedisClient } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger/structured-logger.js';
import { getExistingRedisClient } from '../redis/redis-client.js';

/**
 * Custom error class for Redis unavailability
 * Used to distinguish Redis connectivity errors from other errors
 */
export class RedisUnavailableError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

/**
 * Detect if an error is a Redis connectivity error
 * 
 * Matches:
 * - ECONNREFUSED (connection refused)
 * - ETIMEDOUT (connection timeout)
 * - ENOTFOUND (DNS resolution failed)
 * - Connection closed / Connection is closed
 * - Socket closed unexpectedly
 * - ioredis ReplyError with connection-related messages
 * 
 * @param error - Error to check
 * @returns true if Redis connectivity error
 */
export function isRedisConnectivityError(error: unknown): boolean {
  if (!error) return false;
  
  const err = error as any;
  
  // Check error code (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, etc.)
  if (err.code === 'ECONNREFUSED' || 
      err.code === 'ETIMEDOUT' || 
      err.code === 'ENOTFOUND' ||
      err.errno === 'ECONNREFUSED' ||
      err.errno === 'ETIMEDOUT') {
    return true;
  }
  
  // Check error message for connection-related keywords
  const message = (err.message || '').toLowerCase();
  if (message.includes('connection closed') ||
      message.includes('connection is closed') ||
      message.includes('socket closed') ||
      message.includes('connect etimedout') ||
      message.includes('connect econnrefused')) {
    return true;
  }
  
  // Check ioredis-specific status
  if (err.name === 'AbortError' || err.name === 'ReplyError') {
    return true;
  }
  
  return false;
}

/**
 * Session structure stored in Redis
 */
export interface Session {
  sessionId: string;
  userId?: string;
  createdAt: number;
  lastSeen: number;
}

/**
 * Session store configuration
 */
export interface SessionStoreConfig {
  ttlSeconds: number; // Default: 7 days (604800)
  keyPrefix: string;  // Default: 'session:'
}

const DEFAULT_CONFIG: SessionStoreConfig = {
  ttlSeconds: 7 * 24 * 60 * 60, // 7 days
  keyPrefix: 'session:'
};

/**
 * Redis Session Store
 * Singleton pattern - use getSessionStore() to get instance
 */
export class RedisSessionStore {
  private readonly config: SessionStoreConfig;
  private redis: RedisClient | null = null;

  constructor(config: Partial<SessionStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize Redis connection
   * MUST be called before any operations
   */
  initialize(): void {
    this.redis = getExistingRedisClient();
    
    if (!this.redis) {
      logger.error({
        event: 'session_store_init_failed',
        reason: 'redis_not_available'
      }, '[SessionStore] CRITICAL: Redis not available - sessions will not work');
    } else {
      logger.info({
        event: 'session_store_initialized',
        ttlSeconds: this.config.ttlSeconds,
        keyPrefix: this.config.keyPrefix
      }, '[SessionStore] Initialized with Redis backend');
    }
  }

  /**
   * Create a new session
   * 
   * @param userId - Optional user ID to associate with session
   * @returns Session ID (UUID format)
   * @throws RedisUnavailableError if Redis unavailable/disconnected
   * @throws Error for other errors
   */
  async createSession(userId?: string): Promise<string> {
    if (!this.redis) {
      throw new RedisUnavailableError('Redis not available - cannot create session');
    }

    const sessionId = randomUUID();
    const now = Date.now();

    const session: Session = {
      sessionId,
      ...(userId && { userId }), // Only add userId if provided
      createdAt: now,
      lastSeen: now
    };

    const redisKey = this.getRedisKey(sessionId);
    
    try {
      await this.redis.setex(
        redisKey,
        this.config.ttlSeconds,
        JSON.stringify(session)
      );

      logger.info({
        event: 'session_created',
        sessionId: sessionId.substring(0, 12) + '...',
        hasUserId: Boolean(userId),
        ttlSeconds: this.config.ttlSeconds
      }, '[SessionStore] Session created');

      return sessionId;
    } catch (error) {
      // Detect Redis connectivity errors and re-throw as RedisUnavailableError
      if (isRedisConnectivityError(error)) {
        logger.error({
          event: 'session_create_failed_redis_down',
          sessionId: sessionId.substring(0, 12) + '...',
          error: error instanceof Error ? error.message : 'unknown',
          errorCode: (error as any)?.code || 'unknown'
        }, '[SessionStore] Failed to create session - Redis unavailable');
        throw new RedisUnavailableError(
          'Redis connection failed during session creation',
          error instanceof Error ? error : undefined
        );
      }
      
      // Other errors (JSON serialization, etc.) - re-throw as-is
      logger.error({
        event: 'session_create_failed',
        sessionId: sessionId.substring(0, 12) + '...',
        error: error instanceof Error ? error.message : 'unknown'
      }, '[SessionStore] Failed to create session');
      throw error;
    }
  }

  /**
   * Get session by ID
   * 
   * @param sessionId - Session ID
   * @returns Session object or null if not found/expired
   * @throws RedisUnavailableError if Redis unavailable/disconnected
   */
  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.redis) {
      throw new RedisUnavailableError('Redis not available - cannot get session');
    }

    const redisKey = this.getRedisKey(sessionId);

    try {
      const data = await this.redis.get(redisKey);

      if (!data) {
        logger.debug({
          event: 'session_not_found',
          sessionId: sessionId.substring(0, 12) + '...'
        }, '[SessionStore] Session not found or expired');
        return null;
      }

      const session = JSON.parse(data) as Session;

      logger.debug({
        event: 'session_validated',
        sessionId: sessionId.substring(0, 12) + '...',
        hasUserId: Boolean(session.userId),
        ageSeconds: Math.floor((Date.now() - session.createdAt) / 1000)
      }, '[SessionStore] Session retrieved');

      return session;
    } catch (error) {
      // Detect Redis connectivity errors and re-throw as RedisUnavailableError
      if (isRedisConnectivityError(error)) {
        logger.error({
          event: 'session_get_failed_redis_down',
          sessionId: sessionId.substring(0, 12) + '...',
          error: error instanceof Error ? error.message : 'unknown',
          errorCode: (error as any)?.code || 'unknown'
        }, '[SessionStore] Failed to get session - Redis unavailable');
        throw new RedisUnavailableError(
          'Redis connection failed during session lookup',
          error instanceof Error ? error : undefined
        );
      }
      
      // Other errors (JSON parse, etc.) - log and return null
      logger.error({
        event: 'session_get_error',
        sessionId: sessionId.substring(0, 12) + '...',
        error: error instanceof Error ? error.message : 'unknown'
      }, '[SessionStore] Failed to get session');
      return null;
    }
  }

  /**
   * Touch session (update lastSeen and extend TTL)
   * 
   * @param sessionId - Session ID
   */
  async touchSession(sessionId: string): Promise<void> {
    if (!this.redis) {
      return; // Silent fail - session will eventually expire
    }

    const redisKey = this.getRedisKey(sessionId);

    try {
      // Get existing session
      const data = await this.redis.get(redisKey);
      
      if (!data) {
        return; // Session doesn't exist or expired
      }

      const session = JSON.parse(data) as Session;
      session.lastSeen = Date.now();

      // Update with extended TTL
      await this.redis.setex(
        redisKey,
        this.config.ttlSeconds,
        JSON.stringify(session)
      );

      logger.debug({
        event: 'session_touched',
        sessionId: sessionId.substring(0, 12) + '...',
        ttlSeconds: this.config.ttlSeconds
      }, '[SessionStore] Session touched (TTL extended)');
    } catch (error) {
      logger.warn({
        event: 'session_touch_failed',
        sessionId: sessionId.substring(0, 12) + '...',
        error: error instanceof Error ? error.message : 'unknown'
      }, '[SessionStore] Failed to touch session');
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Delete session (logout)
   * 
   * @param sessionId - Session ID
   * @throws RedisUnavailableError if Redis unavailable/disconnected
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.redis) {
      throw new RedisUnavailableError('Redis not available - cannot delete session');
    }

    const redisKey = this.getRedisKey(sessionId);

    try {
      await this.redis.del(redisKey);

      logger.info({
        event: 'session_deleted',
        sessionId: sessionId.substring(0, 12) + '...'
      }, '[SessionStore] Session deleted');
    } catch (error) {
      // Detect Redis connectivity errors
      if (isRedisConnectivityError(error)) {
        logger.error({
          event: 'session_delete_failed_redis_down',
          sessionId: sessionId.substring(0, 12) + '...',
          error: error instanceof Error ? error.message : 'unknown',
          errorCode: (error as any)?.code || 'unknown'
        }, '[SessionStore] Failed to delete session - Redis unavailable');
        throw new RedisUnavailableError(
          'Redis connection failed during session deletion',
          error instanceof Error ? error : undefined
        );
      }
      
      // Other errors
      logger.error({
        event: 'session_delete_failed',
        sessionId: sessionId.substring(0, 12) + '...',
        error: error instanceof Error ? error.message : 'unknown'
      }, '[SessionStore] Failed to delete session');
      throw error;
    }
  }

  /**
   * Get Redis key for session
   */
  private getRedisKey(sessionId: string): string {
    return `${this.config.keyPrefix}${sessionId}`;
  }

  /**
   * Check if Redis is available and connected
   * 
   * Checks:
   * 1. Redis client instance exists
   * 2. Redis connection status is 'ready' (connected and authenticated)
   */
  isAvailable(): boolean {
    if (!this.redis) {
      return false;
    }
    
    // Check ioredis connection status
    // 'ready' = connected and ready to accept commands
    // Other states: 'connecting', 'connect', 'reconnecting', 'disconnecting', 'close', 'end', 'wait'
    const status = this.redis.status;
    const isReady = status === 'ready';
    
    if (!isReady) {
      logger.warn({
        event: 'session_store_redis_not_ready',
        status,
        message: 'Redis client exists but not in ready state'
      }, '[SessionStore] Redis not ready');
    }
    
    return isReady;
  }
}

/**
 * Singleton session store instance
 */
let sessionStoreInstance: RedisSessionStore | null = null;

/**
 * Get or create session store singleton
 * 
 * @param config - Optional config override
 * @returns Session store instance
 */
export function getSessionStore(config?: Partial<SessionStoreConfig>): RedisSessionStore {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new RedisSessionStore(config);
  }
  return sessionStoreInstance;
}

/**
 * Initialize session store with Redis
 * MUST be called during server boot after Redis is initialized
 */
export function initializeSessionStore(config?: Partial<SessionStoreConfig>): RedisSessionStore {
  const store = getSessionStore(config);
  store.initialize();
  return store;
}
