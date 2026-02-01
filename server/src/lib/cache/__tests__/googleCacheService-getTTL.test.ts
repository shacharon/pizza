/**
 * GoogleCacheService.getTTL() Tests
 * Tests defensive wrapper around getTTLForQuery
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { GoogleCacheService } from '../googleCacheService.js';

// Mock Redis client
const mockRedis = {
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
  pipeline: () => ({
    get: () => { },
    exec: async () => []
  })
} as any;

// Mock logger
const mockLogger = {
  info: () => { },
  debug: () => { },
  warn: () => { },
  error: () => { }
};

describe('GoogleCacheService.getTTL() - Null Safety', () => {
  it('should return 900s for null query', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);
    const ttl = cacheService.getTTL(null);
    assert.strictEqual(ttl, 900, 'null query should return 900s');
  });

  it('should return 900s for undefined query', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);
    const ttl = cacheService.getTTL(undefined);
    assert.strictEqual(ttl, 900, 'undefined query should return 900s');
  });

  it('should return 900s for empty string', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);
    const ttl = cacheService.getTTL('');
    assert.strictEqual(ttl, 900, 'empty string should return 900s');
  });

  it('should never throw for invalid inputs', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);
    const inputs = [null, undefined, '', 123, {}, [], true, false] as any[];

    for (const input of inputs) {
      try {
        const ttl = cacheService.getTTL(input);
        assert.ok(typeof ttl === 'number' && ttl > 0, `TTL should be positive number for ${input}`);
      } catch (error) {
        assert.fail(`getTTL should not throw for input: ${input}, but threw: ${error}`);
      }
    }
  });
});

describe('GoogleCacheService.getTTL() - Valid Queries', () => {
  it('should return 300s for time-sensitive queries', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);
    assert.strictEqual(cacheService.getTTL('pizza open now'), 300, 'time-sensitive query');
    assert.strictEqual(cacheService.getTTL('restaurants open'), 300, 'open query');
    assert.strictEqual(cacheService.getTTL('פתוח עכשיו'), 300, 'Hebrew time-sensitive');
  });

  it('should return 900s for general queries', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);
    assert.strictEqual(cacheService.getTTL('italian restaurant'), 900, 'general query');
    assert.strictEqual(cacheService.getTTL('pizza near me'), 900, 'location query');
  });
});

describe('GoogleCacheService.getTTL() - Defensive Wrapper', () => {
  it('should catch and handle errors from getTTLForQuery', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);

    // Even if getTTLForQuery somehow throws (it shouldn't after our fix),
    // the wrapper should catch it and return default TTL
    let warnCalled = false;
    const testLogger = {
      ...mockLogger,
      warn: (obj: any) => {
        if (obj.event === 'CACHE_TTL_ERROR') {
          warnCalled = true;
        }
      }
    };

    const cacheServiceWithLogging = new GoogleCacheService(mockRedis, testLogger);

    // Test with various edge cases
    const inputs = [null, undefined, '', NaN, Infinity, -Infinity];

    for (const input of inputs) {
      const ttl = cacheServiceWithLogging.getTTL(input as any);
      assert.ok(typeof ttl === 'number' && ttl > 0, `Should return valid TTL for ${input}`);
    }
  });

  it('should return 900s as fallback if error occurs', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);

    // Test that even with unexpected inputs, we get the default 900s
    const ttl = cacheService.getTTL(null);
    assert.strictEqual(ttl, 900, 'fallback should be 900s');
  });
});

describe('GoogleCacheService.getTTL() - Landmark Use Cases', () => {
  it('should handle landmark queries with null keyword gracefully', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);

    // Simulates: mapping.keyword is null for a landmark query
    const ttl = cacheService.getTTL(null);
    assert.strictEqual(ttl, 900, 'landmark with null keyword should use default TTL');
  });

  it('should handle landmark queries with undefined keyword gracefully', () => {
    const cacheService = new GoogleCacheService(mockRedis, mockLogger);

    const ttl = cacheService.getTTL(undefined);
    assert.strictEqual(ttl, 900, 'landmark with undefined keyword should use default TTL');
  });
});
