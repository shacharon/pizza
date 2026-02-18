/**
 * Tests for IdempotencyKeyGenerator
 * Ensures stable key generation for deduplication
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { IdempotencyKeyGenerator } from '../search.idempotency-key.generator.js';

describe('IdempotencyKeyGenerator', () => {
  const generator = new IdempotencyKeyGenerator();

  describe('normalizeQuery', () => {
    it('should lowercase query', () => {
      assert.equal(generator.normalizeQuery('Pizza'), 'pizza');
      assert.equal(generator.normalizeQuery('SUSHI'), 'sushi');
    });

    it('should trim whitespace', () => {
      assert.equal(generator.normalizeQuery('  pizza  '), 'pizza');
      assert.equal(generator.normalizeQuery('\tpizza\n'), 'pizza');
    });

    it('should collapse multiple spaces', () => {
      assert.equal(generator.normalizeQuery('pizza  near   me'), 'pizza near me');
      assert.equal(generator.normalizeQuery('pizza\t\tnear\nme'), 'pizza near me');
    });

    it('should handle combination of case, trim, and collapse', () => {
      assert.equal(generator.normalizeQuery('  Pizza  NEAR   Me  '), 'pizza near me');
    });
  });

  describe('hashLocation', () => {
    it('should return "no-location" when location is null', () => {
      assert.equal(generator.hashLocation(null), 'no-location');
    });

    it('should return "no-location" when location is undefined', () => {
      assert.equal(generator.hashLocation(undefined), 'no-location');
    });

    it('should format location to 4 decimal places', () => {
      assert.equal(generator.hashLocation({ lat: 32.0853, lng: 34.7818 }), '32.0853,34.7818');
    });

    it('should handle float precision by rounding to 4 decimal places', () => {
      assert.equal(generator.hashLocation({ lat: 32.08529999, lng: 34.78179999 }),
        '32.0853,34.7818');
      assert.equal(generator.hashLocation({ lat: 32.08531111, lng: 34.78181111 }),
        '32.0853,34.7818');
    });

    it('should produce same hash for slightly different float values', () => {
      const hash1 = generator.hashLocation({ lat: 32.08529, lng: 34.78179 });
      const hash2 = generator.hashLocation({ lat: 32.08531, lng: 34.78181 });
      assert.equal(hash1, hash2);
    });

    it('should handle negative coordinates', () => {
      assert.equal(generator.hashLocation({ lat: -33.8688, lng: 151.2093 }),
        '-33.8688,151.2093');
    });
  });

  describe('serializeFilters', () => {
    it('should return "no-filters" when filters is null', () => {
      assert.equal(generator.serializeFilters(null), 'no-filters');
    });

    it('should return "no-filters" when filters is undefined', () => {
      assert.equal(generator.serializeFilters(undefined), 'no-filters');
    });

    it('should return "no-filters" when filters object is empty', () => {
      assert.equal(generator.serializeFilters({}), 'no-filters');
    });

    it('should serialize openNow filter', () => {
      assert.equal(generator.serializeFilters({ openNow: true }), 'openNow:true');
      assert.equal(generator.serializeFilters({ openNow: false }), 'openNow:false');
    });

    it('should serialize priceLevel filter', () => {
      assert.equal(generator.serializeFilters({ priceLevel: 2 }), 'priceLevel:2');
      assert.equal(generator.serializeFilters({ priceLevel: 0 }), 'priceLevel:0');
    });

    it('should serialize dietary filter with sorted values', () => {
      assert.equal(generator.serializeFilters({ dietary: ['vegan', 'kosher'] }),
        'dietary:kosher,vegan');
      assert.equal(generator.serializeFilters({ dietary: ['kosher', 'vegan'] }),
        'dietary:kosher,vegan');
    });

    it('should serialize mustHave filter with sorted values', () => {
      assert.equal(generator.serializeFilters({ mustHave: ['wifi', 'parking'] }),
        'mustHave:parking,wifi');
      assert.equal(generator.serializeFilters({ mustHave: ['parking', 'wifi'] }),
        'mustHave:parking,wifi');
    });

    it('should ignore empty dietary array', () => {
      assert.equal(generator.serializeFilters({ dietary: [] }), 'no-filters');
    });

    it('should ignore empty mustHave array', () => {
      assert.equal(generator.serializeFilters({ mustHave: [] }), 'no-filters');
    });

    it('should serialize multiple filters in consistent order', () => {
      const filters = {
        openNow: true,
        priceLevel: 2,
        dietary: ['vegan'],
        mustHave: ['wifi']
      };
      assert.equal(generator.serializeFilters(filters),
        'openNow:true|priceLevel:2|dietary:vegan|mustHave:wifi');
    });

    it('should be order-independent for array values', () => {
      const filters1 = {
        dietary: ['vegan', 'kosher', 'halal'],
        mustHave: ['wifi', 'parking', 'outdoor']
      };
      const filters2 = {
        dietary: ['halal', 'vegan', 'kosher'],
        mustHave: ['outdoor', 'wifi', 'parking']
      };
      assert.equal(generator.serializeFilters(filters1),
        generator.serializeFilters(filters2));
    });
  });

  describe('generate', () => {
    it('should generate consistent hash for same inputs', () => {
      const params = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: { lat: 32.0853, lng: 34.7818 },
        filters: { openNow: true }
      };

      const key1 = generator.generate(params);
      const key2 = generator.generate(params);

      assert.equal(key1, key2);
      assert.match(key1, /^[a-f0-9]{64}$/); // SHA256 hex
    });

    it('should generate same hash for normalized queries', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'Pizza Near Me',
        mode: 'async' as const
      };
      const params2 = {
        sessionId: 'sess-123',
        query: '  pizza  near   me  ',
        mode: 'async' as const
      };

      assert.equal(generator.generate(params1), generator.generate(params2));
    });

    it('should generate same hash for equivalent locations', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: { lat: 32.08529, lng: 34.78179 }
      };
      const params2 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: { lat: 32.08531, lng: 34.78181 }
      };

      assert.equal(generator.generate(params1), generator.generate(params2));
    });

    it('should generate same hash for reordered filter arrays', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        filters: { dietary: ['vegan', 'kosher'], mustHave: ['wifi', 'parking'] }
      };
      const params2 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        filters: { dietary: ['kosher', 'vegan'], mustHave: ['parking', 'wifi'] }
      };

      assert.equal(generator.generate(params1), generator.generate(params2));
    });

    it('should generate different hashes for different queries', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const
      };
      const params2 = {
        sessionId: 'sess-123',
        query: 'sushi',
        mode: 'async' as const
      };

      assert.notEqual(generator.generate(params1), generator.generate(params2));
    });

    it('should generate different hashes for different sessions', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const
      };
      const params2 = {
        sessionId: 'sess-456',
        query: 'pizza',
        mode: 'async' as const
      };

      assert.notEqual(generator.generate(params1), generator.generate(params2));
    });

    it('should generate different hashes for different modes', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'sync' as const
      };
      const params2 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const
      };

      assert.notEqual(generator.generate(params1), generator.generate(params2));
    });

    it('should generate different hashes for different locations', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: { lat: 32.0853, lng: 34.7818 }
      };
      const params2 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: { lat: 40.7128, lng: -74.0060 }
      };

      assert.notEqual(generator.generate(params1), generator.generate(params2));
    });

    it('should generate different hashes for different filters', () => {
      const params1 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        filters: { openNow: true }
      };
      const params2 = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        filters: { openNow: false }
      };

      assert.notEqual(generator.generate(params1), generator.generate(params2));
    });

    it('should handle null location and filters', () => {
      const params = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: null,
        filters: null
      };

      const key = generator.generate(params);
      assert.match(key, /^[a-f0-9]{64}$/);
    });

    it('should handle missing location and filters', () => {
      const params = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const
      };

      const key = generator.generate(params);
      assert.match(key, /^[a-f0-9]{64}$/);
    });

    // Snapshot test: Verify exact key format hasn't changed
    it('should generate expected key for known inputs (regression test)', () => {
      const params = {
        sessionId: 'sess-123',
        query: 'pizza',
        mode: 'async' as const,
        userLocation: { lat: 32.0853, lng: 34.7818 },
        filters: {
          openNow: true,
          priceLevel: 2,
          dietary: ['vegan', 'kosher'],
          mustHave: ['wifi']
        }
      };

      const actualKey = generator.generate(params);

      // Calculate the expected hash (regression test - this should never change)
      const rawKey = 'sess-123:pizza:async:32.0853,34.7818:openNow:true|priceLevel:2|dietary:kosher,vegan|mustHave:wifi';
      const correctExpectedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

      assert.equal(actualKey, correctExpectedKey);
      assert.match(actualKey, /^[a-f0-9]{64}$/);
    });
  });
});
