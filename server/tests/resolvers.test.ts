/**
 * Pure Unit Tests for Phase 1 Deterministic Resolvers
 * 
 * CRITICAL: These tests are PURE - no network, no app bootstrap, no DI container
 * All async operations are mocked and return immediately
 * 
 * Tests cover:
 * - resolveSearchMode: Full, Assisted, Clarify mode selection
 * - resolveCenter: GPS, geocoded, and failed resolution
 * - resolveRadiusMeters: Explicit distance and defaults
 * 
 * References:
 * - docs/SEARCH_TRUTH_MODEL.md
 * - docs/SEARCH_INTENT_CONTRACT.md
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import types only to avoid any initialization
import type { SearchIntent } from '../src/services/search/types/intent.dto.js';

// Import resolvers - these are PURE functions with no side effects
import { 
  resolveSearchMode, 
  type SearchModeContext,
  canExecuteSearch,
  isAssistedSearch,
  needsClarification
} from '../src/services/search/resolvers/search-mode.resolver.js';

import {
  resolveCenter,
  type CenterResolverContext,
  type Coordinates,
  hasCenterCoordinates,
  isGPSCenter,
  isGeocodedCenter,
  getCenterOrThrow
} from '../src/services/search/resolvers/center.resolver.js';

import {
  resolveRadiusMeters,
  isExplicitRadius,
  isDefaultRadius,
  formatRadius,
  DEFAULT_RADIUS
} from '../src/services/search/resolvers/radius.resolver.js';

// ============================================================================
// Pure Test Helpers (No Side Effects)
// ============================================================================

/**
 * Create a minimal valid intent for testing
 * PURE: No side effects, returns new object each time
 */
function createIntent(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    foodAnchor: { type: 'pizza', present: true },
    locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
    nearMe: false,
    explicitDistance: { meters: null, originalText: null },
    preferences: {},
    language: 'en',
    confidence: 0.9,
    originalQuery: 'test query',
    ...overrides
  };
}

/**
 * Mock geocoding function - returns immediately, no network calls
 * PURE: Deterministic, no async delays
 */
function createMockGeocoder(
  responses: Record<string, Coordinates | null>
): (text: string) => Promise<Coordinates | null> {
  return async (text: string) => {
    // Return immediately with mock data
    return responses[text] ?? null;
  };
}

// ============================================================================
// resolveSearchMode Tests (Synchronous, Pure)
// ============================================================================

describe('resolveSearchMode (pure, sync)', () => {
  
  it('returns FULL when both food and location are present', () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      nearMe: false
    });
    const context: SearchModeContext = { gpsAvailable: false };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'FULL');
    assert.equal(result.reason, 'both_anchors_explicit');
    assert.equal(canExecuteSearch(result), true);
    assert.equal(isAssistedSearch(result), false);
    assert.equal(needsClarification(result), false);
  });
  
  it('returns FULL even when GPS is available if location is explicit', () => {
    const intent = createIntent({
      foodAnchor: { type: 'sushi', present: true },
      locationAnchor: { text: 'Jerusalem', type: 'city', present: true },
      nearMe: false
    });
    const context: SearchModeContext = { gpsAvailable: true };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'FULL');
    assert.equal(result.reason, 'both_anchors_explicit');
  });
  
  it('returns ASSISTED when nearMe=true and GPS available', () => {
    const intent = createIntent({
      foodAnchor: { type: 'burger', present: true },
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: true
    });
    const context: SearchModeContext = { gpsAvailable: true };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'ASSISTED');
    assert.equal(result.reason, 'gps_fallback');
    assert.equal(canExecuteSearch(result), true);
    assert.equal(isAssistedSearch(result), true);
    assert.equal(needsClarification(result), false);
  });
  
  it('returns CLARIFY when food anchor missing', () => {
    const intent = createIntent({
      foodAnchor: { type: '', present: false },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true }
    });
    const context: SearchModeContext = { gpsAvailable: false };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'CLARIFY');
    assert.equal(result.reason, 'missing_food_anchor');
    assert.equal(canExecuteSearch(result), false);
    assert.equal(needsClarification(result), true);
  });
  
  it('returns CLARIFY when location anchor missing', () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: '', type: '', present: false },
      nearMe: false
    });
    const context: SearchModeContext = { gpsAvailable: false };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'CLARIFY');
    assert.equal(result.reason, 'missing_location_anchor');
  });
  
  it('returns CLARIFY when nearMe=true but GPS unavailable', () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: true
    });
    const context: SearchModeContext = { gpsAvailable: false };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'CLARIFY');
    assert.equal(result.reason, 'gps_unavailable');
  });
  
  it('returns CLARIFY when both anchors missing', () => {
    const intent = createIntent({
      foodAnchor: { type: '', present: false },
      locationAnchor: { text: '', type: '', present: false }
    });
    const context: SearchModeContext = { gpsAvailable: false };
    
    const result = resolveSearchMode(intent, context);
    
    assert.equal(result.mode, 'CLARIFY');
    assert.equal(result.reason, 'missing_food_anchor');
  });
});

