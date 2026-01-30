/**
 * Cache Tiers Service
 * Manages L1 (in-memory) and L2 (Redis) cache tiers
 * 
 * Responsibility:
 * - L1 cache operations (get, set, eviction)
 * - L2 cache operations (get, set, TTL queries)
 * - Cache tier promotion (L2 → L1)
 * - Error handling for cache operations
 */

import { Redis } from 'ioredis';
import { getL1TTL, isEmptyResults, getTTLForEmptyResults } from './cache-policy.js';

interface L1CacheEntry {
  value: unknown;
  expiresAt: number;
}

interface CacheMetrics {
  source: 'memory' | 'redis';
  cacheTier: 'L1' | 'L2';
  cacheAgeMs?: number | undefined;
  ttlRemainingSec?: number | undefined;
  durationMs?: number | undefined;
}

export interface CacheResult {
  hit: boolean;
  value?: unknown;
  metrics?: CacheMetrics;
}

export class CacheTiersService {
  private l1Cache: Map<string, L1CacheEntry> = new Map();
  private readonly L1_MAX_SIZE = 500;

  constructor(
    private redis: Redis,
    private logger: {
      info(o: any, msg?: string): void;
      debug(o: any, msg?: string): void;
      warn(o: any, msg?: string): void;
      error(o: any, msg?: string): void;
    }
  ) {}

  /**
   * Check L1 (in-memory) cache
   * Returns result without side effects (except lazy expiry)
   */
  checkL1(key: string, safeTtl: number): CacheResult {
    const l1Entry = this.l1Cache.get(key);
    if (!l1Entry) return { hit: false };

    const now = Date.now();
    if (l1Entry.expiresAt <= now) {
      this.l1Cache.delete(key); // Lazy expiry
      return { hit: false };
    }

    const ttlRemainingMs = l1Entry.expiresAt - now;
    const cacheAgeMs = safeTtl * 1000 - ttlRemainingMs;

    return {
      hit: true,
      value: l1Entry.value,
      metrics: {
        source: 'memory',
        cacheTier: 'L1',
        cacheAgeMs: Math.max(0, Math.round(cacheAgeMs)),
        ttlRemainingSec: Math.round(ttlRemainingMs / 1000)
      }
    };
  }

  /**
   * Check L2 (Redis) cache
   * Returns result without side effects
   */
  async checkL2(key: string): Promise<CacheResult> {
    if (!this.redis || this.redis.status !== 'ready') {
      return { hit: false };
    }

    const cachedValue = await this.redis.get(key);
    if (!cachedValue) return { hit: false };

    try {
      const parsed = JSON.parse(cachedValue);

      // Get TTL for observability
      let ttlRemainingSec: number | undefined;
      try {
        const ttl = await this.redis.ttl(key);
        ttlRemainingSec = ttl > 0 ? ttl : undefined;
      } catch { }

      return {
        hit: true,
        value: parsed,
        metrics: {
          source: 'redis',
          cacheTier: 'L2',
          ttlRemainingSec
        }
      };
    } catch (parseError) {
      this.logger.warn({ event: 'CACHE_CORRUPT', key }, 'Failed to parse cached JSON');
      return { hit: false };
    }
  }

  /**
   * Set L1 cache with FIFO eviction
   */
  setL1(key: string, value: unknown, baseTtlSeconds: number): void {
    try {
      const isEmpty = isEmptyResults(value);
      const l1TtlSeconds = getL1TTL(baseTtlSeconds, isEmpty);

      // Manage cache size (FIFO eviction)
      if (this.l1Cache.size >= this.L1_MAX_SIZE && !this.l1Cache.has(key)) {
        const firstKey = this.l1Cache.keys().next().value;
        if (firstKey !== undefined) this.l1Cache.delete(firstKey);
      }

      this.l1Cache.set(key, {
        value,
        expiresAt: Date.now() + (l1TtlSeconds * 1000)
      });
    } catch (err) {
      // L1 cache is non-critical, just log and continue
      this.logger.warn({
        event: 'L1_SET_ERROR',
        key,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Set L2 (Redis) cache with TTL
   */
  async setL2(key: string, value: unknown, ttl: number): Promise<void> {
    const startTime = Date.now();
    try {
      if (this.redis && this.redis.status === 'ready') {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
        const durationMs = Date.now() - startTime;

        // Log cache store operation
        this.logger.debug({
          event: 'CACHE_STORE',
          key,
          cacheTier: 'L2',
          ttlUsed: ttl,
          durationMs
        });
      }
    } catch (setErr) {
      this.logger.warn({
        event: 'REDIS_WRITE_ERROR',
        key,
        error: String(setErr)
      });
    }
  }

  /**
   * Promote L2 value to L1 for faster subsequent access
   */
  promoteToL1(key: string, value: unknown, ttl: number): void {
    this.setL1(key, value, ttl);
  }
}
