/**
 * Tests for Sampling Utility
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSample,
  shouldSampleRandom,
  isSlowOperation,
  SAMPLING_RATES,
  SLOW_THRESHOLDS
} from './sampling.js';

describe('Sampling Utility', () => {
  describe('shouldSample', () => {
    test('should never sample when rate is 0', () => {
      assert.equal(shouldSample('test-key-1', 0), false);
      assert.equal(shouldSample('test-key-2', 0), false);
    });

    test('should always sample when rate is 1', () => {
      assert.equal(shouldSample('test-key-1', 1), true);
      assert.equal(shouldSample('test-key-2', 1), true);
    });

    test('should be deterministic for same key', () => {
      const key = 'test-key-consistent';
      const rate = 0.5;

      const result1 = shouldSample(key, rate);
      const result2 = shouldSample(key, rate);
      const result3 = shouldSample(key, rate);

      assert.equal(result1, result2);
      assert.equal(result2, result3);
    });

    test('should be deterministic with seed', () => {
      const key = 'test-key';
      const rate = 0.5;
      const seed = 12345;

      const result1 = shouldSample(key, rate, seed);
      const result2 = shouldSample(key, rate, seed);

      assert.equal(result1, result2);
    });

    test('should produce different results for different keys', () => {
      const rate = 0.5;

      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(shouldSample(`request-${i}`, rate));
      }

      // With 100 samples at 50% rate, we should see some variety
      // (Not requiring perfect 50/50 distribution, just that it's not all true or all false)
      const trueCount = results.filter(r => r).length;
      assert.ok(trueCount > 0 && trueCount < 100,
        `Should have mix of true/false, got ${trueCount} true out of 100`);
    });

    test('should approximate sampling rate over many keys', () => {
      const rate = 0.1; // 10%
      const numKeys = 1000;
      const seed = 42;

      let sampledCount = 0;
      for (let i = 0; i < numKeys; i++) {
        if (shouldSample(`key-${i}`, rate, seed)) {
          sampledCount++;
        }
      }

      const actualRate = sampledCount / numKeys;
      // Should be within 5% of target rate (relaxed tolerance for simple hash)
      assert.ok(actualRate > 0.05, `Rate ${actualRate} should be > 0.05`);
      assert.ok(actualRate < 0.15, `Rate ${actualRate} should be < 0.15`);
    });

    test('should handle edge cases', () => {
      assert.ok(shouldSample('', 0.5) !== undefined);
      assert.equal(shouldSample('test', -0.1), false);
      assert.equal(shouldSample('test', 1.5), true);
    });
  });

  describe('shouldSampleRandom', () => {
    test('should never sample when rate is 0', () => {
      for (let i = 0; i < 10; i++) {
        assert.equal(shouldSampleRandom(0), false);
      }
    });

    test('should always sample when rate is 1', () => {
      for (let i = 0; i < 10; i++) {
        assert.equal(shouldSampleRandom(1), true);
      }
    });

    test('should approximate sampling rate over many attempts', () => {
      const rate = 0.1; // 10%
      const numAttempts = 1000;

      let sampledCount = 0;
      for (let i = 0; i < numAttempts; i++) {
        if (shouldSampleRandom(rate)) {
          sampledCount++;
        }
      }

      const actualRate = sampledCount / numAttempts;
      // Should be within 5% of target rate (more tolerance for random)
      assert.ok(actualRate > 0.05);
      assert.ok(actualRate < 0.15);
    });
  });

  describe('isSlowOperation', () => {
    test('should detect slow operations correctly', () => {
      assert.equal(isSlowOperation(1000, 500), true);
      assert.equal(isSlowOperation(500, 500), false);
      assert.equal(isSlowOperation(499, 500), false);
      assert.equal(isSlowOperation(501, 500), true);
    });

    test('should work with SLOW_THRESHOLDS constants', () => {
      // LLM threshold: 1500ms
      assert.equal(isSlowOperation(1499, SLOW_THRESHOLDS.LLM), false);
      assert.equal(isSlowOperation(1500, SLOW_THRESHOLDS.LLM), false);
      assert.equal(isSlowOperation(1501, SLOW_THRESHOLDS.LLM), true);

      // Google API threshold: 2000ms
      assert.equal(isSlowOperation(1999, SLOW_THRESHOLDS.GOOGLE_API), false);
      assert.equal(isSlowOperation(2000, SLOW_THRESHOLDS.GOOGLE_API), false);
      assert.equal(isSlowOperation(2001, SLOW_THRESHOLDS.GOOGLE_API), true);

      // Stage threshold: 2000ms
      assert.equal(isSlowOperation(1999, SLOW_THRESHOLDS.STAGE), false);
      assert.equal(isSlowOperation(2001, SLOW_THRESHOLDS.STAGE), true);
    });
  });

  describe('SAMPLING_RATES constants', () => {
    test('should have correct values', () => {
      assert.equal(SAMPLING_RATES.NEVER, 0);
      assert.equal(SAMPLING_RATES.LOW, 0.01);
      assert.equal(SAMPLING_RATES.MEDIUM, 0.1);
      assert.equal(SAMPLING_RATES.HIGH, 0.5);
      assert.equal(SAMPLING_RATES.ALWAYS, 1);
    });
  });

  describe('SLOW_THRESHOLDS constants', () => {
    test('should have correct values', () => {
      assert.equal(SLOW_THRESHOLDS.LLM, 1500);
      assert.equal(SLOW_THRESHOLDS.GOOGLE_API, 2000);
      assert.equal(SLOW_THRESHOLDS.STAGE, 2000);
      assert.equal(SLOW_THRESHOLDS.HTTP, 5000);
    });
  });
});
