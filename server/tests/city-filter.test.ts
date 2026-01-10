/**
 * City Filter Service Tests
 * Tests for coordinate-based city filtering
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { CityFilterService } from '../src/services/search/filters/city-filter.service.js';
import type { RestaurantResult } from '../src/services/search/types/search.types.js';

describe('City Filter Service (Coordinate-Based)', () => {
  const filter = new CityFilterService(5);

  // Tel Aviv city center coordinates
  const telAvivCenter = { lat: 32.0853, lng: 34.7818 };

  it('should keep results within city radius (10km)', () => {
    const results: Partial<RestaurantResult>[] = [
      // In Tel Aviv center (0km)
      { name: 'Pizza 1', address: 'Rothschild, Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0853, lng: 34.7818 } },
      // 3km north
      { name: 'Pizza 2', address: 'Dizengoff, Tel Aviv', placeId: '2', id: '2', source: 'google_places', location: { lat: 32.115, lng: 34.7818 } },
      // 5km south
      { name: 'Pizza 3', address: 'Jaffa', placeId: '3', id: '3', source: 'google_places', location: { lat: 32.050, lng: 34.7818 } },
      // 8km east
      { name: 'Pizza 4', address: 'Ramat Gan', placeId: '4', id: '4', source: 'google_places', location: { lat: 32.0853, lng: 34.9 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', telAvivCenter);
    
    assert.equal(filtered.kept.length, 4, 'Should keep all results within 10km');
    assert.equal(filtered.dropped.length, 0, 'Should not drop any');
    assert.equal((filtered.kept[0] as any).cityMatchReason, 'WITHIN_CITY');
  });

  it('should keep suburbs (10-20km) with NEARBY_SUBURBS status', () => {
    const results: Partial<RestaurantResult>[] = [
      // In city (5km)
      { name: 'Pizza 1', address: 'Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.050, lng: 34.7818 } },
      { name: 'Pizza 1B', address: 'Tel Aviv', placeId: '1b', id: '1b', source: 'google_places', location: { lat: 32.055, lng: 34.7818 } },
      { name: 'Pizza 1C', address: 'Tel Aviv', placeId: '1c', id: '1c', source: 'google_places', location: { lat: 32.060, lng: 34.7818 } },
      { name: 'Pizza 1D', address: 'Tel Aviv', placeId: '1d', id: '1d', source: 'google_places', location: { lat: 32.065, lng: 34.7818 } },
      { name: 'Pizza 1E', address: 'Tel Aviv', placeId: '1e', id: '1e', source: 'google_places', location: { lat: 32.070, lng: 34.7818 } },
      // Suburbs (15km)
      { name: 'Pizza 2', address: 'Ramat Hasharon', placeId: '2', id: '2', source: 'google_places', location: { lat: 32.220, lng: 34.7818 } },
      // Far away (30km)
      { name: 'Pizza 3', address: 'Netanya', placeId: '3', id: '3', source: 'google_places', location: { lat: 32.350, lng: 34.7818 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', telAvivCenter);
    
    // Should keep city + suburbs (benefit of doubt), drop far results
    assert.equal(filtered.kept.length, 6, 'Should keep city + suburbs');
    assert.equal(filtered.dropped.length, 1, 'Should drop far results');
    
    const suburb = filtered.kept.find(r => r.name === 'Pizza 2') as any;
    assert.equal(suburb.cityMatchReason, 'NEARBY_SUBURBS', 'Suburbs should be marked as NEARBY_SUBURBS');
  });

  it('should drop results too far away (>20km)', () => {
    const results: Partial<RestaurantResult>[] = [
      // Tel Aviv (multiple to avoid fallback)
      { name: 'Pizza TLV 1', address: 'Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0853, lng: 34.7818 } },
      { name: 'Pizza TLV 2', address: 'Tel Aviv', placeId: '1b', id: '1b', source: 'google_places', location: { lat: 32.090, lng: 34.7818 } },
      { name: 'Pizza TLV 3', address: 'Tel Aviv', placeId: '1c', id: '1c', source: 'google_places', location: { lat: 32.095, lng: 34.7818 } },
      { name: 'Pizza TLV 4', address: 'Tel Aviv', placeId: '1d', id: '1d', source: 'google_places', location: { lat: 32.100, lng: 34.7818 } },
      { name: 'Pizza TLV 5', address: 'Tel Aviv', placeId: '1e', id: '1e', source: 'google_places', location: { lat: 32.105, lng: 34.7818 } },
      // Haifa (~95km north)
      { name: 'Pizza Haifa', address: 'Haifa', placeId: '2', id: '2', source: 'google_places', location: { lat: 32.8191, lng: 34.9983 } },
      // Jerusalem (~55km east)
      { name: 'Pizza Jerusalem', address: 'Jerusalem', placeId: '3', id: '3', source: 'google_places', location: { lat: 31.7683, lng: 35.2137 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', telAvivCenter);
    
    assert.equal(filtered.kept.length, 5, 'Should keep Tel Aviv results');
    assert.equal(filtered.dropped.length, 2, 'Should drop Haifa and Jerusalem');
    assert.equal((filtered.dropped[0] as any).cityMatchReason, 'TOO_FAR');
  });

  it('should return all results when no coordinates provided', () => {
    const results: Partial<RestaurantResult>[] = [
      { name: 'Pizza 1', address: 'City A', placeId: '1', id: '1', source: 'google_places', location: { lat: 0, lng: 0 } },
      { name: 'Pizza 2', address: 'City B', placeId: '2', id: '2', source: 'google_places', location: { lat: 10, lng: 10 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', undefined);
    
    assert.equal(filtered.kept.length, 2, 'Should keep all results when no coords');
    assert.equal(filtered.dropped.length, 0, 'Should not drop any');
  });

  it('should mark results without coordinates as UNKNOWN', () => {
    const results: Partial<RestaurantResult>[] = [
      { name: 'Pizza 1', address: 'Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0853, lng: 34.7818 } },
      { name: 'Pizza 2', address: 'Tel Aviv', placeId: '1b', id: '1b', source: 'google_places', location: { lat: 32.090, lng: 34.7818 } },
      { name: 'Pizza 3', address: 'Tel Aviv', placeId: '1c', id: '1c', source: 'google_places', location: { lat: 32.095, lng: 34.7818 } },
      { name: 'Pizza 4', address: 'Tel Aviv', placeId: '1d', id: '1d', source: 'google_places', location: { lat: 32.100, lng: 34.7818 } },
      { name: 'Pizza 5', address: 'Tel Aviv', placeId: '1e', id: '1e', source: 'google_places', location: { lat: 32.105, lng: 34.7818 } },
      { name: 'Pizza Unknown', address: 'Unknown', placeId: '2', id: '2', source: 'google_places', location: undefined } as any,
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', telAvivCenter);
    
    assert.equal(filtered.kept.length, 5, 'Should keep results with coords');
    assert.equal(filtered.dropped.length, 1, 'Should drop result without coords');
    assert.equal((filtered.dropped[0] as any).cityMatchReason, 'UNKNOWN');
  });

  it('should trigger fallback when too few results', () => {
    const results: Partial<RestaurantResult>[] = [
      // Only 1 in city
      { name: 'Pizza TLV', address: 'Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0853, lng: 34.7818 } },
      // 3 far away
      { name: 'Pizza Far 1', address: 'Far', placeId: '2', id: '2', source: 'google_places', location: { lat: 33.0, lng: 35.0 } },
      { name: 'Pizza Far 2', address: 'Far', placeId: '3', id: '3', source: 'google_places', location: { lat: 33.1, lng: 35.1 } },
      { name: 'Pizza Far 3', address: 'Far', placeId: '4', id: '4', source: 'google_places', location: { lat: 33.2, lng: 35.2 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', telAvivCenter);
    
    // Should include fallback results to reach MIN_CITY_RESULTS (5)
    assert.ok(filtered.kept.length >= 4, 'Should add fallback results');
    assert.ok(filtered.kept.some((r: any) => r.isNearbyFallback === true), 'Should mark fallback results');
  });

  it('should calculate distance correctly', () => {
    const results: Partial<RestaurantResult>[] = [
      { name: 'Pizza', address: 'Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0853, lng: 34.7818 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv', telAvivCenter);
    
    const result = filtered.kept[0] as any;
    assert.equal(result.distanceKm, 0, 'Distance to same point should be 0km');
  });

  it('should work for any city in the world', () => {
    // New York coordinates
    const newYork = { lat: 40.7128, lng: -74.0060 };
    
    const results: Partial<RestaurantResult>[] = [
      // Manhattan (multiple to avoid fallback)
      { name: 'Pizza Manhattan 1', address: 'NYC', placeId: '1', id: '1', source: 'google_places', location: { lat: 40.7589, lng: -73.9851 } },
      { name: 'Pizza Manhattan 2', address: 'NYC', placeId: '1b', id: '1b', source: 'google_places', location: { lat: 40.7500, lng: -73.9900 } },
      { name: 'Pizza Manhattan 3', address: 'NYC', placeId: '1c', id: '1c', source: 'google_places', location: { lat: 40.7600, lng: -73.9800 } },
      { name: 'Pizza Manhattan 4', address: 'NYC', placeId: '1d', id: '1d', source: 'google_places', location: { lat: 40.7400, lng: -74.0000 } },
      // Brooklyn (8km away)
      { name: 'Pizza Brooklyn', address: 'Brooklyn', placeId: '2', id: '2', source: 'google_places', location: { lat: 40.6782, lng: -73.9442 } },
      // Boston (>300km away)
      { name: 'Pizza Boston', address: 'Boston', placeId: '3', id: '3', source: 'google_places', location: { lat: 42.3601, lng: -71.0589 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'New York', newYork);
    
    assert.equal(filtered.kept.length, 5, 'Should keep Manhattan + Brooklyn');
    assert.equal(filtered.dropped.length, 1, 'Should drop Boston');
  });

  // Regression tests for strict mode (explicit city queries)
  it('should drop suburbs in STRICT mode (explicit city query)', () => {
    // Gedera city center
    const gederaCenter = { lat: 31.8120, lng: 34.7774 };
    
    const results: Partial<RestaurantResult>[] = [
      // In Gedera (3.6km from center)
      { name: 'Pizza Gedera', address: 'Gedera', placeId: '1', id: '1', source: 'google_places', location: { lat: 31.806756, lng: 34.73969 } },
      // In Ashdod (~15-18km from Gedera center)
      { name: 'Pizza Ashdod', address: 'Ashdod', placeId: '2', id: '2', source: 'google_places', location: { lat: 31.804, lng: 34.655 } },
    ];

    // STRICT MODE: Only keep results within city radius
    const filtered = filter.filter(results as RestaurantResult[], 'Gedera', gederaCenter, true);
    
    assert.equal(filtered.kept.length, 1, 'Strict mode should keep only Gedera');
    assert.equal(filtered.kept[0]?.name, 'Pizza Gedera', 'Should keep only Gedera result');
    assert.equal(filtered.dropped.length, 1, 'Should drop Ashdod in strict mode');
    assert.equal(filtered.dropped[0]?.name, 'Pizza Ashdod', 'Ashdod should be dropped');
  });

  it('should keep suburbs in PERMISSIVE mode (near me queries)', () => {
    // Gedera city center
    const gederaCenter = { lat: 31.8120, lng: 34.7774 };
    
    const results: Partial<RestaurantResult>[] = [
      // In Gedera (3.6km from center)
      { name: 'Pizza Gedera', address: 'Gedera', placeId: '1', id: '1', source: 'google_places', location: { lat: 31.806756, lng: 34.73969 } },
      // In nearby suburbs (15km from Gedera center)
      { name: 'Pizza Nearby', address: 'Nearby City', placeId: '2', id: '2', source: 'google_places', location: { lat: 31.804, lng: 34.655 } },
    ];

    // PERMISSIVE MODE (default): Keep suburbs as benefit of doubt
    const filtered = filter.filter(results as RestaurantResult[], 'Gedera', gederaCenter, false);
    
    assert.equal(filtered.kept.length, 2, 'Permissive mode should keep both Gedera + nearby');
    assert.equal(filtered.dropped.length, 0, 'Should not drop nearby results in permissive mode');
  });

  it('should default to permissive mode when strictMode not specified', () => {
    const gederaCenter = { lat: 31.8120, lng: 34.7774 };
    
    const results: Partial<RestaurantResult>[] = [
      { name: 'Pizza Gedera', address: 'Gedera', placeId: '1', id: '1', source: 'google_places', location: { lat: 31.806756, lng: 34.73969 } },
      { name: 'Pizza Nearby', address: 'Nearby City', placeId: '2', id: '2', source: 'google_places', location: { lat: 31.804, lng: 34.655 } },
    ];

    // Call without strictMode parameter (should default to false)
    const filtered = filter.filter(results as RestaurantResult[], 'Gedera', gederaCenter);
    
    assert.equal(filtered.kept.length, 2, 'Should default to permissive (keep both)');
  });
});
