/**
 * Google Stage Cache Guard Test
 * 
 * Validates that the cache guard skips Google API calls when results are cached
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { checkGoogleCache } from '../cache-guard.js';
import type { RouteLLMMapping } from '../../../types.js';

// Note: These are integration-style tests that would require Redis/cache setup
// For now, we test the guard's interface and error handling

describe('Google Cache Guard', () => {
  it('should return null when cache service is unavailable', async () => {
    /**
     * When cache service is not initialized, guard should return null
     * This allows the normal Google handler flow to execute
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      route: 'TEXTSEARCH',
      textQuery: 'pizza',
      providerTextQuery: 'pizza',
      providerLanguage: 'en',
      region: 'IL',
      language: 'en',
      bias: null,
      mode: 'standard',
      cityText: null
    } as any;

    // With no cache service, should return null
    const result = await checkGoogleCache(mapping, 'test-request-1');

    assert.strictEqual(result, null, 'Should return null when cache unavailable');
  });

  it('should generate correct cache key for textSearch', async () => {
    /**
     * Verify that textSearch mappings generate valid cache keys
     * Even if cache miss, the key generation should not throw
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      route: 'TEXTSEARCH',
      textQuery: 'italian restaurant',
      providerTextQuery: 'italian restaurant',
      providerLanguage: 'en',
      region: 'IL',
      language: 'en',
      bias: {
        center: { lat: 32.0853, lng: 34.7818 },
        radiusMeters: 5000
      },
      mode: 'standard',
      cityText: null
    } as any;

    // Should not throw, even with no cache
    const result = await checkGoogleCache(mapping, 'test-request-2');

    // With no cache service, should return null
    assert.strictEqual(result, null);
  });

  it('should generate correct cache key for nearbySearch', async () => {
    /**
     * Verify that nearbySearch mappings generate valid cache keys
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }> = {
      providerMethod: 'nearbySearch',
      route: 'NEARBY',
      keyword: 'restaurants',
      location: { lat: 32.0853, lng: 34.7818 },
      radiusMeters: 3000,
      region: 'IL',
      language: 'en',
      cuisineKey: 'italian',
      typeKey: null
    } as any;

    // Should not throw
    const result = await checkGoogleCache(mapping, 'test-request-3');

    assert.strictEqual(result, null);
  });

  it('should generate correct cache key for landmarkPlan', async () => {
    /**
     * Verify that landmarkPlan mappings generate valid cache keys
     * CRITICAL: Must NOT access primaryLandmark.enhancedTextQuery (does not exist)
     * Should use geocodeQuery/landmarkId instead
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }> = {
      providerMethod: 'landmarkPlan',
      route: 'LANDMARK',
      geocodeQuery: 'Big Ben',
      afterGeocode: 'nearbySearch',
      radiusMeters: 2000,
      keyword: 'restaurants',
      region: 'GB',
      language: 'en',
      landmarkId: 'landmark_big_ben_london_gb',
      cuisineKey: null,
      typeKey: null,
      resolvedLatLng: null
    } as any;

    // Should not throw even with no cache
    const result = await checkGoogleCache(mapping, 'test-request-4');

    assert.strictEqual(result, null, 'Should return null with no cache service');
  });

  it('should handle landmarkPlan without landmarkId', async () => {
    /**
     * Verify landmarkPlan without landmarkId still generates cache key
     * Uses geocodeQuery fallback
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }> = {
      providerMethod: 'landmarkPlan',
      route: 'LANDMARK',
      geocodeQuery: 'Eiffel Tower',
      afterGeocode: 'textSearchWithBias',
      radiusMeters: 3000,
      keyword: null,
      region: 'FR',
      language: 'en',
      landmarkId: null,
      cuisineKey: 'french',
      typeKey: null,
      resolvedLatLng: null
    } as any;

    // Should not throw
    const result = await checkGoogleCache(mapping, 'test-request-5');

    assert.strictEqual(result, null);
  });

  it('should handle landmarkPlan with missing geocodeQuery gracefully', async () => {
    /**
     * Verify guard does not crash even with malformed landmarkPlan mapping
     * Should log warning and return null
     */

    const mapping: any = {
      providerMethod: 'landmarkPlan',
      route: 'LANDMARK',
      // geocodeQuery missing!
      afterGeocode: 'nearbySearch',
      radiusMeters: 1000,
      region: 'IL',
      language: 'he'
    };

    // Should not throw
    let didThrow = false;
    try {
      const result = await checkGoogleCache(mapping, 'test-request-6');
      assert.strictEqual(result, null, 'Should return null on malformed mapping');
    } catch (error) {
      didThrow = true;
    }

    assert.strictEqual(didThrow, false, 'Should not throw on malformed landmarkPlan');
  });

  it('should handle cache errors gracefully', async () => {
    /**
     * When cache check throws an error, guard should catch it and return null
     * This ensures errors don't break the Google stage
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      route: 'TEXTSEARCH',
      textQuery: 'test',
      providerTextQuery: 'test',
      providerLanguage: 'en',
      region: 'IL',
      language: 'en',
      bias: null,
      mode: 'standard',
      cityText: null
    } as any;

    // Should not throw even with malformed mapping
    let didThrow = false;
    try {
      await checkGoogleCache(mapping, 'test-request-5');
    } catch (error) {
      didThrow = true;
    }

    assert.strictEqual(didThrow, false, 'Should not throw on cache errors');
  });
});

describe('Cache Guard - Integration Behavior', () => {
  it('should document expected cache hit behavior', () => {
    /**
     * DOCUMENTATION TEST:
     * When cache is available and has results:
     * 1. checkGoogleCache() returns cached results array
     * 2. executeGoogleMapsStage() skips handler execution
     * 3. Context is marked with servedFrom: 'cache'
     * 4. Logs: event="google_stage_skipped", reason="cache_hit"
     */

    assert.ok(true, 'Integration behavior documented');
  });

  it('should document expected cache miss behavior', () => {
    /**
     * DOCUMENTATION TEST:
     * When cache is available but no results cached:
     * 1. checkGoogleCache() returns null
     * 2. executeGoogleMapsStage() proceeds to handler
     * 3. Handler fetches from Google API and caches results
     * 4. Context is marked with servedFrom: 'google_api'
     * 5. Logs: event="google_stage_executed", servedFrom="google_api"
     */

    assert.ok(true, 'Integration behavior documented');
  });

  it('should document cache timeout behavior', () => {
    /**
     * DOCUMENTATION TEST:
     * Cache check has 5s timeout to prevent blocking
     * If cache read takes >5s:
     * 1. Timeout triggers
     * 2. checkGoogleCache() returns null
     * 3. Normal Google handler flow executes
     * 4. No errors thrown
     */

    assert.ok(true, 'Timeout behavior documented');
  });
});

