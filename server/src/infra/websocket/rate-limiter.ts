/**
 * WebSocket Rate Limiter
 * Per-socket subscribe rate limiting using token bucket algorithm
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';

/**
 * Token bucket state for a single socket
 */
interface SocketRateLimit {
  tokens: number;
  lastRefill: number;
}

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  maxTokens: number;      // Maximum tokens in bucket
  refillRate: number;     // Tokens per second
  refillInterval: number; // Check interval in ms
}

/**
 * SocketRateLimiter
 * Manages per-socket rate limits for subscribe operations
 */
export class SocketRateLimiter {
  private socketRateLimits = new WeakMap<WebSocket, SocketRateLimit>();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxTokens: config?.maxTokens ?? 10,
      refillRate: config?.refillRate ?? 10 / 60, // 10 per minute default
      refillInterval: config?.refillInterval ?? 1000
    };
  }

  /**
   * Check if socket has rate limit quota available
   * Returns true if allowed, false if rate limited
   */
  check(ws: WebSocket): boolean {
    let limit = this.socketRateLimits.get(ws);
    const now = Date.now();

    // Initialize limit on first check
    if (!limit) {
      limit = {
        tokens: this.config.maxTokens,
        lastRefill: now
      };
      this.socketRateLimits.set(ws, limit);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - limit.lastRefill;
    const tokensToAdd = (elapsed / this.config.refillInterval) * this.config.refillRate;
    limit.tokens = Math.min(this.config.maxTokens, limit.tokens + tokensToAdd);
    limit.lastRefill = now;

    // Check if we have tokens available
    if (limit.tokens < 1) {
      return false; // Rate limited
    }

    // Consume one token
    limit.tokens -= 1;
    return true; // Allowed
  }

  /**
   * Get current config (for testing/debugging)
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}
