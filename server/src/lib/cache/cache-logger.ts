/**
 * Cache Logging Contract
 * Standardized cache event logging for observability
 */

import crypto from 'crypto';
import type { Logger } from 'pino';

export type CacheTier = 'L1' | 'L2' | 'NONE';
export type CacheSource = 'memory' | 'redis' | 'fetch';
export type CacheServedFrom = 'cache' | 'google_api';

export interface CacheLogContext {
  requestId: string;
  traceId?: string;
  stage: string;
  providerMethod: string;
}

export interface RedisConnectionInfo {
  enabled: boolean;
  connected: boolean;
  urlRedacted: string;
  host: string;
  port: string;
  commandTimeoutMs: number;
}

/**
 * Hash a cache key for logging (never log raw keys)
 */
export function hashCacheKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 12);
}

/**
 * Redact Redis URL (remove credentials)
 */
export function redactRedisUrl(url: string): { urlRedacted: string; host: string; port: string } {
  try {
    const parsed = new URL(url);
    return {
      urlRedacted: `redis://${parsed.hostname}:${parsed.port || '6379'}`,
      host: parsed.hostname,
      port: parsed.port || '6379'
    };
  } catch {
    return {
      urlRedacted: 'redis://[invalid-url]',
      host: 'unknown',
      port: 'unknown'
    };
  }
}

/**
 * Standardized cache event logger
 */
export class CacheLogger {
  constructor(private logger: Logger) {}

  /**
   * Log cache wrap entry
   */
  wrapEnter(ctx: CacheLogContext, cacheKeyHash: string, ttlSeconds: number): void {
    this.logger.info({
      ...ctx,
      event: 'CACHE_WRAP_ENTER',
      cacheKeyHash,
      ttlSeconds
    });
  }

  /**
   * Log cache HIT
   */
  hit(
    ctx: CacheLogContext,
    cacheKeyHash: string,
    cacheTier: CacheTier,
    source: CacheSource,
    opts: {
      ttlRemainingSec?: number;
      cacheAgeMs?: number;
    }
  ): void {
    this.logger.info({
      ...ctx,
      event: 'CACHE_HIT',
      cacheKeyHash,
      cacheTier,
      source,
      ...opts
    });
  }

  /**
   * Log cache MISS
   */
  miss(ctx: CacheLogContext, cacheKeyHash: string): void {
    this.logger.info({
      ...ctx,
      event: 'CACHE_MISS',
      cacheKeyHash,
      cacheTier: 'NONE',
      source: 'fetch'
    });
  }

  /**
   * Log cache STORE
   */
  store(
    ctx: CacheLogContext,
    cacheKeyHash: string,
    cacheTier: CacheTier,
    ttlSeconds: number,
    isEmpty?: boolean
  ): void {
    this.logger.info({
      ...ctx,
      event: 'CACHE_STORE',
      cacheKeyHash,
      cacheTier,
      ttlSeconds,
      ...(isEmpty !== undefined && { isEmpty })
    });
  }

  /**
   * Log cache wrap exit
   */
  wrapExit(
    ctx: CacheLogContext,
    cacheKeyHash: string,
    servedFrom: CacheServedFrom,
    cacheHitTier: CacheTier | null,
    durationMs: number
  ): void {
    this.logger.info({
      ...ctx,
      event: 'CACHE_WRAP_EXIT',
      cacheKeyHash,
      servedFrom,
      cacheHitTier,
      cacheTier: cacheHitTier || 'NONE',
      durationMs
    });
  }

  /**
   * Log cache error (non-fatal)
   */
  error(ctx: CacheLogContext, error: string, details?: Record<string, any>): void {
    this.logger.warn({
      ...ctx,
      event: 'CACHE_ERROR',
      error,
      ...details
    });
  }

  /**
   * Log Redis connection lifecycle (ONCE per process, not per request)
   */
  static logRedisConnection(
    logger: Logger,
    event: 'REDIS_CONNECTING' | 'REDIS_READY' | 'REDIS_ERROR' | 'REDIS_RECONNECTING',
    info: Partial<RedisConnectionInfo>,
    error?: string
  ): void {
    logger.info({
      event,
      redis: info,
      ...(error && { error })
    });
  }
}
