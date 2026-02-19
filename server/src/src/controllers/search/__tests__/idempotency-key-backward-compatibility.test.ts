/**
 * Backward Compatibility Test for IdempotencyKeyGenerator
 * Verifies that refactored class generates identical keys to the old implementation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { IdempotencyKeyGenerator } from '../search.idempotency-key.generator.js';

/**
 * Original implementation (for comparison)
 */
function generateIdempotencyKeyOld(params: {
  sessionId: string;
  query: string;
  mode: 'sync' | 'async';
  userLocation?: { lat: number; lng: number } | null;
  filters?: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  } | null;
}): string {
  // Normalize query: lowercase, trim, collapse whitespace
  const normalizedQuery = params.query.toLowerCase().trim().replace(/\s+/g, ' ');

  // Hash location if present (to handle float precision issues)
  const locationHash = params.userLocation
    ? `${params.userLocation.lat.toFixed(4)},${params.userLocation.lng.toFixed(4)}`
    : 'no-location';

  // Serialize filters (normalized and sorted for consistency)
  let filtersHash = 'no-filters';
  if (params.filters) {
    const filterParts: string[] = [];

    if (params.filters.openNow !== undefined) {
      filterParts.push(`openNow:${params.filters.openNow}`);
    }
    if (params.filters.priceLevel !== undefined) {
      filterParts.push(`priceLevel:${params.filters.priceLevel}`);
    }
    if (params.filters.dietary && params.filters.dietary.length > 0) {
      // Sort dietary array for consistent hashing
      const sortedDietary = [...params.filters.dietary].sort();
      filterParts.push(`dietary:${sortedDietary.join(',')}`);
    }
    if (params.filters.mustHave && params.filters.mustHave.length > 0) {
      // Sort mustHave array for consistent hashing
      const sortedMustHave = [...params.filters.mustHave].sort();
      filterParts.push(`mustHave:${sortedMustHave.join(',')}`);
    }

    if (filterParts.length > 0) {
      filtersHash = filterParts.join('|');
    }
  }

  // Combine components
  const rawKey = `${params.sessionId}:${normalizedQuery}:${params.mode}:${locationHash}:${filtersHash}`;

  // Hash for consistent length and privacy
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

describe('IdempotencyKeyGenerator - Backward Compatibility', () => {
  const generator = new IdempotencyKeyGenerator();

  it('should generate identical keys for simple query', () => {
    const params = {
      sessionId: 'sess-123',
      query: 'pizza',
      mode: 'async' as const
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys');
  });

  it('should generate identical keys with location', () => {
    const params = {
      sessionId: 'sess-456',
      query: 'sushi near me',
      mode: 'sync' as const,
      userLocation: { lat: 32.0853, lng: 34.7818 }
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys with location');
  });

  it('should generate identical keys with filters', () => {
    const params = {
      sessionId: 'sess-789',
      query: 'restaurant',
      mode: 'async' as const,
      filters: {
        openNow: true,
        priceLevel: 2
      }
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys with filters');
  });

  it('should generate identical keys with complex filters', () => {
    const params = {
      sessionId: 'sess-abc',
      query: 'kosher food',
      mode: 'async' as const,
      userLocation: { lat: 40.7128, lng: -74.0060 },
      filters: {
        openNow: true,
        priceLevel: 3,
        dietary: ['vegan', 'kosher', 'halal'],
        mustHave: ['wifi', 'parking', 'outdoor']
      }
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys with complex filters');
  });

  it('should generate identical keys with null values', () => {
    const params = {
      sessionId: 'sess-null',
      query: 'burger',
      mode: 'sync' as const,
      userLocation: null,
      filters: null
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys with null values');
  });

  it('should generate identical keys with empty filters', () => {
    const params = {
      sessionId: 'sess-empty',
      query: 'cafe',
      mode: 'async' as const,
      filters: {}
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys with empty filters');
  });

  it('should generate identical keys with unnormalized query', () => {
    const params = {
      sessionId: 'sess-normalize',
      query: '  Pizza  NEAR   Me  ',
      mode: 'async' as const
    };

    const oldKey = generateIdempotencyKeyOld(params);
    const newKey = generator.generate(params);

    assert.equal(newKey, oldKey, 'New implementation must generate identical keys with unnormalized query');
  });

  it('should generate identical keys for all test cases', () => {
    const testCases = [
      {
        sessionId: 'sess-1',
        query: 'pizza',
        mode: 'async' as const
      },
      {
        sessionId: 'sess-2',
        query: 'sushi',
        mode: 'sync' as const,
        userLocation: { lat: 32.0853, lng: 34.7818 }
      },
      {
        sessionId: 'sess-3',
        query: 'burger',
        mode: 'async' as const,
        filters: { openNow: true }
      },
      {
        sessionId: 'sess-4',
        query: 'tacos',
        mode: 'async' as const,
        userLocation: { lat: 40.7128, lng: -74.0060 },
        filters: { dietary: ['vegan'], mustHave: ['wifi'] }
      }
    ];

    for (const testCase of testCases) {
      const oldKey = generateIdempotencyKeyOld(testCase);
      const newKey = generator.generate(testCase);
      assert.equal(newKey, oldKey, `Keys must match for case: ${JSON.stringify(testCase)}`);
    }
  });
});
