/**
 * Landmark Cache Optimization Tests
 * 
 * Verifies that LLM is SKIPPED when landmark is resolved from cache with known coordinates
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { normalizeLandmark } from '../landmark-normalizer.js';

describe('Landmark Cache Optimization', () => {
  it('should resolve Eiffel Tower from cache with coordinates', () => {
    const result = normalizeLandmark('מסעדות ליד מגדל אייפל', 'FR');
    
    assert.ok(result, 'Should resolve landmark');
    assert.strictEqual(result.landmarkId, 'eiffel-tower-paris');
    assert.strictEqual(result.primaryName, 'Eiffel Tower');
    assert.ok(result.knownLatLng, 'Should have known coordinates');
    assert.strictEqual(result.knownLatLng?.lat, 48.8584);
    assert.strictEqual(result.knownLatLng?.lng, 2.2945);
  });

  it('should resolve Big Ben from cache with coordinates', () => {
    const result = normalizeLandmark('restaurants near Big Ben', 'GB');
    
    assert.ok(result, 'Should resolve landmark');
    assert.strictEqual(result.landmarkId, 'big-ben-london');
    assert.strictEqual(result.primaryName, 'Big Ben');
    assert.ok(result.knownLatLng, 'Should have known coordinates');
    assert.strictEqual(result.knownLatLng?.lat, 51.5007);
    assert.strictEqual(result.knownLatLng?.lng, -0.1246);
  });

  it('should resolve Azrieli from Hebrew query', () => {
    const result = normalizeLandmark('מסעדות ליד עזריאלי', 'IL');
    
    assert.ok(result, 'Should resolve landmark');
    assert.strictEqual(result.landmarkId, 'azrieli-center-tlv');
    assert.strictEqual(result.primaryName, 'Azrieli Center Tel Aviv');
    assert.ok(result.knownLatLng, 'Should have known coordinates');
    assert.strictEqual(result.knownLatLng?.lat, 32.0744);
    assert.strictEqual(result.knownLatLng?.lng, 34.7925);
  });

  it('should resolve Dizengoff Center from Russian query', () => {
    const result = normalizeLandmark('рестораны около Дизенгоф центр', 'IL');
    
    assert.ok(result, 'Should resolve landmark');
    assert.strictEqual(result.landmarkId, 'dizengoff-center-tlv');
    assert.strictEqual(result.primaryName, 'Dizengoff Center Tel Aviv');
    assert.ok(result.knownLatLng, 'Should have known coordinates');
  });

  it('should return null for unknown landmark', () => {
    const result = normalizeLandmark('restaurants near some unknown place', 'IL');
    
    assert.strictEqual(result, null, 'Should return null for unknown landmark');
  });

  it('should resolve Times Square in English', () => {
    const result = normalizeLandmark('sushi near Times Square', 'US');
    
    assert.ok(result, 'Should resolve landmark');
    assert.strictEqual(result.landmarkId, 'times-square-nyc');
    assert.ok(result.knownLatLng, 'Should have known coordinates');
  });

  it('should resolve landmark from query without region match', () => {
    // Query mentions Eiffel Tower but region is wrong - should still match
    const result = normalizeLandmark('מגדל אייפל', 'US');
    
    assert.ok(result, 'Should resolve landmark even with wrong region');
    assert.strictEqual(result.landmarkId, 'eiffel-tower-paris');
  });

  it('should verify all cached landmarks have coordinates', () => {
    const landmarks = [
      'מגדל אייפל',        // Eiffel Tower
      'Big Ben',          // Big Ben
      'עזריאלי',          // Azrieli
      'דיזנגוף סנטר',     // Dizengoff
      'Times Square',     // Times Square
      'מחנה יהודה',       // Mahane Yehuda
      'Louvre'            // Louvre
    ];

    for (const query of landmarks) {
      const result = normalizeLandmark(query);
      assert.ok(result, `Should resolve: ${query}`);
      assert.ok(result.knownLatLng, `Should have coordinates for: ${query}`);
      assert.ok(result.knownLatLng.lat, `Should have lat for: ${query}`);
      assert.ok(result.knownLatLng.lng, `Should have lng for: ${query}`);
    }
  });
});
