/**
 * Cache Policy Tests
 * Tests TTL calculation logic with defensive null handling
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { getTTLForQuery, getTTLForEmptyResults, getL1TTL, isEmptyResults } from '../cache-policy.js';

describe('getTTLForQuery - Null Safety', () => {
  it('should return default TTL (900s) for null query', () => {
    const ttl = getTTLForQuery(null);
    assert.strictEqual(ttl, 900, 'null query should return 900s (15 min)');
  });

  it('should return default TTL (900s) for undefined query', () => {
    const ttl = getTTLForQuery(undefined);
    assert.strictEqual(ttl, 900, 'undefined query should return 900s (15 min)');
  });

  it('should return default TTL (900s) for empty string', () => {
    const ttl = getTTLForQuery('');
    assert.strictEqual(ttl, 900, 'empty string should return 900s (15 min)');
  });

  it('should return default TTL (900s) for non-string types', () => {
    // @ts-expect-error - testing runtime safety
    const ttl1 = getTTLForQuery(123);
    assert.strictEqual(ttl1, 900, 'number should return 900s');

    // @ts-expect-error - testing runtime safety
    const ttl2 = getTTLForQuery({});
    assert.strictEqual(ttl2, 900, 'object should return 900s');

    // @ts-expect-error - testing runtime safety
    const ttl3 = getTTLForQuery([]);
    assert.strictEqual(ttl3, 900, 'array should return 900s');
  });
});

describe('getTTLForQuery - Time Sensitivity', () => {
  it('should return 300s for time-sensitive queries in English', () => {
    assert.strictEqual(getTTLForQuery('pizza open now'), 300, 'open now query');
    assert.strictEqual(getTTLForQuery('restaurants open'), 300, 'open query');
    assert.strictEqual(getTTLForQuery('find something now'), 300, 'now query');
  });

  it('should return 300s for time-sensitive queries in Hebrew', () => {
    assert.strictEqual(getTTLForQuery('פיצה פתוח עכשיו'), 300, 'Hebrew open now query');
    assert.strictEqual(getTTLForQuery('מסעדות פתוח'), 300, 'Hebrew open query');
    assert.strictEqual(getTTLForQuery('עכשיו'), 300, 'Hebrew now query');
  });

  it('should return 900s for non-time-sensitive queries', () => {
    assert.strictEqual(getTTLForQuery('italian restaurant'), 900, 'general query');
    assert.strictEqual(getTTLForQuery('pizza near me'), 900, 'location query');
    assert.strictEqual(getTTLForQuery('best sushi'), 900, 'quality query');
  });

  it('should be case-insensitive', () => {
    assert.strictEqual(getTTLForQuery('Pizza OPEN Now'), 300, 'mixed case should detect time-sensitive');
    assert.strictEqual(getTTLForQuery('OPEN NOW'), 300, 'uppercase should detect time-sensitive');
  });
});

describe('getTTLForQuery - Landmark Use Cases', () => {
  it('should handle landmark queries with null keyword', () => {
    // Simulates landmark query where keyword is null
    const ttl = getTTLForQuery(null);
    assert.strictEqual(ttl, 900, 'landmark with null keyword should use default TTL');
  });

  it('should handle landmark queries with landmark name', () => {
    const ttl = getTTLForQuery('Eiffel Tower');
    assert.strictEqual(ttl, 900, 'landmark name should use default TTL (no time keywords)');
  });

  it('should handle landmark queries with time constraints', () => {
    const ttl = getTTLForQuery('near Eiffel Tower open now');
    assert.strictEqual(ttl, 300, 'landmark with time constraint should use short TTL');
  });
});

describe('getTTLForEmptyResults', () => {
  it('should return 120s for empty results', () => {
    const ttl = getTTLForEmptyResults();
    assert.strictEqual(ttl, 120, 'empty results should have 2 min TTL');
  });
});

describe('getL1TTL', () => {
  it('should cap L1 TTL at 60s for non-empty results', () => {
    assert.strictEqual(getL1TTL(900, false), 60, '900s base should cap at 60s');
    assert.strictEqual(getL1TTL(300, false), 60, '300s base should cap at 60s');
    assert.strictEqual(getL1TTL(45, false), 45, '45s base should not be capped');
  });

  it('should return 30s for empty results', () => {
    assert.strictEqual(getL1TTL(900, true), 30, 'empty results should get 30s L1 TTL');
    assert.strictEqual(getL1TTL(300, true), 30, 'empty results should get 30s L1 TTL');
  });
});

describe('isEmptyResults', () => {
  it('should identify empty arrays', () => {
    assert.strictEqual(isEmptyResults([]), true, 'empty array should be empty results');
  });

  it('should identify non-empty arrays', () => {
    assert.strictEqual(isEmptyResults([1, 2, 3]), false, 'non-empty array should not be empty results');
  });

  it('should handle non-array values', () => {
    assert.strictEqual(isEmptyResults(null), false, 'null should not be empty results');
    assert.strictEqual(isEmptyResults(undefined), false, 'undefined should not be empty results');
    assert.strictEqual(isEmptyResults({}), false, 'object should not be empty results');
    assert.strictEqual(isEmptyResults(''), false, 'string should not be empty results');
  });
});

describe('Cache Policy Integration', () => {
  it('should never throw for any input to getTTLForQuery', () => {
    const inputs = [
      null,
      undefined,
      '',
      'valid query',
      123,
      {},
      [],
      true,
      false,
      NaN,
      Infinity
    ];

    for (const input of inputs) {
      try {
        // @ts-expect-error - testing runtime safety
        const ttl = getTTLForQuery(input);
        assert.ok(typeof ttl === 'number' && ttl > 0, `TTL should be positive number for input: ${input}`);
      } catch (error) {
        assert.fail(`getTTLForQuery should not throw for input: ${input}, but threw: ${error}`);
      }
    }
  });
});
