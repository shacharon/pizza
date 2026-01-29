import { Redis } from 'ioredis';
import { shouldSampleRandom, SLOW_THRESHOLDS, getCacheSamplingRate } from '../logging/sampling.js';

interface L1CacheEntry {
    value: unknown;
    expiresAt: number;
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

    async wrap<T>(
        key: string,
        ttlSeconds: number,
        fetchFn: () => Promise<T>
    ): Promise<T> {
        // Comprehensive error handling wrapper
        try {
            // Validate inputs
            if (!key || typeof key !== 'string') {
                throw new Error('Invalid cache key');
            }
            if (!fetchFn || typeof fetchFn !== 'function') {
                throw new Error('Invalid fetchFn');
            }

            const safeTtl = Number.isFinite(ttlSeconds) ? Math.max(1, Math.floor(ttlSeconds)) : 900;

            // 1) L0: In-flight deduplication
            const inflight = this.inflightRequests.get(key);
            if (inflight) {
                // LOG NOISE REDUCTION: DEBUG with sampling
                if (shouldSampleRandom(this.cacheSamplingRate)) {
                    this.logger.debug({ event: 'INFLIGHT_DEDUPE', key, sampled: true });
                }
                return inflight as Promise<T>;
            }

            // 2) L1: In-memory cache check (safe)
            const l1StartTime = Date.now();
            try {
                const l1Entry = this.l1Cache.get(key);
                if (l1Entry) {
                    const now = Date.now();
                    if (l1Entry.expiresAt > now) {
                        const ttlRemainingMs = l1Entry.expiresAt - now;
                        const cacheAgeMs = safeTtl * 1000 - ttlRemainingMs;
                        const durationMs = Date.now() - l1StartTime;
                        
                        // LOG NOISE REDUCTION: DEBUG with sampling, INFO if slow
                        const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
                        if (isSlow || shouldSampleRandom(this.cacheSamplingRate)) {
                            const logLevel = isSlow ? 'info' : 'debug';
                            this.logger[logLevel]({ 
                                event: 'L1_CACHE_HIT', 
                                key, 
                                source: 'memory',
                                cacheTier: 'L1',
                                cacheAgeMs: Math.max(0, Math.round(cacheAgeMs)),
                                ttlRemainingSec: Math.round(ttlRemainingMs / 1000),
                                durationMs,
                                ...(isSlow && { slow: true }),
                                ...(!isSlow && { sampled: true })
                            });
                        }
                        return l1Entry.value as T;
                    } else {
                        this.l1Cache.delete(key); // Lazy expiry
                    }
                }
                
                // LOG NOISE REDUCTION: DEBUG with sampling
                if (shouldSampleRandom(this.cacheSamplingRate)) {
                    this.logger.debug({ event: 'L1_CACHE_MISS', key, sampled: true });
                }
            } catch (l1Error) {
                this.logger.warn({
                    event: 'L1_CACHE_ERROR',
                    key,
                    error: l1Error instanceof Error ? l1Error.message : String(l1Error)
                });
                // Continue to Redis even if L1 fails
            }

            // 3) L2: Redis read (safe)
            const redisStartTime = Date.now();
            try {
                // Check if Redis client is available
                if (this.redis && this.redis.status === 'ready') {
                    const cachedValue = await this.redis.get(key);
                    if (cachedValue) {
                        try {
                            const parsed = JSON.parse(cachedValue);
                            const durationMs = Date.now() - redisStartTime;
                            
                            // Get TTL for observability
                            let ttlRemainingSec: number | undefined;
                            try {
                                const ttl = await this.redis.ttl(key);
                                ttlRemainingSec = ttl > 0 ? ttl : undefined;
                            } catch { }
                            
                            // LOG NOISE REDUCTION: DEBUG with sampling, INFO if slow
                            const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
                            if (isSlow || shouldSampleRandom(this.cacheSamplingRate)) {
                                const logLevel = isSlow ? 'info' : 'debug';
                                this.logger[logLevel]({ 
                                    event: 'CACHE_HIT', 
                                    key, 
                                    source: 'redis',
                                    cacheTier: 'L2',
                                    cacheAgeMs: undefined, // Redis doesn't provide creation time easily
                                    ttlRemainingSec,
                                    durationMs,
                                    ...(isSlow && { slow: true }),
                                    ...(!isSlow && { sampled: true })
                                });
                            }

                            // עדכון L1 כדי לחסוך פנייה ל-Redis בבקשה הבאה
                            try {
                                this.setL1Cache(key, parsed, safeTtl);
                            } catch { }
                            return parsed as T;
                        } catch (parseError) {
                            this.logger.warn({ event: 'CACHE_CORRUPT', key }, 'Failed to parse cached JSON');
                        }
                    }
                }
            } catch (err) {
                const durationMs = Date.now() - redisStartTime;
                this.logger.warn({
                    event: 'REDIS_READ_ERROR',
                    key,
                    durationMs,
                    error: err instanceof Error ? err.message : String(err),
                });
                // Continue to fetch even if Redis fails
            }

            // 4) Double-check inflight (מניעת Race condition בין בדיקת Redis ל-Fetch)
            const inflight2 = this.inflightRequests.get(key);
            if (inflight2) return inflight2 as Promise<T>;

            // 5) Cache miss -> Fetch מהמקור
            // LOG NOISE REDUCTION: DEBUG with sampling
            if (shouldSampleRandom(this.cacheSamplingRate)) {
                this.logger.debug({ event: 'CACHE_MISS', key, source: 'fetch', sampled: true });
            }

            const fetchPromise = (async () => {
                try {
                    const res = await fetchFn();
                    const isEmptyArray = Array.isArray(res) && res.length === 0;
                    const redisTtl = isEmptyArray ? 120 : safeTtl;

                    // שמירה ב-L1 (safe)
                    try {
                        this.setL1Cache(key, res, redisTtl);
                    } catch (l1WriteError) {
                        this.logger.warn({
                            event: 'L1_WRITE_ERROR',
                            key,
                            error: String(l1WriteError)
                        });
                    }

                    // שמירה ב-Redis (safe)
                    const storeStartTime = Date.now();
                    try {
                        if (this.redis && this.redis.status === 'ready') {
                            await this.redis.set(key, JSON.stringify(res), 'EX', redisTtl);
                            const durationMs = Date.now() - storeStartTime;
                            
                            // LOG NOISE REDUCTION: DEBUG with sampling, INFO if slow
                            const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
                            if (isSlow || shouldSampleRandom(this.cacheSamplingRate)) {
                                const logLevel = isSlow ? 'info' : 'debug';
                                this.logger[logLevel]({ 
                                    event: 'CACHE_STORE', 
                                    key, 
                                    cacheTier: 'L2',
                                    ttlUsed: redisTtl,
                                    durationMs,
                                    ...(isSlow && { slow: true }),
                                    ...(!isSlow && { sampled: true })
                                });
                            }
                        }
                    } catch (setErr) {
                        this.logger.warn({
                            event: 'REDIS_WRITE_ERROR',
                            key,
                            error: String(setErr),
                        });
                    }
                    return res;
                } finally {
                    this.inflightRequests.delete(key);
                }
            })();

            this.inflightRequests.set(key, fetchPromise);
            return fetchPromise as Promise<T>;
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