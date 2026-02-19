/**
 * Rate Limiting Middleware
 * Supports both Redis-backed (distributed) and in-memory (single-instance) rate limiting
 * 
 * Strategy: Token bucket per IP address
 * Default: 60 requests per minute per IP
 * 
 * P1 Security: Redis-backed rate limiting prevents bypass in multi-instance deployments
 */

import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
import { logger } from '../lib/logger/structured-logger.js';
import { getExistingRedisClient } from '../lib/redis/redis-client.js';

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix?: string;    // Optional prefix for keys
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory rate limiter store
 * Maps IP address to request count and reset time
 */
class RateLimiterStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number; isAllowed: boolean; maxRequests: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry
      const resetTime = now + windowMs;
      this.store.set(key, { count: 1, resetTime });
      return { count: 1, resetTime, isAllowed: true, maxRequests: 0 };
    }

    // Increment existing entry
    entry.count++;
    return {
      count: entry.count,
      resetTime: entry.resetTime,
      isAllowed: true,
      maxRequests: 0
    };
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  getStats(): { totalKeys: number } {
    return { totalKeys: this.store.size };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton stores
const memoryStore = new RateLimiterStore();

/**
 * Redis-backed rate limiter
 * Uses Redis INCR with TTL for distributed rate limiting
 */
class RedisRateLimiter {
  constructor(private redis: Redis) {}

  async increment(key: string, windowMs: number, maxRequests: number): Promise<{
    count: number;
    resetTime: number;
    isAllowed: boolean;
    maxRequests: number;
  }> {
    const now = Date.now();
    const resetTime = now + windowMs;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.pttl(key);
      const results = await pipeline.exec();

      if (!results || results.length < 2) {
        throw new Error('Redis pipeline failed');
      }

      const [incrResult, ttlResult] = results;
      const count = (incrResult?.[1] as number) || 1;
      const ttl = (ttlResult?.[1] as number) || -1;

      // Set TTL if key is new (ttl === -1)
      if (ttl === -1) {
        await this.redis.pexpire(key, windowMs);
      }

      const actualResetTime = ttl > 0 ? now + ttl : resetTime;
      const isAllowed = count <= maxRequests;

      return {
        count,
        resetTime: actualResetTime,
        isAllowed,
        maxRequests
      };
    } catch (error) {
      // Fallback to memory store on Redis error
      logger.warn({
        error: error instanceof Error ? error.message : 'unknown',
        key
      }, '[RateLimit] Redis error, falling back to memory store');
      
      return memoryStore.increment(key, windowMs);
    }
  }
}

// Initialize Redis rate limiter if Redis is available
let redisLimiter: RedisRateLimiter | null = null;
const redisClient = getExistingRedisClient();
if (redisClient) {
  redisLimiter = new RedisRateLimiter(redisClient);
  logger.info({ rateLimitStore: 'redis' }, '[RateLimit] Using Redis-backed rate limiting');
} else {
  logger.warn({ rateLimitStore: 'memory' }, '[RateLimit] Using in-memory rate limiting (not distributed)');
}

/**
 * Extract client IP from request
 * Handles X-Forwarded-For header for proxied requests
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  
  if (forwarded && typeof forwarded === 'string') {
    // Take first IP from X-Forwarded-For chain
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  } else if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]) {
    // Handle array case (multiple headers)
    const firstIp = forwarded[0].split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // Fallback to socket IP
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Create rate limiter middleware
 * 
 * @param config - Rate limit configuration
 * @returns Express middleware
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const requestId = req.traceId || 'unknown';

    // Increment counter (use Redis if available, otherwise in-memory)
    let result: Awaited<ReturnType<typeof memoryStore.increment>>;
    
    if (redisLimiter) {
      result = await redisLimiter.increment(key, windowMs, maxRequests);
    } else {
      result = memoryStore.increment(key, windowMs);
      result.maxRequests = maxRequests;
    }

    // Check if limit exceeded
    if (result.count > maxRequests) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);

      logger.warn({
        requestId,
        ip,
        path: req.path,
        count: result.count,
        limit: maxRequests,
        resetTime: new Date(result.resetTime).toISOString(),
        retryAfter
      }, '[RateLimit] Request blocked - limit exceeded');

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', Math.floor(result.resetTime / 1000).toString());
      res.setHeader('Retry-After', retryAfter.toString());

      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        traceId: requestId,
        retryAfter
      });
      return;
    }

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - result.count);
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetTime / 1000).toString());

    // Log successful request (debug level)
    logger.debug({
      requestId,
      ip,
      path: req.path,
      count: result.count,
      limit: maxRequests,
      remaining
    }, '[RateLimit] Request allowed');

    next();
  };
}

/**
 * Get rate limiter stats (for monitoring)
 */
export function getRateLimiterStats() {
  return memoryStore.getStats();
}

/**
 * Reset rate limit for specific IP (admin/testing only)
 * Note: Only works for in-memory store, not Redis
 */
export function resetRateLimit(ip: string, keyPrefix = 'rl'): void {
  memoryStore.reset(`${keyPrefix}:${ip}`);
}

/**
 * Cleanup rate limiter (for graceful shutdown)
 */
export function destroyRateLimiter(): void {
  memoryStore.destroy();
}
