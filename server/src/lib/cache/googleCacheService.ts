import { Redis } from 'ioredis';
import { shouldSampleRandom, SLOW_THRESHOLDS, getCacheSamplingRate } from '../logging/sampling.js';

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

interface CacheResult {
    hit: boolean;
    value?: unknown;
    metrics?: CacheMetrics;
}

/**
 * GoogleCacheService
 * ניהול מטמון רב-שכבתי:
 * - L0: In-flight deduplication (מניעת קריאות כפולות בו-זמנית)
 * - L1: In-memory result cache (מהיר במיוחד, עד 60 שניות)
 * - L2: Redis cache (לטווח ארוך, עד 15 דקות)
 * 
 * LOG NOISE REDUCTION:
 * - Routine cache operations log at DEBUG level with 5% sampling (configurable via LOG_CACHE_SAMPLE_RATE)
 * - Slow operations (>200ms) always log at INFO
 * - Errors always log at WARN/ERROR
 */
export class GoogleCacheService {
    private inflightRequests: Map<string, Promise<unknown>> = new Map();
    private l1Cache: Map<string, L1CacheEntry> = new Map();
    private readonly L1_MAX_SIZE = 500;
    private readonly cacheSamplingRate: number;

    constructor(
        private redis: Redis,
        private logger: {
            info(o: any, msg?: string): void;
            debug(o: any, msg?: string): void;
            warn(o: any, msg?: string): void;
            error(o: any, msg?: string): void;
        }
    ) {
        this.cacheSamplingRate = getCacheSamplingRate();
    }

    // ========================================================================
    // Pure Helper Methods (extracted for clarity and testability)
    // ========================================================================

    /**
     * Check if there's an inflight request for this key
     */
    private checkInflight<T>(key: string): Promise<T> | null {
        return this.inflightRequests.get(key) as Promise<T> | null;
    }

