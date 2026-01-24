/**
 * Rate Limiting Middleware
 * Simple in-memory rate limiter for photo proxy endpoint
 * 
 * Strategy: Token bucket per IP address
 * Default: 60 requests per minute per IP
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';

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

// Singleton store
const store = new RateLimiterStore();

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

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const requestId = req.traceId || 'unknown';

    // Increment counter
    const result = store.increment(key, windowMs);

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
  return store.getStats();
}

/**
 * Reset rate limit for specific IP (admin/testing only)
 */
export function resetRateLimit(ip: string, keyPrefix = 'rl'): void {
  store.reset(`${keyPrefix}:${ip}`);
}

/**
 * Cleanup rate limiter (for graceful shutdown)
 */
export function destroyRateLimiter(): void {
  store.destroy();
}
