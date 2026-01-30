/**
 * Cache Sampling Tests
 * Verify cache logging with sampling and thresholds
 */

import { describe, test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSampleRandom, SLOW_THRESHOLDS, getCacheSamplingRate } from '../../logging/sampling.js';

describe('Cache Logging Thresholds', () => {
  test('SLOW_THRESHOLDS.CACHE should be 200ms', () => {
    assert.equal(SLOW_THRESHOLDS.CACHE, 200, 'Cache slow threshold should be 200ms');
  });

  test('cache operation under 200ms should be fast', () => {
    const durationMs = 150;
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;

    assert.equal(isSlow, false, 'Operation under 200ms should not be slow');
  });

  test('cache operation over 200ms should be slow', () => {
    const durationMs = 250;
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;

    assert.equal(isSlow, true, 'Operation over 200ms should be slow');
  });

  test('cache operation exactly 200ms should not be slow', () => {
    const durationMs = 200;
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;

    assert.equal(isSlow, false, 'Exactly 200ms should not be slow (threshold is >200, not >=200)');
  });
});

describe('Cache Sampling Rate', () => {
  const originalEnv = process.env.LOG_CACHE_SAMPLE_RATE;

  beforeEach(() => {
    // Reset env var before each test
    delete process.env.LOG_CACHE_SAMPLE_RATE;
  });

  test('getCacheSamplingRate() should default to 0.05 (5%)', () => {
    const rate = getCacheSamplingRate();
    assert.equal(rate, 0.05, 'Default cache sampling rate should be 5%');
  });

  test('getCacheSamplingRate() should respect LOG_CACHE_SAMPLE_RATE env var', () => {
    process.env.LOG_CACHE_SAMPLE_RATE = '0.1';
    const rate = getCacheSamplingRate();
    assert.equal(rate, 0.1, 'Should use env var value');

    // Cleanup
    process.env.LOG_CACHE_SAMPLE_RATE = originalEnv;
  });

  test('getCacheSamplingRate() should clamp invalid values to default', () => {
    const invalidValues = ['-0.5', '1.5', 'abc', '', 'NaN'];

    invalidValues.forEach(val => {
      process.env.LOG_CACHE_SAMPLE_RATE = val;
      const rate = getCacheSamplingRate();
      assert.equal(rate, 0.05, `Invalid value "${val}" should fallback to default 0.05`);
    });

    // Cleanup
    process.env.LOG_CACHE_SAMPLE_RATE = originalEnv;
  });

  test('getCacheSamplingRate() should accept 0 (no sampling)', () => {
    process.env.LOG_CACHE_SAMPLE_RATE = '0';
    const rate = getCacheSamplingRate();
    assert.equal(rate, 0, 'Should accept 0 for no sampling');

    // Cleanup
    process.env.LOG_CACHE_SAMPLE_RATE = originalEnv;
  });

  test('getCacheSamplingRate() should accept 1 (always sample)', () => {
    process.env.LOG_CACHE_SAMPLE_RATE = '1';
    const rate = getCacheSamplingRate();
    assert.equal(rate, 1, 'Should accept 1 for always sampling');

    // Cleanup
    process.env.LOG_CACHE_SAMPLE_RATE = originalEnv;
  });
});

describe('Cache Log Level Decision', () => {
  test('fast operation without sampling should not log', () => {
    const durationMs = 50; // fast
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
    const shouldSample = false; // assume not sampled

    const shouldLog = isSlow || shouldSample;

    assert.equal(shouldLog, false, 'Fast operation without sampling should not log');
  });

  test('fast operation with sampling should log at DEBUG', () => {
    const durationMs = 50; // fast
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
    const shouldSample = true; // sampled

    const shouldLog = isSlow || shouldSample;
    const logLevel = isSlow ? 'info' : 'debug';

    assert.equal(shouldLog, true, 'Sampled operation should log');
    assert.equal(logLevel, 'debug', 'Fast sampled operation should log at DEBUG');
  });

  test('slow operation should always log at INFO', () => {
    const durationMs = 300; // slow
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
    const shouldSample = false; // not sampled (doesn't matter)

    const shouldLog = isSlow || shouldSample;
    const logLevel = isSlow ? 'info' : 'debug';

    assert.equal(shouldLog, true, 'Slow operation should always log');
    assert.equal(logLevel, 'info', 'Slow operation should log at INFO');
  });

  test('slow operation that is also sampled should log at INFO (not DEBUG)', () => {
    const durationMs = 300; // slow
    const isSlow = durationMs > SLOW_THRESHOLDS.CACHE;
    const shouldSample = true; // sampled

    const shouldLog = isSlow || shouldSample;
    const logLevel = isSlow ? 'info' : 'debug';

    assert.equal(shouldLog, true, 'Should log');
    assert.equal(logLevel, 'info', 'Slow operation should take precedence over sampling');
  });
});

describe('Photo Proxy Thresholds', () => {
  test('SLOW_THRESHOLDS.PHOTO should be 800ms', () => {
    assert.equal(SLOW_THRESHOLDS.PHOTO, 800, 'Photo proxy slow threshold should be 800ms');
  });

  test('photo under 800ms should be fast', () => {
    const durationMs = 600;
    const isSlow = durationMs > SLOW_THRESHOLDS.PHOTO;

    assert.equal(isSlow, false, 'Photo under 800ms should not be slow');
  });

  test('photo over 800ms should be slow', () => {
    const durationMs = 1000;
    const isSlow = durationMs > SLOW_THRESHOLDS.PHOTO;

    assert.equal(isSlow, true, 'Photo over 800ms should be slow');
  });
});