// ============================================================================
// resolveCenter Tests (Async but Mocked - No Network)
// ============================================================================

describe('resolveCenter (mocked, no network)', () => {
  
  it('returns GPS coords when nearMe=true and GPS available', async () => {
    const intent = createIntent({
      nearMe: true,
      locationAnchor: { text: 'near me', type: 'gps', present: true }
    });
    const context: CenterResolverContext = {
      gpsCoords: { lat: 32.0853, lng: 34.7818 },
      geocode: createMockGeocoder({})
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.deepEqual(result.center, { lat: 32.0853, lng: 34.7818 });
    assert.equal(result.source, 'gps');
    assert.equal(result.locationText, 'near me');
    assert.equal(hasCenterCoordinates(result), true);
    assert.equal(isGPSCenter(result), true);
    assert.equal(isGeocodedCenter(result), false);
  });
  
  it('geocodes explicit location successfully', async () => {
    const intent = createIntent({
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      nearMe: false
    });
    const context: CenterResolverContext = {
      geocode: createMockGeocoder({
        'Tel Aviv': { lat: 32.0853, lng: 34.7818 }
      })
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.deepEqual(result.center, { lat: 32.0853, lng: 34.7818 });
    assert.equal(result.source, 'geocoded');
    assert.equal(result.locationText, 'Tel Aviv');
    assert.equal(hasCenterCoordinates(result), true);
    assert.equal(isGPSCenter(result), false);
    assert.equal(isGeocodedCenter(result), true);
  });
  
  it('handles geocoding failure gracefully', async () => {
    const intent = createIntent({
      locationAnchor: { text: 'InvalidCity', type: 'city', present: true },
      nearMe: false
    });
    const context: CenterResolverContext = {
      geocode: createMockGeocoder({})
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.equal(result.center, null);
    assert.equal(result.source, 'unknown');
    assert.equal(result.locationText, 'InvalidCity');
    assert.equal(hasCenterCoordinates(result), false);
  });
  
  it('handles geocoding error gracefully', async () => {
    const intent = createIntent({
      locationAnchor: { text: 'ErrorCity', type: 'city', present: true },
      nearMe: false
    });
    const context: CenterResolverContext = {
      geocode: async () => {
        throw new Error('Geocoding API error');
      }
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.equal(result.center, null);
    assert.equal(result.source, 'unknown');
  });
  
  it('returns null when no location anchor', async () => {
    const intent = createIntent({
      locationAnchor: { text: '', type: '', present: false },
      nearMe: false
    });
    const context: CenterResolverContext = {
      geocode: createMockGeocoder({})
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.equal(result.center, null);
    assert.equal(result.source, 'unknown');
    assert.equal(result.locationText, '');
    assert.equal(hasCenterCoordinates(result), false);
  });
  
  it('returns null when nearMe but no GPS coords', async () => {
    const intent = createIntent({
      nearMe: true,
      locationAnchor: { text: 'near me', type: 'gps', present: true }
    });
    const context: CenterResolverContext = {
      geocode: createMockGeocoder({})
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.equal(result.center, null);
    assert.equal(result.source, 'unknown');
  });
  
  it('getCenterOrThrow returns center when available', async () => {
    const intent = createIntent({
      nearMe: true,
      locationAnchor: { text: 'near me', type: 'gps', present: true }
    });
    const context: CenterResolverContext = {
      gpsCoords: { lat: 32.0, lng: 34.0 },
      geocode: createMockGeocoder({})
    };
    
    const result = await resolveCenter(intent, context);
    const center = getCenterOrThrow(result);
    
    assert.deepEqual(center, { lat: 32.0, lng: 34.0 });
  });
  
  it('getCenterOrThrow throws when center unavailable', async () => {
    const intent = createIntent({
      locationAnchor: { text: '', type: '', present: false },
      nearMe: false
    });
    const context: CenterResolverContext = {
      geocode: createMockGeocoder({})
    };
    
    const result = await resolveCenter(intent, context);
    
    assert.throws(() => getCenterOrThrow(result), /Unable to resolve center/);
  });
});

// ============================================================================
// resolveRadiusMeters Tests (Synchronous, Pure)
// ============================================================================

describe('resolveRadiusMeters (pure, sync)', () => {
  
  it('uses explicit distance when provided', () => {
    const intent = createIntent({
      explicitDistance: { meters: 500, originalText: 'within 500m' },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, 500);
    assert.equal(result.source, 'explicit');
    assert.equal(result.originalText, 'within 500m');
    assert.equal(isExplicitRadius(result), true);
    assert.equal(isDefaultRadius(result), false);
    assert.equal(formatRadius(result), '500m');
  });
  
  it('overrides city default with explicit distance', () => {
    const intent = createIntent({
      explicitDistance: { meters: 3000, originalText: 'up to 3km' },
      locationAnchor: { text: 'Jerusalem', type: 'city', present: true }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, 3000);
    assert.equal(result.source, 'explicit');
    assert.equal(formatRadius(result), '3km');
  });
  
  it('overrides nearMe default with explicit distance', () => {
    const intent = createIntent({
      explicitDistance: { meters: 250, originalText: 'within 250 meters' },
      nearMe: true
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, 250);
    assert.equal(result.source, 'explicit');
  });
  
  it('uses near-me default when nearMe=true', () => {
    const intent = createIntent({
      nearMe: true,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, DEFAULT_RADIUS.NEAR_ME);
    assert.equal(result.source, 'default_near_me');
    assert.equal(isExplicitRadius(result), false);
    assert.equal(isDefaultRadius(result), true);
  });
  
  it('uses city default (2000m)', () => {
    const intent = createIntent({
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, DEFAULT_RADIUS.CITY);
    assert.equal(result.source, 'default_city');
    assert.equal(formatRadius(result), '2km');
  });
  
  it('uses street default (200m)', () => {
    const intent = createIntent({
      locationAnchor: { text: 'Rothschild', type: 'street', present: true },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, DEFAULT_RADIUS.STREET);
    assert.equal(result.source, 'default_street');
    assert.equal(formatRadius(result), '200m');
  });
  
  it('uses POI default (1000m)', () => {
    const intent = createIntent({
      locationAnchor: { text: 'Azrieli Center', type: 'poi', present: true },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, DEFAULT_RADIUS.POI);
    assert.equal(result.source, 'default_poi');
    assert.equal(formatRadius(result), '1km');
  });
  
  it('uses near-me default for GPS type', () => {
    const intent = createIntent({
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, DEFAULT_RADIUS.NEAR_ME);
    assert.equal(result.source, 'default_near_me');
  });
  
  it('uses fallback when location type is empty', () => {
    const intent = createIntent({
      locationAnchor: { text: '', type: '', present: false },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const result = resolveRadiusMeters(intent);
    
    assert.equal(result.radiusMeters, DEFAULT_RADIUS.FALLBACK);
    assert.equal(result.source, 'fallback');
  });
  
  it('validates precedence: explicit > nearMe > location type', () => {
    // Explicit wins over nearMe
    const intent1 = createIntent({
      explicitDistance: { meters: 750, originalText: 'within 750m' },
      nearMe: true
    });
    assert.equal(resolveRadiusMeters(intent1).radiusMeters, 750);
    
    // nearMe wins over location type
    const intent2 = createIntent({
      nearMe: true,
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      explicitDistance: { meters: null, originalText: null }
    });
    assert.equal(resolveRadiusMeters(intent2).radiusMeters, DEFAULT_RADIUS.NEAR_ME);
    
    // Location type used when no explicit or nearMe
    const intent3 = createIntent({
      nearMe: false,
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      explicitDistance: { meters: null, originalText: null }
    });
    assert.equal(resolveRadiusMeters(intent3).radiusMeters, DEFAULT_RADIUS.CITY);
  });
});

// ============================================================================
// Integration Tests (Combined Resolvers - Still Pure/Mocked)
// ============================================================================

describe('Integration: Combined resolver behavior', () => {
  
  it('handles full explicit query correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const centerContext: CenterResolverContext = {
      geocode: createMockGeocoder({
        'Tel Aviv': { lat: 32.0853, lng: 34.7818 }
      })
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    const radius = resolveRadiusMeters(intent);
    
    assert.equal(mode.mode, 'FULL');
    assert.equal(center.source, 'geocoded');
    assert.notEqual(center.center, null);
    assert.equal(radius.radiusMeters, 2000);
    assert.equal(radius.source, 'default_city');
  });
  
  it('handles near-me query with GPS correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'burger', present: true },
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: true,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: true };
    const centerContext: CenterResolverContext = {
      gpsCoords: { lat: 32.0, lng: 34.0 },
      geocode: createMockGeocoder({})
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    const radius = resolveRadiusMeters(intent);
    
    assert.equal(mode.mode, 'ASSISTED');
    assert.equal(center.source, 'gps');
    assert.deepEqual(center.center, { lat: 32.0, lng: 34.0 });
    assert.equal(radius.radiusMeters, 1000);
    assert.equal(radius.source, 'default_near_me');
  });
  
  it('handles explicit distance override correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'sushi', present: true },
      locationAnchor: { text: 'Jerusalem', type: 'city', present: true },
      nearMe: false,
      explicitDistance: { meters: 500, originalText: 'within 500m' }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const centerContext: CenterResolverContext = {
      geocode: createMockGeocoder({
        'Jerusalem': { lat: 31.7683, lng: 35.2137 }
      })
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    const radius = resolveRadiusMeters(intent);
    
    assert.equal(mode.mode, 'FULL');
    assert.equal(center.source, 'geocoded');
    assert.equal(radius.radiusMeters, 500);
    assert.equal(radius.source, 'explicit');
  });
  
  it('handles missing food anchor correctly', () => {
    const intent = createIntent({
      foodAnchor: { type: '', present: false },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const mode = resolveSearchMode(intent, modeContext);
    
    assert.equal(mode.mode, 'CLARIFY');
    assert.equal(mode.reason, 'missing_food_anchor');
    assert.equal(canExecuteSearch(mode), false);
  });
  
  it('handles near-me without GPS correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: true
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const centerContext: CenterResolverContext = {
      geocode: createMockGeocoder({})
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    
    assert.equal(mode.mode, 'CLARIFY');
    assert.equal(mode.reason, 'gps_unavailable');
    assert.equal(center.center, null);
    assert.equal(center.source, 'unknown');
  });
});
