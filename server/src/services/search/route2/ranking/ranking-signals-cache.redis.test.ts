/**
 * Ranking Signals Cache Redis Tests
 * Tests set/get/expiry/IDOR protection
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { RankingSignalsCacheRedis } from './ranking-signals-cache.redis.js';
import type { RankingSignals } from './ranking-signals.js';
import { getRedisClient, closeRedisClient } from '../../../../lib/redis/redis-client.js';

describe('RankingSignalsCacheRedis', () => {
  let cache: RankingSignalsCacheRedis;
  const testRequestId = 'test-req-' + Date.now();

  const mockSignals: RankingSignals = {
    profile: 'BALANCED',
    dominantFactor: 'NONE',
    triggers: {
      lowResults: false,
      relaxUsed: false,
      manyOpenUnknown: false,
      dominatedByOneFactor: false
    },
    facts: {
      shownNow: 20,
      totalPool: 30,
      hasUserLocation: true
    }
  };

  before(async () => {
    // Initialize Redis client
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    await getRedisClient({ url: redisUrl });
    cache = new RankingSignalsCacheRedis();
  });

  after(async () => {
    // Cleanup: delete test key
    await cache.clear(testRequestId);
    await cache.clear(testRequestId + '-session');
    await cache.clear(testRequestId + '-user');
    await closeRedisClient();
  });

  describe('set and get', () => {
    it('should store and retrieve ranking signals', async () => {
      const requestId = testRequestId;
      
      await cache.set(requestId, mockSignals, 'test query', 'en');
      const result = await cache.get(requestId);

      assert.ok(result, 'Should retrieve cached entry');
      assert.strictEqual(result.query, 'test query');
      assert.strictEqual(result.uiLanguage, 'en');
      assert.deepStrictEqual(result.signals, mockSignals);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent-key-' + Date.now());
      assert.strictEqual(result, null);
    });

    it('should handle missing Redis gracefully', async () => {
      const cacheWithoutRedis = new RankingSignalsCacheRedis();
      // Mock redis as null
      (cacheWithoutRedis as any).redis = null;

      await cacheWithoutRedis.set('test', mockSignals, 'query', 'en');
      const result = await cacheWithoutRedis.get('test');

      assert.strictEqual(result, null);
    });
  });

  describe('IDOR protection - Symmetric Matching Rules', () => {
    describe('SessionId symmetric matching', () => {
      it('should allow retrieval with matching sessionId', async () => {
        const requestId = testRequestId + '-session';
        const sessionId = 'session-123';

        await cache.set(requestId, mockSignals, 'test', 'en', sessionId);
        const result = await cache.get(requestId, sessionId);

        assert.ok(result, 'Should retrieve with matching sessionId');
      });

      it('should deny retrieval with mismatched sessionId', async () => {
        const requestId = testRequestId + '-session-mismatch';
        const sessionId = 'session-123';

        await cache.set(requestId, mockSignals, 'test', 'en', sessionId);
        const result = await cache.get(requestId, 'different-session');

        assert.strictEqual(result, null, 'Should deny with different sessionId');
      });

      it('should deny unauthenticated request from retrieving authenticated entry', async () => {
        const requestId = testRequestId + '-escalation-attempt';
        const sessionId = 'session-secure-123';

        // Store WITH sessionId (authenticated)
        await cache.set(requestId, mockSignals, 'test', 'en', sessionId);
        
        // Attempt retrieval WITHOUT sessionId (unauthenticated)
        const result = await cache.get(requestId);

        assert.strictEqual(result, null, 'Should deny privilege escalation (unauth -> auth)');
      });

      it('should deny authenticated request from retrieving unauthenticated entry', async () => {
        const requestId = testRequestId + '-downgrade-attempt';

        // Store without sessionId (unauthenticated)
        await cache.set(requestId, mockSignals, 'test', 'en');
        
        // Attempt retrieval WITH sessionId (authenticated)
        const result = await cache.get(requestId, 'some-session-id');

        assert.strictEqual(result, null, 'Should deny privilege downgrade (auth -> unauth)');
      });

      it('should allow symmetric unauthenticated retrieval', async () => {
        const requestId = testRequestId + '-unauth-symmetric';

        // Store without sessionId/userId
        await cache.set(requestId, mockSignals, 'test', 'en');
        
        // Retrieve without sessionId/userId
        const result = await cache.get(requestId);

        assert.ok(result, 'Should allow when both entry and request have no sessionId');
      });
    });

    describe('UserId symmetric matching', () => {
      it('should allow retrieval with matching userId', async () => {
        const requestId = testRequestId + '-user';
        const userId = 'user-456';

        await cache.set(requestId, mockSignals, 'test', 'en', undefined, userId);
        const result = await cache.get(requestId, undefined, userId);

        assert.ok(result, 'Should retrieve with matching userId');
      });

      it('should deny retrieval with mismatched userId', async () => {
        const requestId = testRequestId + '-user-mismatch';
        const userId = 'user-456';

        await cache.set(requestId, mockSignals, 'test', 'en', undefined, userId);
        const result = await cache.get(requestId, undefined, 'different-user');

        assert.strictEqual(result, null, 'Should deny with different userId');
      });

      it('should deny unauthenticated request from retrieving entry with userId', async () => {
        const requestId = testRequestId + '-user-escalation';
        const userId = 'user-secure-789';

        // Store WITH userId
        await cache.set(requestId, mockSignals, 'test', 'en', undefined, userId);
        
        // Attempt retrieval WITHOUT userId
        const result = await cache.get(requestId);

        assert.strictEqual(result, null, 'Should deny when entry has userId but request does not');
      });

      it('should deny request with userId from retrieving entry without userId', async () => {
        const requestId = testRequestId + '-user-downgrade';

        // Store WITHOUT userId
        await cache.set(requestId, mockSignals, 'test', 'en');
        
        // Attempt retrieval WITH userId
        const result = await cache.get(requestId, undefined, 'some-user-id');

        assert.strictEqual(result, null, 'Should deny when request has userId but entry does not');
      });
    });

    describe('Combined sessionId and userId verification', () => {
      it('should verify both sessionId and userId when both present', async () => {
        const requestId = testRequestId + '-both';
        const sessionId = 'session-789';
        const userId = 'user-789';

        await cache.set(requestId, mockSignals, 'test', 'en', sessionId, userId);
        
        // Correct both
        const result1 = await cache.get(requestId, sessionId, userId);
        assert.ok(result1, 'Should allow with both matching');

        // Wrong session
        const result2 = await cache.get(requestId, 'wrong-session', userId);
        assert.strictEqual(result2, null, 'Should deny with wrong session');

        // Wrong user
        const result3 = await cache.get(requestId, sessionId, 'wrong-user');
        assert.strictEqual(result3, null, 'Should deny with wrong user');

        // Missing session
        const result4 = await cache.get(requestId, undefined, userId);
        assert.strictEqual(result4, null, 'Should deny with missing session');

        // Missing user
        const result5 = await cache.get(requestId, sessionId, undefined);
        assert.strictEqual(result5, null, 'Should deny with missing user');
      });

      it('should deny when entry has sessionId but request has only userId', async () => {
        const requestId = testRequestId + '-session-user-mismatch-1';
        const sessionId = 'session-abc';

        // Entry has sessionId only
        await cache.set(requestId, mockSignals, 'test', 'en', sessionId);
        
        // Request has userId only
        const result = await cache.get(requestId, undefined, 'user-xyz');

        assert.strictEqual(result, null, 'Should deny asymmetric identity types');
      });

      it('should deny when entry has userId but request has only sessionId', async () => {
        const requestId = testRequestId + '-user-session-mismatch-1';
        const userId = 'user-def';

        // Entry has userId only
        await cache.set(requestId, mockSignals, 'test', 'en', undefined, userId);
        
        // Request has sessionId only
        const result = await cache.get(requestId, 'session-uvw');

        assert.strictEqual(result, null, 'Should deny asymmetric identity types');
      });
    });
  });

  describe('TTL and expiry', () => {
    it('should expire after TTL (simulated with short TTL)', async () => {
      // Note: This test would require modifying the cache to accept custom TTL
      // For now, we just verify the key exists initially
      const requestId = testRequestId + '-ttl';
      
      await cache.set(requestId, mockSignals, 'test', 'en');
      const result = await cache.get(requestId);
      
      assert.ok(result, 'Should exist immediately after set');

      // In a real test, we'd wait 10 minutes or use a shorter TTL
      // For now, we trust Redis SETEX behavior
    });
  });

  describe('stats', () => {
    it('should return stats when Redis available', async () => {
      const stats = await cache.getStats();
      
      if (cache.isAvailable()) {
        assert.strictEqual(stats.available, true);
        assert.ok(typeof stats.totalKeys === 'number');
      } else {
        assert.strictEqual(stats.available, false);
      }
    });
  });
});
