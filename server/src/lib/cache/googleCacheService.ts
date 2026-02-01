import { Redis } from 'ioredis';
import { shouldSampleRandom, SLOW_THRESHOLDS, getCacheSamplingRate } from '../logging/sampling.js';
import { CacheTiersService, type CacheResult } from './cache-tiers.service.js';
import { getTTLForQuery, getTTLForEmptyResults } from './cache-policy.js';

/**
 * GoogleCacheService (ORCHESTRATION)
 * Manages multi-tier caching with inflight deduplication
 * 
 * Architecture:
 * - L0: In-flight deduplication (prevents concurrent duplicate requests)
 * - L1/L2: Delegated to CacheTiersService
 * - TTL policy: Delegated to cache-policy (pure)
 * 
 * Flow: L0 (inflight) → L1 (memory) → L2 (Redis) → Fetch
 * 
 * LOG NOISE REDUCTION:
 * - Routine cache operations log at DEBUG level with 5% sampling (configurable via LOG_CACHE_SAMPLE_RATE)
 * - Slow operations (>200ms) always log at INFO
 * - Errors always log at WARN/ERROR
 */
export class GoogleCacheService {
    private inflightRequests: Map<string, Promise<unknown>> = new Map();
    private readonly cacheSamplingRate: number;
    private readonly cacheTiers: CacheTiersService;

    constructor(
        redis: Redis,
        private logger: {
            info(o: any, msg?: string): void;
            debug(o: any, msg?: string): void;
            warn(o: any, msg?: string): void;
            error(o: any, msg?: string): void;
        }
    ) {
        this.cacheSamplingRate = getCacheSamplingRate();
        this.cacheTiers = new CacheTiersService(redis, logger);
    }

    /**
     * Check if there's an inflight request for this key (L0 deduplication)
     */
    private checkInflight<T>(key: string): Promise<T> | null {
        return this.inflightRequests.get(key) as Promise<T> | null;
    }

    /**
     * Safe L1 cache check with error handling and logging
     */
    private tryCheckL1(key: string, safeTtl: number): CacheResult {
        const startTime = Date.now();
        try {
            const result = this.cacheTiers.checkL1(key, safeTtl);
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
            const result = await this.cacheTiers.checkL2(key);
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
     * Populate L1 cache (delegated to CacheTiersService)
     */
    private populateL1(key: string, value: unknown, ttl: number): void {
        this.cacheTiers.setL1(key, value, ttl);
    }

    /**
     * Populate L2 (Redis) cache (delegated to CacheTiersService)
     */
    private async populateL2(key: string, value: unknown, ttl: number): Promise<void> {
        const startTime = Date.now();
        await this.cacheTiers.setL2(key, value, ttl);
        const durationMs = Date.now() - startTime;

        this.logCacheOperation('CACHE_STORE', key, {
            cacheTier: 'L2',
            ttlUsed: ttl,
            durationMs
        });
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
            const isEmpty = Array.isArray(res) && res.length === 0;
            const redisTtl = isEmpty ? getTTLForEmptyResults() : safeTtl;

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

    /**
     * Get TTL for query (delegated to cache-policy)
     * Defensive wrapper: never throws on null/undefined
     */
    getTTL(query: string | null | undefined): number {
        try {
            return getTTLForQuery(query);
        } catch (error) {
            // Defensive fallback: if getTTLForQuery somehow throws, return safe default
            this.logger.warn({
                event: 'CACHE_TTL_ERROR',
                query,
                error: error instanceof Error ? error.message : String(error),
                msg: 'getTTL failed, using default TTL (900s)'
            });
            return 900; // 15 minutes default
        }
    }
}