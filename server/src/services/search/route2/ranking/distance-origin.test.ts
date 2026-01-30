/**
 * Distance Origin Resolution Tests
 * Validates deterministic logic for distance anchor selection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDistanceOrigin } from './distance-origin.js';
import type { IntentResult, TextSearchMapping } from '../types.js';

describe('Distance Origin Resolution', () => {
  /**
   * Test 1: explicit_city_mentioned + cityText + cityCenter → CITY_CENTER
   * Even if userLocation is present, city center takes precedence
   */
  it('should use CITY_CENTER when explicit_city_mentioned and cityCenter resolved', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'אשקלון'
    };

    const userLocation = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv (present but should be ignored)

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'בתי קפה אשקלון',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'אשקלון',
      cityCenter: { lat: 31.669, lng: 34.571 } // Ashkelon center
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    assert.strictEqual(decision.origin, 'CITY_CENTER', 'Origin should be CITY_CENTER');
    assert.deepStrictEqual(decision.refLatLng, { lat: 31.669, lng: 34.571 }, 'Should use Ashkelon coordinates');
    assert.strictEqual(decision.cityText, 'אשקלון', 'Should preserve cityText');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
  });

  /**
   * Test 2: userLocation present but no explicit city → USER_LOCATION
   */
  it('should use USER_LOCATION when userLocation present and no explicit city', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'default_textsearch',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'default',
      cityText: undefined
    };

    const userLocation = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'מסעדות איטלקיות',
      region: 'IL',
      language: 'he',
      reason: 'default_textsearch',
      requiredTerms: ['איטלקית'],
      preferredTerms: [],
      strictness: 'STRICT',
      typeHint: 'restaurant'
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    assert.strictEqual(decision.origin, 'USER_LOCATION', 'Origin should be USER_LOCATION');
    assert.deepStrictEqual(decision.refLatLng, userLocation, 'Should use user location coordinates');
    assert.strictEqual(decision.cityText, null, 'Should have no cityText');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
  });

  /**
   * Test 3: No userLocation and no cityCenter → NONE
   */
  it('should use NONE when no distance anchor available', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.7,
      reason: 'default_textsearch',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'default',
      cityText: undefined
    };

    const userLocation = null;

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'פיצה',
      region: 'IL',
      language: 'he',
      reason: 'default_textsearch',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant'
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    assert.strictEqual(decision.origin, 'NONE', 'Origin should be NONE');
    assert.strictEqual(decision.refLatLng, null, 'Should have no reference coordinates');
    assert.strictEqual(decision.cityText, null, 'Should have no cityText');
    assert.strictEqual(decision.hadUserLocation, false, 'Should note no userLocation');
  });

  /**
   * Test 4: explicit_city_mentioned but cityCenter NOT resolved → USER_LOCATION fallback
   */
  it('should fallback to USER_LOCATION when explicit city but geocoding failed', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'גדרה'
    };

    const userLocation = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'מסעדות גדרה',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'גדרה',
      cityCenter: null // Geocoding failed or not available
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    assert.strictEqual(decision.origin, 'USER_LOCATION', 'Should fallback to USER_LOCATION');
    assert.deepStrictEqual(decision.refLatLng, userLocation, 'Should use user location as fallback');
    assert.strictEqual(decision.cityText, null, 'Should not include cityText in result when fallback');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
  });

  /**
   * Test 5: explicit_city_mentioned but no userLocation → NONE
   */
  it('should use NONE when explicit city but geocoding failed and no userLocation', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'גדרה'
    };

    const userLocation = null;

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'מסעדות גדרה',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'גדרה',
      cityCenter: null // Geocoding failed
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    assert.strictEqual(decision.origin, 'NONE', 'Should use NONE when no fallback available');
    assert.strictEqual(decision.refLatLng, null, 'Should have no reference coordinates');
    assert.strictEqual(decision.cityText, null, 'Should have no cityText');
    assert.strictEqual(decision.hadUserLocation, false, 'Should note no userLocation');
  });

  /**
   * Test 6: Integration test - "בתי קפה באשקלון" with user in Tel Aviv
   * Explicit city mentioned → should use CITY_CENTER (Ashkelon)
   */
  it('should compute distance from Ashkelon (not Tel Aviv) for "בתי קפה באשקלון"', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.95,
      regionReason: 'explicit',
      cityText: 'אשקלון'
    };

    const userLocation = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv (~50km from Ashkelon)

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'בתי קפה אשקלון',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'אשקלון',
      cityCenter: { lat: 31.669, lng: 34.571 } // Ashkelon center
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    // Assertions: Explicit city ALWAYS uses CITY_CENTER
    assert.strictEqual(decision.origin, 'CITY_CENTER', 'Must use CITY_CENTER when explicit city mentioned');
    assert.strictEqual(decision.refLatLng!.lat, 31.669, 'Must use Ashkelon lat');
    assert.strictEqual(decision.refLatLng!.lng, 34.571, 'Must use Ashkelon lng');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
    assert.ok(decision.userToCityDistanceKm! > 40, 'Distance from user to city should be > 40km (for observability)');

    // Calculate distances to verify
    const cafeInAshkelon = { lat: 31.670, lng: 34.572 }; // ~100m from city center
    const distanceFromCityCenter = haversineDistance(
      decision.refLatLng!.lat,
      decision.refLatLng!.lng,
      cafeInAshkelon.lat,
      cafeInAshkelon.lng
    );

    const distanceFromUserLocation = haversineDistance(
      userLocation.lat,
      userLocation.lng,
      cafeInAshkelon.lat,
      cafeInAshkelon.lng
    );

    // Verify distances are "near" from city center (not 25km from user)
    assert.ok(distanceFromCityCenter < 1, `Distance from city center should be < 1km, got ${distanceFromCityCenter.toFixed(2)}km`);
    assert.ok(distanceFromUserLocation > 40, `Distance from user should be > 40km, got ${distanceFromUserLocation.toFixed(2)}km`);
  });

  /**
   * Test 7: Explicit city + user NEAR city (< 5km) → CITY_CENTER (explicit city always wins)
   */
  it('should use CITY_CENTER even when user is NEAR explicit city', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.95,
      regionReason: 'explicit',
      cityText: 'תל אביב'
    };

    // User is 2km from Tel Aviv center (NEAR)
    const telAvivCenter = { lat: 32.0853, lng: 34.7818 };
    const userLocation = { lat: 32.0953, lng: 34.7818 }; // ~1.1km north of center

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'בתי קפה תל אביב',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'תל אביב',
      cityCenter: telAvivCenter
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    // Assertions: Explicit city ALWAYS uses CITY_CENTER, regardless of user proximity
    assert.strictEqual(decision.origin, 'CITY_CENTER', 'Should use CITY_CENTER when explicit city mentioned');
    assert.deepStrictEqual(decision.refLatLng, telAvivCenter, 'Should use city center coordinates');
    assert.strictEqual(decision.cityText, 'תל אביב', 'Should preserve cityText');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
    assert.ok(decision.userToCityDistanceKm! < 2, 'Distance should be < 2km (for observability)');
  });

  /**
   * Test 8: Explicit city + user at any distance → CITY_CENTER (explicit city always wins)
   */
  it('should use CITY_CENTER for explicit city regardless of user distance', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.95,
      regionReason: 'explicit',
      cityText: 'תל אביב'
    };

    const telAvivCenter = { lat: 32.0853, lng: 34.7818 };
    // User at exactly 5km (should use CITY_CENTER as threshold is exclusive)
    const userLocation = { lat: 32.1303, lng: 34.7818 }; // ~5km north

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'בתי קפה תל אביב',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'תל אביב',
      cityCenter: telAvivCenter
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    // Assertions: Explicit city ALWAYS uses CITY_CENTER
    assert.strictEqual(decision.origin, 'CITY_CENTER', 'Should use CITY_CENTER for explicit city');
    assert.deepStrictEqual(decision.refLatLng, telAvivCenter, 'Should use city center coordinates');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
    assert.ok(decision.userToCityDistanceKm! >= 4, 'Distance should be >= 4km (for observability)');
  });

  /**
   * Test 9: Real-world scenario - "משהו טעים בפתח תקווה"
   * Explicit city mentioned → CITY_CENTER (Petach Tikva)
   */
  it('should use CITY_CENTER for "משהו טעים בפתח תקווה" (explicit city)', () => {
    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_city_mentioned',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.95,
      regionReason: 'explicit',
      cityText: 'פתח תקווה'
    };

    const petachTikvaCenter = { lat: 32.084041, lng: 34.887762 };
    const userLocation = { lat: 31.8012, lng: 34.7803 }; // Bat Yam (~32km from Petach Tikva)

    const mapping: TextSearchMapping = {
      providerMethod: 'textSearch',
      textQuery: 'משהו טעים פתח תקווה',
      region: 'IL',
      language: 'he',
      reason: 'explicit_city_mentioned',
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      typeHint: 'restaurant',
      cityText: 'פתח תקווה',
      cityCenter: petachTikvaCenter
    };

    const decision = resolveDistanceOrigin(intentDecision, userLocation, mapping);

    // Assertions: Explicit city ALWAYS uses CITY_CENTER
    assert.strictEqual(decision.origin, 'CITY_CENTER', 'Must use CITY_CENTER when explicit city mentioned');
    assert.deepStrictEqual(decision.refLatLng, petachTikvaCenter, 'Should use Petach Tikva center coordinates');
    assert.strictEqual(decision.cityText, 'פתח תקווה', 'Should preserve cityText');
    assert.strictEqual(decision.hadUserLocation, true, 'Should note userLocation was present');
    assert.ok(decision.userToCityDistanceKm! > 20, 'Distance from user to Petach Tikva should be > 20km (for observability)');
    assert.ok(decision.userToCityDistanceKm! < 35, 'Distance from user to Petach Tikva should be < 35km (for observability)');
  });
});

/**
 * Helper: Calculate Haversine distance (in km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
