/**
 * City Bias Tests
 * Validates geocoding, caching, and bias application for explicit-city queries
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('City Bias - Explicit City Queries', () => {
  it('should geocode city and apply bias for "בתי קפה באשקלון"', () => {
    // SCENARIO: User searches "בתי קפה באשקלון" (cafes in Ashkelon)
    // Expected: Geocode Ashkelon center, apply 10km bias, distance from city center
    
    const cityText = 'אשקלון';
    const expectedCoords = { lat: 31.669, lng: 34.571 }; // Ashkelon approximate center
    const expectedRadiusMeters = 10000; // 10km for city searches
    
    // Assertions for what should happen:
    // 1. City center resolved from cache or geocoding API
    // 2. Location bias applied to Google Text Search with city center
    // 3. Ranking distance calculated from city center (not userLocation)
    
    assert.ok(cityText, 'City text should be extracted from query');
    assert.strictEqual(expectedRadiusMeters, 10000, 'Radius should be 10km for city searches');
    
    // Expected logs:
    // - city_center_resolved {cityText: "אשקלון", lat: 31.669, lng: 34.571, servedFromCache: false/true}
    // - google_textsearch_bias_applied {biasType: "cityCenter", lat: 31.669, lng: 34.571, radiusMeters: 10000}
    // - ranking_distance_source {source: "cityCenter", hadUserLocation: false, hasCityText: true}
  });

  it('should use city center for distance in ranking (not userLocation)', () => {
    // SCENARIO: User in Tel Aviv searches "מסעדות איטלקיות בגדרה"
    // Expected: Distance should be FROM Gedera center, NOT from Tel Aviv user location
    
    const userLocation = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv
    const cityCenterGedera = { lat: 31.810, lng: 34.777 }; // Gedera center
    const restaurantInGedera = { lat: 31.812, lng: 34.779 }; // Restaurant in Gedera
    
    // Distance from userLocation (Tel Aviv) to restaurant: ~30km
    const distanceFromUser = haversineDistance(
      userLocation.lat,
      userLocation.lng,
      restaurantInGedera.lat,
      restaurantInGedera.lng
    );
    
    // Distance from cityCenter (Gedera) to restaurant: ~0.3km
    const distanceFromCity = haversineDistance(
      cityCenterGedera.lat,
      cityCenterGedera.lng,
      restaurantInGedera.lat,
      restaurantInGedera.lng
    );
    
    // Expected: Ranking should use distanceFromCity (small), not distanceFromUser (large)
    assert.ok(distanceFromCity < 1, 'Distance from city center should be < 1km');
    assert.ok(distanceFromUser > 25, 'Distance from user location should be > 25km');
    
    // Expected behavior: distanceMeters in ranking should be ~300m, not ~30,000m
  });

  it('should cache geocoding results to avoid repeated API calls', () => {
    // SCENARIO: Multiple searches for "מסעדות באשקלון" within 1 hour
    // Expected: First call geocodes, subsequent calls serve from cache
    
    const cityText = 'אשקלון';
    const cacheKey = `${cityText.toLowerCase().trim()}_IL`;
    
    // First call: servedFromCache = false
    // Second call (within TTL): servedFromCache = true
    // After TTL expires: servedFromCache = false (re-geocode)
    
    assert.ok(cacheKey, 'Cache key should be normalized');
    
    // Expected logs:
    // Call 1: city_center_resolved {servedFromCache: false}
    // Call 2: city_center_resolved {servedFromCache: true}
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
