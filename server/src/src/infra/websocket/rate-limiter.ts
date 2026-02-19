/**
 * Rate Limiter Module
 * Per-socket subscribe rate limiting using token bucket algorithm
 */

import { WebSocket } from 'ws';

// PROD Hardening: Per-socket subscribe rate limit (token bucket)
export interface SocketRateLimit {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;
  refillInterval: number;
}

export class RateLimiter {
  private socketRateLimits = new WeakMap<WebSocket, SocketRateLimit>();
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxTokens: config?.maxTokens ?? 10, // 10 subscribes
      refillRate: config?.refillRate ?? 10 / 60, // per second (10/min)
      refillInterval: config?.refillInterval ?? 1000 // Check every second
    };
  }

  /**
   * PROD Hardening: Check and consume rate limit token
   */
  checkRateLimit(ws: WebSocket): boolean {
    let limit = this.socketRateLimits.get(ws);
    const now = Date.now();

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
}