    /**
     * Check L1 (in-memory) cache
     * Pure function - returns result without side effects (except lazy expiry)
     */
    private checkL1Cache(key: string, safeTtl: number): CacheResult {
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
     * Pure async function - returns result without side effects
     */
    private async checkL2Cache(key: string): Promise<CacheResult> {
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
     * Safe L1 cache check with error handling and logging
     */
    private tryCheckL1(key: string, safeTtl: number): CacheResult {
        const startTime = Date.now();
        try {
            const result = this.checkL1Cache(key, safeTtl);
            if (result.hit) {
                const durationMs = Date.now() - startTime;
                this.logCacheOperation('L1_CACHE_HIT', key, {
                    ...result.metrics,
                    durationMs
                });
            } else {
                // LOG NOISE REDUCTION: DEBUG with sampling
                if (shouldSampleRandom(this.cacheSamplingRate)) {
                    this.logger.debug({ event: 'L1_CACHE_MISS', key, sampled: true });
                }
            }
            return result;
        } catch (l1Error) {
            this.logger.warn({
                event: 'L1_CACHE_ERROR',
                key,
                error: l1Error instanceof Error ? l1Error.message : String(l1Error)
            });
            return { hit: false };
        }
    }

    /**
     * Safe L2 cache check with error handling and logging
     */
    private async tryCheckL2(key: string): Promise<CacheResult> {
        const startTime = Date.now();
        try {
            const result = await this.checkL2Cache(key);
            if (result.hit) {
                const durationMs = Date.now() - startTime;
                this.logCacheOperation('CACHE_HIT', key, {
                    ...result.metrics,
                    durationMs
                });
            }
            return result;
        } catch (err) {
            const durationMs = Date.now() - startTime;
            this.logger.warn({
                event: 'REDIS_READ_ERROR',
                key,
                durationMs,
                error: err instanceof Error ? err.message : String(err)
            });
            return { hit: false };
        }
    }

    /**
     * DRY logging helper for cache operations
     * Handles sampling and slow operation detection
     */
    private logCacheOperation(
        event: string,
        key: string,
        data: Record<string, any>
    ): void {
        const isSlow = data.durationMs > SLOW_THRESHOLDS.CACHE;
        if (isSlow || shouldSampleRandom(this.cacheSamplingRate)) {
            const logLevel = isSlow ? 'info' : 'debug';
            this.logger[logLevel]({
                event,
                key,
                ...data,
                ...(isSlow && { slow: true }),
                ...(!isSlow && { sampled: true })
            });
        }
    }

    /**
     * Log inflight deduplication (with sampling)
     */
    private logInflightDedupe(key: string): void {
        if (shouldSampleRandom(this.cacheSamplingRate)) {
            this.logger.debug({ event: 'INFLIGHT_DEDUPE', key, sampled: true });
        }
    }

    /**
     * Log cache miss (with sampling)
     */
    private logCacheMiss(key: string): void {
        if (shouldSampleRandom(this.cacheSamplingRate)) {
            this.logger.debug({ event: 'CACHE_MISS', key, source: 'fetch', sampled: true });
        }
    }

    /**
     * Populate L1 cache (safe, with error handling)
     */
    private populateL1(key: string, value: unknown, ttl: number): void {
        try {
            this.setL1Cache(key, value, ttl);
        } catch (l1WriteError) {
            this.logger.warn({
                event: 'L1_WRITE_ERROR',
                key,
                error: String(l1WriteError)
            });
        }
    }

    /**
     * Populate L2 (Redis) cache (safe, with error handling)
     */
    private async populateL2(key: string, value: unknown, ttl: number): Promise<void> {
        const startTime = Date.now();
        try {
            if (this.redis && this.redis.status === 'ready') {
                await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
                const durationMs = Date.now() - startTime;

                this.logCacheOperation('CACHE_STORE', key, {
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
     * Fetch from source and populate caches
     */
    private async fetchAndPopulate<T>(
        key: string,
        fetchFn: () => Promise<T>,
        safeTtl: number
    ): Promise<T> {
        try {
            const res = await fetchFn();
            const isEmptyArray = Array.isArray(res) && res.length === 0;
            const redisTtl = isEmptyArray ? 120 : safeTtl;

            // Populate L1 cache
            this.populateL1(key, res, redisTtl);

            // Populate L2 (Redis) cache
            await this.populateL2(key, res, redisTtl);

            return res;
        } finally {
            this.inflightRequests.delete(key);
        }
    }

    /**
     * Main cache wrapper with linear early-return flow
     * 
     * Flow: L0 (inflight) → L1 (memory) → L2 (Redis) → Fetch
     * All errors handled gracefully, continues to next tier
     */
    async wrap<T>(
        key: string,
        ttlSeconds: number,
        fetchFn: () => Promise<T>
    ): Promise<T> {
        // Comprehensive error handling wrapper
        try {
            // 1. Validate inputs (early return on error)
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid cache key');
            }
            if (!fetchFn || typeof fetchFn !== 'function') {
                throw new Error('Invalid fetchFn');
            }

            const safeTtl = Number.isFinite(ttlSeconds) ? Math.max(1, Math.floor(ttlSeconds)) : 900;

            // 2. L0: Check inflight deduplication (early return if hit)
            const inflight = this.checkInflight<T>(key);
            if (inflight) {
                this.logInflightDedupe(key);
                return inflight;
            }

            // 3. L1: Check in-memory cache (early return if hit)
            const l1Result = this.tryCheckL1(key, safeTtl);
            if (l1Result.hit) {
                return l1Result.value as T;
            }

            // 4. L2: Check Redis cache (early return if hit)
            const l2Result = await this.tryCheckL2(key);
            if (l2Result.hit) {
                // Promote to L1 for faster subsequent access
                this.populateL1(key, l2Result.value, safeTtl);
                return l2Result.value as T;
            }

            // 5. Double-check inflight (race condition protection)
            const inflight2 = this.checkInflight<T>(key);
            if (inflight2) return inflight2;

            // 6. Cache miss -> fetch and populate both tiers
            this.logCacheMiss(key);
            const fetchPromise = this.fetchAndPopulate<T>(key, fetchFn, safeTtl);
            this.inflightRequests.set(key, fetchPromise);

            return fetchPromise;
        } catch (wrapError) {
            // If entire wrap operation fails, fallback to direct fetch
            this.logger.error({
                event: 'CACHE_WRAP_CRITICAL_ERROR',
                key,
                error: wrapError instanceof Error ? wrapError.message : String(wrapError),
                msg: 'Cache wrap failed completely, executing direct fetch'
            });
            // Execute fetchFn directly as last resort
            return await fetchFn();
        }
    }

    private setL1Cache(key: string, value: unknown, baseTtlSeconds: number): void {
        try {
            const isEmptyArray = Array.isArray(value) && value.length === 0;
            const l1TtlSeconds = isEmptyArray ? 30 : Math.min(baseTtlSeconds, 60);

            // ניהול גודל המטמון (FIFO)
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

    getTTL(query: string): number {
        const timeKeywords = ['open', 'now', 'פתוח', 'עכשיו'];
        const normalized = query.toLowerCase();
        const isTimeSensitive = timeKeywords.some(k => normalized.includes(k));
        return isTimeSensitive ? 300 : 900;
    }
}