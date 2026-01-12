/**
 * Unit Tests for Phase 1 Deterministic Resolvers
 * 
 * Tests cover:
 * - resolveSearchMode: Full, Assisted, Clarify mode selection
 * - resolveCenter: GPS, geocoded, and failed resolution
 * - resolveRadiusMeters: Explicit distance and defaults
 * 
 * All tests validate compliance with:
 * - docs/SEARCH_TRUTH_MODEL.md
 * - docs/SEARCH_INTENT_CONTRACT.md
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchIntent } from '../../types/intent.dto.js';
import { 
  resolveSearchMode, 
  SearchModeContext,
  canExecuteSearch,
  isAssistedSearch,
  needsClarification
} from '../search-mode.resolver.js';
import {
  resolveCenter,
  CenterResolverContext,
  hasCenterCoordinates,
  isGPSCenter,
  isGeocodedCenter,
  getCenterOrThrow
} from '../center.resolver.js';
import {
  resolveRadiusMeters,
  isExplicitRadius,
  isDefaultRadius,
  formatRadius,
  DEFAULT_RADIUS
} from '../radius.resolver.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal valid intent for testing
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

// ============================================================================
// resolveSearchMode Tests
// ============================================================================

describe('resolveSearchMode', () => {
  
  describe('FULL mode (both anchors explicit)', () => {
    it('should return FULL when both food and location are present', () => {
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
    
    it('should return FULL even when GPS is available if location is explicit', () => {
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
  });
  
  describe('ASSISTED mode (GPS fallback)', () => {
    it('should return ASSISTED when nearMe=true and GPS available', () => {
      const intent = createIntent({
        foodAnchor: { type: 'burger', present: true },
        locationAnchor: { text: 'near me', type: 'gps', present: true },
        nearMe: true
      });
      const context: SearchModeContext = { gpsAvailable: true };
      
      const result = resolveSearchMode(intent, context);
      
      expect(result.mode).toBe('ASSISTED');
      expect(result.reason).toBe('gps_fallback');
      expect(canExecuteSearch(result)).toBe(true);
      expect(isAssistedSearch(result)).toBe(true);
      expect(needsClarification(result)).toBe(false);
    });
  });
  
  describe('CLARIFY mode (missing anchors)', () => {
    it('should return CLARIFY when food anchor missing', () => {
      const intent = createIntent({
        foodAnchor: { type: '', present: false },
        locationAnchor: { text: 'Tel Aviv', type: 'city', present: true }
      });
      const context: SearchModeContext = { gpsAvailable: false };
      
      const result = resolveSearchMode(intent, context);
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.reason).toBe('missing_food_anchor');
      expect(canExecuteSearch(result)).toBe(false);
      expect(needsClarification(result)).toBe(true);
    });
    
    it('should return CLARIFY when location anchor missing', () => {
      const intent = createIntent({
        foodAnchor: { type: 'pizza', present: true },
        locationAnchor: { text: '', type: '', present: false },
        nearMe: false
      });
      const context: SearchModeContext = { gpsAvailable: false };
      
      const result = resolveSearchMode(intent, context);
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.reason).toBe('missing_location_anchor');
    });
    
    it('should return CLARIFY when nearMe=true but GPS unavailable', () => {
      const intent = createIntent({
        foodAnchor: { type: 'pizza', present: true },
        locationAnchor: { text: 'near me', type: 'gps', present: true },
        nearMe: true
      });
      const context: SearchModeContext = { gpsAvailable: false };
      
      const result = resolveSearchMode(intent, context);
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.reason).toBe('gps_unavailable');
    });
    
    it('should return CLARIFY when both anchors missing', () => {
      const intent = createIntent({
        foodAnchor: { type: '', present: false },
        locationAnchor: { text: '', type: '', present: false }
      });
      const context: SearchModeContext = { gpsAvailable: false };
      
      const result = resolveSearchMode(intent, context);
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.reason).toBe('missing_food_anchor');
    });
  });
});

// ============================================================================
// resolveCenter Tests
// ============================================================================

describe('resolveCenter', () => {
  
  describe('GPS center', () => {
    it('should return GPS coords when nearMe=true and GPS available', async () => {
      const intent = createIntent({
        nearMe: true,
        locationAnchor: { text: 'near me', type: 'gps', present: true }
      });
      const context: CenterResolverContext = {
        gpsCoords: { lat: 32.0853, lng: 34.7818 },
        geocode: vi.fn()
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(result.center).toEqual({ lat: 32.0853, lng: 34.7818 });
      expect(result.source).toBe('gps');
      expect(result.locationText).toBe('near me');
      expect(hasCenterCoordinates(result)).toBe(true);
      expect(isGPSCenter(result)).toBe(true);
      expect(isGeocodedCenter(result)).toBe(false);
    });
    
    it('should not call geocode when using GPS', async () => {
      const intent = createIntent({
        nearMe: true,
        locationAnchor: { text: 'near me', type: 'gps', present: true }
      });
      const geocodeMock = vi.fn();
      const context: CenterResolverContext = {
        gpsCoords: { lat: 32.0, lng: 34.0 },
        geocode: geocodeMock
      };
      
      await resolveCenter(intent, context);
      
      expect(geocodeMock).not.toHaveBeenCalled();
    });
  });
  
  describe('Geocoded center', () => {
    it('should geocode explicit location successfully', async () => {
      const intent = createIntent({
        locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
        nearMe: false
      });
      const context: CenterResolverContext = {
        geocode: vi.fn().mockResolvedValue({ lat: 32.0853, lng: 34.7818 })
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(result.center).toEqual({ lat: 32.0853, lng: 34.7818 });
      expect(result.source).toBe('geocoded');
      expect(result.locationText).toBe('Tel Aviv');
      expect(hasCenterCoordinates(result)).toBe(true);
      expect(isGPSCenter(result)).toBe(false);
      expect(isGeocodedCenter(result)).toBe(true);
      expect(context.geocode).toHaveBeenCalledWith('Tel Aviv');
    });
    
    it('should handle geocoding failure gracefully', async () => {
      const intent = createIntent({
        locationAnchor: { text: 'InvalidCity', type: 'city', present: true },
        nearMe: false
      });
      const context: CenterResolverContext = {
        geocode: vi.fn().mockResolvedValue(null)
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(result.center).toBeNull();
      expect(result.source).toBe('unknown');
      expect(result.locationText).toBe('InvalidCity');
      expect(hasCenterCoordinates(result)).toBe(false);
    });
    
    it('should handle geocoding error gracefully', async () => {
      const intent = createIntent({
        locationAnchor: { text: 'ErrorCity', type: 'city', present: true },
        nearMe: false
      });
      const context: CenterResolverContext = {
        geocode: vi.fn().mockRejectedValue(new Error('Geocoding API error'))
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(result.center).toBeNull();
      expect(result.source).toBe('unknown');
    });
  });
  
  describe('Unable to resolve', () => {
    it('should return null when no location anchor', async () => {
      const intent = createIntent({
        locationAnchor: { text: '', type: '', present: false },
        nearMe: false
      });
      const context: CenterResolverContext = {
        geocode: vi.fn()
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(result.center).toBeNull();
      expect(result.source).toBe('unknown');
      expect(result.locationText).toBe('');
      expect(hasCenterCoordinates(result)).toBe(false);
    });
    
    it('should return null when nearMe but no GPS coords', async () => {
      const intent = createIntent({
        nearMe: true,
        locationAnchor: { text: 'near me', type: 'gps', present: true }
      });
      const context: CenterResolverContext = {
        geocode: vi.fn()
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(result.center).toBeNull();
      expect(result.source).toBe('unknown');
    });
  });
  
  describe('getCenterOrThrow helper', () => {
    it('should return center when available', async () => {
      const intent = createIntent({
        nearMe: true,
        locationAnchor: { text: 'near me', type: 'gps', present: true }
      });
      const context: CenterResolverContext = {
        gpsCoords: { lat: 32.0, lng: 34.0 },
        geocode: vi.fn()
      };
      
      const result = await resolveCenter(intent, context);
      const center = getCenterOrThrow(result);
      
      expect(center).toEqual({ lat: 32.0, lng: 34.0 });
    });
    
    it('should throw when center unavailable', async () => {
      const intent = createIntent({
        locationAnchor: { text: '', type: '', present: false },
        nearMe: false
      });
      const context: CenterResolverContext = {
        geocode: vi.fn()
      };
      
      const result = await resolveCenter(intent, context);
      
      expect(() => getCenterOrThrow(result)).toThrow('Unable to resolve center');
    });
  });
});

// ============================================================================
// resolveRadiusMeters Tests
// ============================================================================

describe('resolveRadiusMeters', () => {
  
  describe('Explicit distance (highest priority)', () => {
    it('should use explicit distance when provided', () => {
      const intent = createIntent({
        explicitDistance: { meters: 500, originalText: 'within 500m' },
        locationAnchor: { text: 'Tel Aviv', type: 'city', present: true }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(500);
      expect(result.source).toBe('explicit');
      expect(result.originalText).toBe('within 500m');
      expect(isExplicitRadius(result)).toBe(true);
      expect(isDefaultRadius(result)).toBe(false);
      expect(formatRadius(result)).toBe('500m');
    });
    
    it('should override city default with explicit distance', () => {
      const intent = createIntent({
        explicitDistance: { meters: 3000, originalText: 'up to 3km' },
        locationAnchor: { text: 'Jerusalem', type: 'city', present: true }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(3000);
      expect(result.source).toBe('explicit');
      expect(formatRadius(result)).toBe('3km');
    });
    
    it('should override nearMe default with explicit distance', () => {
      const intent = createIntent({
        explicitDistance: { meters: 250, originalText: 'within 250 meters' },
        nearMe: true
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(250);
      expect(result.source).toBe('explicit');
    });
  });
  
  describe('Near-me default', () => {
    it('should use near-me default when nearMe=true', () => {
      const intent = createIntent({
        nearMe: true,
        explicitDistance: { meters: null, originalText: null }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(DEFAULT_RADIUS.NEAR_ME);
      expect(result.source).toBe('default_near_me');
      expect(isExplicitRadius(result)).toBe(false);
      expect(isDefaultRadius(result)).toBe(true);
    });
  });
  
  describe('Location type defaults (v1 rules)', () => {
    it('should use city default (2000m)', () => {
      const intent = createIntent({
        locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
        nearMe: false,
        explicitDistance: { meters: null, originalText: null }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(DEFAULT_RADIUS.CITY);
      expect(result.source).toBe('default_city');
      expect(formatRadius(result)).toBe('2km');
    });
    
    it('should use street default (200m)', () => {
      const intent = createIntent({
        locationAnchor: { text: 'Rothschild', type: 'street', present: true },
        nearMe: false,
        explicitDistance: { meters: null, originalText: null }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(DEFAULT_RADIUS.STREET);
      expect(result.source).toBe('default_street');
      expect(formatRadius(result)).toBe('200m');
    });
    
    it('should use POI default (1000m)', () => {
      const intent = createIntent({
        locationAnchor: { text: 'Azrieli Center', type: 'poi', present: true },
        nearMe: false,
        explicitDistance: { meters: null, originalText: null }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(DEFAULT_RADIUS.POI);
      expect(result.source).toBe('default_poi');
      expect(formatRadius(result)).toBe('1km');
    });
    
    it('should use near-me default for GPS type', () => {
      const intent = createIntent({
        locationAnchor: { text: 'near me', type: 'gps', present: true },
        nearMe: false,  // Edge case: GPS type but not nearMe
        explicitDistance: { meters: null, originalText: null }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(DEFAULT_RADIUS.NEAR_ME);
      expect(result.source).toBe('default_near_me');
    });
  });
  
  describe('Fallback', () => {
    it('should use fallback when location type is empty', () => {
      const intent = createIntent({
        locationAnchor: { text: '', type: '', present: false },
        nearMe: false,
        explicitDistance: { meters: null, originalText: null }
      });
      
      const result = resolveRadiusMeters(intent);
      
      expect(result.radiusMeters).toBe(DEFAULT_RADIUS.FALLBACK);
      expect(result.source).toBe('fallback');
    });
  });
  
  describe('Precedence validation', () => {
    it('should prioritize explicit > nearMe > location type', () => {
      // Explicit wins over nearMe
      const intent1 = createIntent({
        explicitDistance: { meters: 750, originalText: 'within 750m' },
        nearMe: true
      });
      expect(resolveRadiusMeters(intent1).radiusMeters).toBe(750);
      
      // nearMe wins over location type
      const intent2 = createIntent({
        nearMe: true,
        locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
        explicitDistance: { meters: null, originalText: null }
      });
      expect(resolveRadiusMeters(intent2).radiusMeters).toBe(DEFAULT_RADIUS.NEAR_ME);
      
      // Location type used when no explicit or nearMe
      const intent3 = createIntent({
        nearMe: false,
        locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
        explicitDistance: { meters: null, originalText: null }
      });
      expect(resolveRadiusMeters(intent3).radiusMeters).toBe(DEFAULT_RADIUS.CITY);
    });
  });
});

// ============================================================================
// Integration Tests (Combined Resolvers)
// ============================================================================

describe('Integration: Combined resolver behavior', () => {
  
  it('should handle full explicit query correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true },
      nearMe: false,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const centerContext: CenterResolverContext = {
      geocode: vi.fn().mockResolvedValue({ lat: 32.0853, lng: 34.7818 })
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    const radius = resolveRadiusMeters(intent);
    
    expect(mode.mode).toBe('FULL');
    expect(center.source).toBe('geocoded');
    expect(center.center).not.toBeNull();
    expect(radius.radiusMeters).toBe(2000);
    expect(radius.source).toBe('default_city');
  });
  
  it('should handle near-me query with GPS correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'burger', present: true },
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: true,
      explicitDistance: { meters: null, originalText: null }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: true };
    const centerContext: CenterResolverContext = {
      gpsCoords: { lat: 32.0, lng: 34.0 },
      geocode: vi.fn()
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    const radius = resolveRadiusMeters(intent);
    
    expect(mode.mode).toBe('ASSISTED');
    expect(center.source).toBe('gps');
    expect(center.center).toEqual({ lat: 32.0, lng: 34.0 });
    expect(radius.radiusMeters).toBe(1000);
    expect(radius.source).toBe('default_near_me');
  });
  
  it('should handle explicit distance override correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'sushi', present: true },
      locationAnchor: { text: 'Jerusalem', type: 'city', present: true },
      nearMe: false,
      explicitDistance: { meters: 500, originalText: 'within 500m' }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const centerContext: CenterResolverContext = {
      geocode: vi.fn().mockResolvedValue({ lat: 31.7683, lng: 35.2137 })
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    const radius = resolveRadiusMeters(intent);
    
    expect(mode.mode).toBe('FULL');
    expect(center.source).toBe('geocoded');
    expect(radius.radiusMeters).toBe(500);  // Explicit overrides city default
    expect(radius.source).toBe('explicit');
  });
  
  it('should handle missing food anchor correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: '', present: false },
      locationAnchor: { text: 'Tel Aviv', type: 'city', present: true }
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    
    const mode = resolveSearchMode(intent, modeContext);
    
    expect(mode.mode).toBe('CLARIFY');
    expect(mode.reason).toBe('missing_food_anchor');
    expect(canExecuteSearch(mode)).toBe(false);
  });
  
  it('should handle near-me without GPS correctly', async () => {
    const intent = createIntent({
      foodAnchor: { type: 'pizza', present: true },
      locationAnchor: { text: 'near me', type: 'gps', present: true },
      nearMe: true
    });
    
    const modeContext: SearchModeContext = { gpsAvailable: false };
    const centerContext: CenterResolverContext = {
      geocode: vi.fn()
    };
    
    const mode = resolveSearchMode(intent, modeContext);
    const center = await resolveCenter(intent, centerContext);
    
    expect(mode.mode).toBe('CLARIFY');
    expect(mode.reason).toBe('gps_unavailable');
    expect(center.center).toBeNull();
    expect(center.source).toBe('unknown');
  });
});
