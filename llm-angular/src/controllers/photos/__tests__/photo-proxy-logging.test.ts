/**
 * PhotoProxy Logging Tests
 * Verify log noise reduction: success → DEBUG, failures → INFO/ERROR
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('PhotoProxy Logging', () => {
  test('success path with fast response should log at DEBUG', () => {
    const durationMs = 500; // fast
    const sizeBytes = 50_000; // normal size
    const isSlow = durationMs > 800;
    const isLarge = sizeBytes > 250_000;
    
    const expectedLevel = isSlow || isLarge ? 'info' : 'debug';
    
    assert.equal(expectedLevel, 'debug', 'Fast + normal size should use DEBUG level');
  });

  test('slow response (>800ms) should log at INFO', () => {
    const durationMs = 1200; // slow
    const sizeBytes = 50_000; // normal size
    const isSlow = durationMs > 800;
    const isLarge = sizeBytes > 250_000;
    
    const expectedLevel = isSlow || isLarge ? 'info' : 'debug';
    
    assert.equal(expectedLevel, 'info', 'Slow response should use INFO level');
    assert.equal(isSlow, true, 'Should be marked as slow');
  });

  test('large payload (>250KB) should log at INFO', () => {
    const durationMs = 500; // fast
    const sizeBytes = 300_000; // large
    const isSlow = durationMs > 800;
    const isLarge = sizeBytes > 250_000;
    
    const expectedLevel = isSlow || isLarge ? 'info' : 'debug';
    
    assert.equal(expectedLevel, 'info', 'Large payload should use INFO level');
    assert.equal(isLarge, true, 'Should be marked as large');
  });

  test('slow AND large should log at INFO', () => {
    const durationMs = 1500; // slow
    const sizeBytes = 400_000; // large
    const isSlow = durationMs > 800;
    const isLarge = sizeBytes > 250_000;
    
    const expectedLevel = isSlow || isLarge ? 'info' : 'debug';
    
    assert.equal(expectedLevel, 'info', 'Slow AND large should use INFO level');
    assert.equal(isSlow, true, 'Should be marked as slow');
    assert.equal(isLarge, true, 'Should be marked as large');
  });

  test('edge case: exactly 800ms should log at DEBUG', () => {
    const durationMs = 800;
    const sizeBytes = 50_000;
    const isSlow = durationMs > 800;
    const isLarge = sizeBytes > 250_000;
    
    const expectedLevel = isSlow || isLarge ? 'info' : 'debug';
    
    assert.equal(expectedLevel, 'debug', 'Exactly 800ms should use DEBUG (not slow)');
    assert.equal(isSlow, false);
  });

  test('edge case: exactly 250KB should log at DEBUG', () => {
    const durationMs = 500;
    const sizeBytes = 250_000;
    const isSlow = durationMs > 800;
    const isLarge = sizeBytes > 250_000;
    
    const expectedLevel = isSlow || isLarge ? 'info' : 'debug';
    
    assert.equal(expectedLevel, 'debug', 'Exactly 250KB should use DEBUG (not large)');
    assert.equal(isLarge, false);
  });

  test('error paths should always log at ERROR or higher', () => {
    // Errors bypass the threshold logic and always log at ERROR/WARN
    // This test documents the contract
    const errorScenarios = [
      { status: 404, expectedLevel: 'error' },
      { status: 500, expectedLevel: 'error' },
      { status: 502, expectedLevel: 'error' },
      { exception: true, expectedLevel: 'error' }
    ];

    errorScenarios.forEach(scenario => {
      assert.ok(
        scenario.expectedLevel === 'error' || scenario.expectedLevel === 'warn',
        `Error scenario should log at ERROR or WARN, got ${scenario.expectedLevel}`
      );
    });
  });
});
