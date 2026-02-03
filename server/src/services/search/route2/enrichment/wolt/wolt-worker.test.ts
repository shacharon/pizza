/**
 * Wolt Worker - Unit Tests
 * 
 * Tests:
 * - Job processing flow (search → match → cache → WS)
 * - Redis cache writes with correct TTL
 * - WebSocket RESULT_PATCH publishing
 * - Error handling
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { WoltWorker, type WoltEnrichmentJob } from './wolt-worker.js';
import type { WoltSearchAdapter, SearchResult } from './wolt-search.adapter.js';
import { WOLT_CACHE_TTL_SECONDS, WOLT_REDIS_KEYS } from '../../../wolt/wolt-enrichment.contracts.js';

// Create mock functions
let mockRedisSetex: any;
let mockRedisDel: any;
let mockSearchWeb: any;
let mockWsPublish: any;

// Mock modules
mock.module('../../../../../lib/logger/structured-logger.js', {
  namedExports: {
    logger: {
      debug: () => { },
      info: () => { },
      warn: () => { },
      error: () => { },
    },
  },
});

mock.module('../../../../../server.js', {
  namedExports: {
    wsManager: {
      publishToChannel: (...args: any[]) => mockWsPublish(...args),
    },
  },
});

describe('WoltWorker', () => {
  let mockRedis: any;
  let mockSearchAdapter: WoltSearchAdapter;
  let worker: WoltWorker;

  beforeEach(() => {
    // Create fresh mock functions
    mockRedisSetex = mock.fn();
    mockRedisDel = mock.fn();
    mockSearchWeb = mock.fn();
    mockWsPublish = mock.fn();

    // Mock Redis client
    mockRedis = {
      setex: mockRedisSetex,
      del: mockRedisDel,
    };

    // Mock search adapter
    mockSearchAdapter = {
      searchWeb: mockSearchWeb,
    };

    // Create worker instance
    worker = new WoltWorker(mockRedis, mockSearchAdapter);
  });

  describe('processJob - FOUND scenario', () => {
    it('should write cache entry with FOUND status and 14-day TTL', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-1',
        placeId: 'place-1',
        name: 'Pizza House',
        cityText: 'Tel Aviv',
      };

      // Mock search results (FOUND)
      const searchResults: SearchResult[] = [
        {
          title: 'Pizza House - Tel Aviv - Wolt',
          url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
          snippet: 'Order now',
        },
      ];

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve(searchResults));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      const result = await worker.processJob(job);

      // Verify job succeeded
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'FOUND');
      assert.strictEqual(result.url, 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house');

      // Verify Redis cache write
      assert.strictEqual(mockRedisSetex.mock.callCount(), 1);
      const setexArgs = mockRedisSetex.mock.calls[0].arguments;
      assert.strictEqual(setexArgs[0], WOLT_REDIS_KEYS.place('place-1'));
      assert.strictEqual(setexArgs[1], WOLT_CACHE_TTL_SECONDS.FOUND); // 14 days

      const cacheValue = JSON.parse(setexArgs[2]);
      assert.strictEqual(cacheValue.status, 'FOUND');
      assert.strictEqual(cacheValue.url, 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house');
      assert.ok(cacheValue.updatedAt);
    });

    it('should publish RESULT_PATCH event with FOUND status', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-2',
        placeId: 'place-2',
        name: 'Burger Joint',
        cityText: 'Haifa',
      };

      const searchResults: SearchResult[] = [
        {
          title: 'Burger Joint - Wolt',
          url: 'https://wolt.com/restaurant/burger-joint',
          snippet: 'Best burgers',
        },
      ];

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve(searchResults));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      await worker.processJob(job);

      // Verify WS publish
      assert.strictEqual(mockWsPublish.mock.callCount(), 1);
      const publishArgs = mockWsPublish.mock.calls[0].arguments;

      assert.strictEqual(publishArgs[0], 'search'); // channel
      assert.strictEqual(publishArgs[1], 'req-2'); // requestId
      assert.strictEqual(publishArgs[2], undefined); // sessionId

      const patchEvent = publishArgs[3];
      assert.strictEqual(patchEvent.type, 'RESULT_PATCH');
      assert.strictEqual(patchEvent.requestId, 'req-2');
      assert.strictEqual(patchEvent.placeId, 'place-2');
      assert.strictEqual(patchEvent.patch.wolt.status, 'FOUND');
      assert.strictEqual(patchEvent.patch.wolt.url, 'https://wolt.com/restaurant/burger-joint');
    });
  });

  describe('processJob - NOT_FOUND scenario', () => {
    it('should write cache entry with NOT_FOUND status and 24-hour TTL', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-3',
        placeId: 'place-3',
        name: 'Unknown Place',
        cityText: 'Jerusalem',
      };

      // Mock search results (no good matches)
      const searchResults: SearchResult[] = [
        {
          title: 'Some Other Restaurant',
          url: 'https://wolt.com/restaurant/other',
          snippet: 'Food delivery',
        },
      ];

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve(searchResults));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      const result = await worker.processJob(job);

      // Verify job succeeded with NOT_FOUND
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'NOT_FOUND');
      assert.strictEqual(result.url, null);

      // Verify Redis cache write with 24-hour TTL
      assert.strictEqual(mockRedisSetex.mock.callCount(), 1);
      const setexArgs = mockRedisSetex.mock.calls[0].arguments;
      assert.strictEqual(setexArgs[0], WOLT_REDIS_KEYS.place('place-3'));
      assert.strictEqual(setexArgs[1], WOLT_CACHE_TTL_SECONDS.NOT_FOUND); // 24 hours

      const cacheValue = JSON.parse(setexArgs[2]);
      assert.strictEqual(cacheValue.status, 'NOT_FOUND');
      assert.strictEqual(cacheValue.url, null);
    });

    it('should publish RESULT_PATCH event with NOT_FOUND status', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-4',
        placeId: 'place-4',
        name: 'Unknown Place',
        cityText: null,
      };

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve([]));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      await worker.processJob(job);

      // Verify WS publish with NOT_FOUND
      assert.strictEqual(mockWsPublish.mock.callCount(), 1);
      const publishArgs = mockWsPublish.mock.calls[0].arguments;
      const patchEvent = publishArgs[3];

      assert.strictEqual(patchEvent.type, 'RESULT_PATCH');
      assert.strictEqual(patchEvent.patch.wolt.status, 'NOT_FOUND');
      assert.strictEqual(patchEvent.patch.wolt.url, null);
    });
  });

  describe('Lock cleanup', () => {
    it('should delete lock key after job completes', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-5',
        placeId: 'place-5',
        name: 'Test Restaurant',
        cityText: null,
      };

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve([]));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      await worker.processJob(job);

      // Verify lock key was deleted
      assert.strictEqual(mockRedisDel.mock.callCount(), 1);
      const delArgs = mockRedisDel.mock.calls[0].arguments;
      assert.strictEqual(delArgs[0], WOLT_REDIS_KEYS.lock('place-5'));
    });

    it('should handle lock cleanup errors gracefully', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-6',
        placeId: 'place-6',
        name: 'Test Restaurant',
        cityText: null,
      };

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve([]));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.reject(new Error('Redis error')));

      // Should not throw even if lock cleanup fails
      const result = await worker.processJob(job);

      assert.strictEqual(result.success, true);
    });
  });

  describe('Error handling', () => {
    it('should handle search adapter errors', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-7',
        placeId: 'place-7',
        name: 'Test Restaurant',
        cityText: null,
      };

      mockSearchWeb.mock.mockImplementation(() =>
        Promise.reject(new Error('Search API error'))
      );

      const result = await worker.processJob(job);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'NOT_FOUND');
      assert.ok(result.error);
      assert.match(result.error, /Search API error/);
    });

    it('should handle Redis write errors', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-8',
        placeId: 'place-8',
        name: 'Test Restaurant',
        cityText: null,
      };

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve([]));
      mockRedisSetex.mock.mockImplementation(() =>
        Promise.reject(new Error('Redis connection lost'))
      );

      const result = await worker.processJob(job);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.match(result.error, /Redis connection lost/);
    });
  });

  describe('Search query construction', () => {
    it('should search with restaurant name and city', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-9',
        placeId: 'place-9',
        name: 'Pizza House',
        cityText: 'Tel Aviv',
      };

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve([]));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      await worker.processJob(job);

      // Verify search was called with correct query
      assert.strictEqual(mockSearchWeb.mock.callCount(), 1);
      const searchArgs = mockSearchWeb.mock.calls[0].arguments;
      const query = searchArgs[0];

      assert.match(query, /"Pizza House"/);
      assert.match(query, /"Tel Aviv"/);
      assert.match(query, /site:wolt\.com/);
    });

    it('should search without city if not provided', async () => {
      const job: WoltEnrichmentJob = {
        requestId: 'req-10',
        placeId: 'place-10',
        name: 'Pizza House',
        cityText: null,
      };

      mockSearchWeb.mock.mockImplementation(() => Promise.resolve([]));
      mockRedisSetex.mock.mockImplementation(() => Promise.resolve('OK'));
      mockRedisDel.mock.mockImplementation(() => Promise.resolve(1));

      await worker.processJob(job);

      // Verify search query doesn't include empty city
      const searchArgs = mockSearchWeb.mock.calls[0].arguments;
      const query = searchArgs[0];

      assert.match(query, /"Pizza House"/);
      assert.match(query, /site:wolt\.com/);
      assert.doesNotMatch(query, /""/); // No empty quotes
    });
  });
});
