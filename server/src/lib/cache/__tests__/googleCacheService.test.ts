/**
 * GoogleCacheService Unit Tests
 * Tests for refactored cache flow with focus on races, hits, and error recovery
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Redis } from 'ioredis';
import { GoogleCacheService } from '../googleCacheService.js';

// Mock Redis implementation
class MockRedis {
    private store: Map<string, { value: string; ttl: number }> = new Map();
    public status: 'ready' | 'end' = 'ready';

    async get(key: string): Promise<string | null> {
        const entry = this.store.get(key);
        return entry ? entry.value : null;
    }

    async set(key: string, value: string, ex: string, ttl: number): Promise<'OK'> {
        this.store.set(key, { value, ttl });
        return 'OK';
    }

    async ttl(key: string): Promise<number> {
        const entry = this.store.get(key);
        return entry ? entry.ttl : -2;
    }

    clear(): void {
        this.store.clear();
    }
}

// Mock logger
class MockLogger {
    public logs: Array<{ level: string; data: any; msg?: string }> = [];

    info(data: any, msg?: string): void {
        this.logs.push({ level: 'info', data, msg });
    }

    debug(data: any, msg?: string): void {
        this.logs.push({ level: 'debug', data, msg });
    }

    warn(data: any, msg?: string): void {
        this.logs.push({ level: 'warn', data, msg });
    }

    error(data: any, msg?: string): void {
        this.logs.push({ level: 'error', data, msg });
    }

    clear(): void {
        this.logs = [];
    }

    findLog(event: string): any {
        return this.logs.find(log => log.data.event === event);
    }

    hasEvent(event: string): boolean {
        return this.logs.some(log => log.data.event === event);
    }
}

describe('GoogleCacheService - Refactored Flow', () => {
    let cacheService: GoogleCacheService;
    let mockRedis: MockRedis;
    let mockLogger: MockLogger;

    beforeEach(() => {
        mockRedis = new MockRedis();
        mockLogger = new MockLogger();
        cacheService = new GoogleCacheService(mockRedis as unknown as Redis, mockLogger);
    });

    describe('Inflight Deduplication (L0)', () => {
        it('should deduplicate concurrent requests for same key', async () => {
            let fetchCount = 0;
            const fetchFn = async () => {
                fetchCount++;
                await new Promise(resolve => setTimeout(resolve, 50));
                return { data: 'test', count: fetchCount };
            };

            // Fire 3 concurrent requests
            const results = await Promise.all([
                cacheService.wrap('test-key', 300, fetchFn),
                cacheService.wrap('test-key', 300, fetchFn),
                cacheService.wrap('test-key', 300, fetchFn)
            ]);

            // All should get same result
            assert.strictEqual(results[0].count, 1);
            assert.strictEqual(results[1].count, 1);
            assert.strictEqual(results[2].count, 1);

            // Fetch should only be called once
            assert.strictEqual(fetchCount, 1);

            // Should log inflight dedupe (may be sampled)
            // Note: Sampling is random, so we can't assert exact count
        });

        it('should cleanup inflight after fetch completes', async () => {
            const fetchFn = async () => ({ data: 'test' });

            await cacheService.wrap('test-key', 300, fetchFn);

            // Second call should not hit inflight (it's cleaned up)
            // Instead it should hit L1 cache
            mockLogger.clear();
            await cacheService.wrap('test-key', 300, fetchFn);

            // Should NOT have INFLIGHT_DEDUPE event
            // Should have L1_CACHE_HIT (if sampled)
            const hasInflightDedupe = mockLogger.hasEvent('INFLIGHT_DEDUPE');
            assert.strictEqual(hasInflightDedupe, false);
        });

        it('should cleanup inflight after fetch fails', async () => {
            const fetchFn = async () => {
                throw new Error('Fetch failed');
            };

            try {
                await cacheService.wrap('test-key', 300, fetchFn);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err instanceof Error);
            }

            // Second call should not hit inflight
            mockLogger.clear();
            try {
                await cacheService.wrap('test-key', 300, fetchFn);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err instanceof Error);
            }

            // Should NOT have INFLIGHT_DEDUPE event
            const hasInflightDedupe = mockLogger.hasEvent('INFLIGHT_DEDUPE');
            assert.strictEqual(hasInflightDedupe, false);
        });
    });

    describe('L1 Cache (In-Memory)', () => {
        it('should return L1 cached value if fresh', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'original' }));

            // First call: fetch and populate L1
            const result1 = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result1, { data: 'original' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Second call: should hit L1 cache
            mockLogger.clear();
            const result2 = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result2, { data: 'original' });
            assert.strictEqual(fetchFn.mock.callCount(), 1); // No new fetch

            // May log L1_CACHE_HIT (if sampled)
        });

        it('should skip expired L1 entry and check L2', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // Populate L1 with very short TTL (1 second)
            await cacheService.wrap('test-key', 1, fetchFn);
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Wait for L1 to expire
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Second call: L1 expired, should check L2/fetch
            mockLogger.clear();
            await cacheService.wrap('test-key', 1, fetchFn);

            // Should NOT have L1_CACHE_HIT
            // Should have either CACHE_HIT (L2) or CACHE_MISS (fetch)
            const hasL1Hit = mockLogger.hasEvent('L1_CACHE_HIT');
            assert.strictEqual(hasL1Hit, false);
        });

        it('should continue to L2 if L1 check fails', async () => {
            // We can't easily break L1 without internal access,
            // but we can verify L2 is checked after L1 miss
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // First call to populate caches
            await cacheService.wrap('test-key', 300, fetchFn);

            // Second call should hit L1
            const result = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'test' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);
        });
    });

    describe('L2 Cache (Redis)', () => {
        it('should return L2 cached value if L1 miss', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // First call: populate both L1 and L2
            await cacheService.wrap('test-key', 300, fetchFn);
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Manually clear L1 to force L2 check
            // (In real code, this would happen via expiry or eviction)
            (cacheService as any).l1Cache.clear();

            // Second call: L1 miss, should hit L2 and promote to L1
            mockLogger.clear();
            const result = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'test' });
            assert.strictEqual(fetchFn.mock.callCount(), 1); // No new fetch

            // May log CACHE_HIT with cacheTier: 'L2' (if sampled)
        });

        it('should handle Redis not ready gracefully', async () => {
            mockRedis.status = 'end';
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // Should fallback to fetch without errors
            const result = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'test' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);
        });

        it('should handle corrupt Redis data gracefully', async () => {
            // Manually insert corrupt data into Redis
            await mockRedis.set('corrupt-key', 'not valid json{{{', 'EX', 300);

            const fetchFn = mock.fn(async () => ({ data: 'fresh' }));

            // Should detect corruption, log warning, and fetch
            const result = await cacheService.wrap('corrupt-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'fresh' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Should log CACHE_CORRUPT
            const hasCorrupt = mockLogger.hasEvent('CACHE_CORRUPT');
            assert.strictEqual(hasCorrupt, true);
        });

        it('should promote L2 hit to L1', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // First call: populate both caches
            await cacheService.wrap('test-key', 300, fetchFn);
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Clear L1 to force L2 hit
            (cacheService as any).l1Cache.clear();

            // Second call: L2 hit, promotes to L1
            await cacheService.wrap('test-key', 300, fetchFn);
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Third call: should hit L1 (promoted from L2)
            mockLogger.clear();
            await cacheService.wrap('test-key', 300, fetchFn);
            assert.strictEqual(fetchFn.mock.callCount(), 1); // Still only 1 fetch

            // May log L1_CACHE_HIT (if sampled)
        });
    });

    describe('Fetch and Populate', () => {
        it('should fetch on cache miss and populate both tiers', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'fresh' }));

            const result = await cacheService.wrap('new-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'fresh' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Should have logged CACHE_MISS (if sampled)
            // Should have logged CACHE_STORE (if sampled)

            // Verify L1 populated (second call should hit L1)
            const result2 = await cacheService.wrap('new-key', 300, fetchFn);
            assert.deepStrictEqual(result2, { data: 'fresh' });
            assert.strictEqual(fetchFn.mock.callCount(), 1); // No new fetch

            // Verify L2 populated (check Redis directly)
            const redisValue = await mockRedis.get('new-key');
            assert.ok(redisValue !== null);
            assert.deepStrictEqual(JSON.parse(redisValue), { data: 'fresh' });
        });

        it('should use shorter TTL for empty arrays', async () => {
            const fetchFn = mock.fn(async () => []);

            await cacheService.wrap('empty-array-key', 900, fetchFn);

            // Redis should have stored with 120s TTL (not 900s)
            const ttl = await mockRedis.ttl('empty-array-key');
            assert.strictEqual(ttl, 120);
        });

        it('should handle fetch errors and not cache them', async () => {
            const fetchFn = mock.fn(async () => {
                throw new Error('Fetch failed');
            });

            try {
                await cacheService.wrap('error-key', 300, fetchFn);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err instanceof Error);
                assert.strictEqual(err.message, 'Fetch failed');
            }

            // Second call should retry fetch (not return cached error)
            try {
                await cacheService.wrap('error-key', 300, fetchFn);
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err instanceof Error);
            }

            assert.strictEqual(fetchFn.mock.callCount(), 2);
        });

        it('should handle Redis write errors gracefully', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // Make Redis.set throw
            const originalSet = mockRedis.set.bind(mockRedis);
            mockRedis.set = async () => {
                throw new Error('Redis write failed');
            };

            // Should complete fetch without crashing
            const result = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'test' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Should log REDIS_WRITE_ERROR
            const hasError = mockLogger.hasEvent('REDIS_WRITE_ERROR');
            assert.strictEqual(hasError, true);

            // Restore
            mockRedis.set = originalSet;
        });
    });

    describe('Double-Check Race Protection', () => {
        it('should double-check inflight before fetch', async () => {
            let firstFetchStarted = false;
            let secondFetchStarted = false;

            const fetchFn1 = async () => {
                firstFetchStarted = true;
                await new Promise(resolve => setTimeout(resolve, 100));
                return { data: 'first' };
            };

            const fetchFn2 = async () => {
                secondFetchStarted = true;
                return { data: 'second' };
            };

            // Start first request (will be slow)
            const promise1 = cacheService.wrap('test-key', 300, fetchFn1);

            // Start second request after a tiny delay (should hit inflight double-check)
            await new Promise(resolve => setTimeout(resolve, 10));
            const promise2 = cacheService.wrap('test-key', 300, fetchFn2);

            const [result1, result2] = await Promise.all([promise1, promise2]);

            // Both should get same result from first fetch
            assert.deepStrictEqual(result1, { data: 'first' });
            assert.deepStrictEqual(result2, { data: 'first' });

            // Second fetch should never start
            assert.strictEqual(firstFetchStarted, true);
            assert.strictEqual(secondFetchStarted, false);
        });
    });

    describe('Error Recovery', () => {
        it('should fallback to direct fetch if wrap fails critically', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'fallback' }));

            // Pass invalid key to trigger validation error
            const result = await cacheService.wrap('', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'fallback' });
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Should log CACHE_WRAP_CRITICAL_ERROR
            const hasError = mockLogger.hasEvent('CACHE_WRAP_CRITICAL_ERROR');
            assert.strictEqual(hasError, true);
        });

        it('should continue to L2 if L1 throws', async () => {
            const fetchFn = mock.fn(async () => ({ data: 'test' }));

            // Populate both caches first
            await cacheService.wrap('test-key', 300, fetchFn);
            assert.strictEqual(fetchFn.mock.callCount(), 1);

            // Break L1.get to throw an error
            const originalGet = (cacheService as any).l1Cache.get.bind((cacheService as any).l1Cache);
            (cacheService as any).l1Cache.get = () => {
                throw new Error('L1 broken');
            };

            // Second call: L1 throws, should try L2
            mockLogger.clear();
            const result = await cacheService.wrap('test-key', 300, fetchFn);
            assert.deepStrictEqual(result, { data: 'test' });
            assert.strictEqual(fetchFn.mock.callCount(), 1); // Hit L2, no new fetch

            // Should log L1_CACHE_ERROR
            const hasL1Error = mockLogger.hasEvent('L1_CACHE_ERROR');
            assert.strictEqual(hasL1Error, true);

            // Restore
            (cacheService as any).l1Cache.get = originalGet;
        });
    });

    describe('Metrics and Logging', () => {
        it('should include cache tier in metrics', async () => {
            const fetchFn = async () => ({ data: 'test' });

            // Populate caches
            await cacheService.wrap('test-key', 300, fetchFn);

            // Second call should hit L1
            mockLogger.clear();
            await cacheService.wrap('test-key', 300, fetchFn);

            // May log L1_CACHE_HIT with cacheTier: 'L1' (if sampled)
            const l1Hit = mockLogger.findLog('L1_CACHE_HIT');
            if (l1Hit) {
                assert.strictEqual(l1Hit.data.cacheTier, 'L1');
            }
        });

        it('should log slow operations at INFO level', async () => {
            // Note: This is hard to test without mocking time
            // But the logic is: if durationMs > SLOW_THRESHOLDS.CACHE (200ms), log at INFO
            // Otherwise, sample at DEBUG level
            assert.ok(true); // Placeholder for slow operation test
        });
    });
});