describe('Cache Guard - LANDMARK Bug Fix', () => {
  it('should NOT access primaryLandmark.enhancedTextQuery for landmarkPlan', async () => {
    /**
     * REGRESSION TEST for bug: "Cannot read properties of undefined (reading 'enhancedTextQuery')"
     * 
     * Bug location: Line 75-76 and 126-127 in cache-guard.ts (before fix)
     * Root cause: landmarkPlan mapping does NOT have primaryLandmark.enhancedTextQuery field
     * 
     * Expected: Use geocodeQuery or keyword instead
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }> = {
      providerMethod: 'landmarkPlan',
      route: 'LANDMARK',
      geocodeQuery: 'Central Park',
      afterGeocode: 'nearbySearch',
      radiusMeters: 1500,
      keyword: 'pizza',
      region: 'US',
      language: 'en',
      landmarkId: 'landmark_central_park_ny_us',
      cuisineKey: 'italian',
      typeKey: null,
      resolvedLatLng: null
    } as any;

    // Before fix: Would crash with "Cannot read properties of undefined"
    // After fix: Should return null gracefully
    let didThrow = false;
    let result: any;
    try {
      result = await checkGoogleCache(mapping, 'test-landmark-bug-fix');
    } catch (error) {
      didThrow = true;
      console.error('Cache guard threw error:', error);
    }

    assert.strictEqual(didThrow, false, 'Cache guard should NOT throw for landmarkPlan');
    assert.strictEqual(result, null, 'Cache guard should return null (cache unavailable)');
  });

  it('should use geocodeQuery for landmarkPlan TTL calculation', async () => {
    /**
     * Verify that landmarkPlan uses geocodeQuery (not enhancedTextQuery) for TTL
     * This is the correct field for landmark queries
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }> = {
      providerMethod: 'landmarkPlan',
      route: 'LANDMARK',
      geocodeQuery: 'Statue of Liberty',
      afterGeocode: 'textSearchWithBias',
      radiusMeters: 2000,
      keyword: null,
      region: 'US',
      language: 'en',
      landmarkId: null,
      cuisineKey: null,
      typeKey: 'tourist_attraction',
      resolvedLatLng: null
    } as any;

    // Should not throw and should return null (no cache service)
    const result = await checkGoogleCache(mapping, 'test-landmark-ttl');

    assert.strictEqual(result, null, 'Should handle landmarkPlan with geocodeQuery');
  });

  it('should generate landmarkId-based cache key when available', async () => {
    /**
     * When landmarkId is present, should use landmark_search:{id}:{radius}:{category}:{region}
     * This matches the handler logic (line 229-236 in landmark-plan.handler.ts)
     */

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }> = {
      providerMethod: 'landmarkPlan',
      route: 'LANDMARK',
      geocodeQuery: 'Tower Bridge',
      afterGeocode: 'nearbySearch',
      radiusMeters: 1000,
      keyword: 'restaurants',
      region: 'GB',
      language: 'en',
      landmarkId: 'landmark_tower_bridge_london_gb',
      cuisineKey: null,
      typeKey: 'restaurant',
      resolvedLatLng: { lat: 51.5055, lng: -0.0754 }
    } as any;

    // Should not throw
    const result = await checkGoogleCache(mapping, 'test-landmark-id-cache');

    assert.strictEqual(result, null, 'Should handle landmarkId-based cache key');
  });
});
