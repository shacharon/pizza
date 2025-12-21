/**
 * City Filter Service Tests
 * Tests for lightweight city post-filtering
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { CityFilterService } from '../src/services/search/filters/city-filter.service.js';
import { QueryComposer } from '../src/services/search/utils/query-composer.js';
import type { RestaurantResult } from '../src/services/search/types/search.types.js';

describe('City Filter Service', () => {
  const filter = new CityFilterService(5);

  it('should keep results matching target city in formatted address', () => {
    // Create 6 results to avoid fallback being triggered
    const results: Partial<RestaurantResult>[] = [
      { name: 'Pizza Tel Aviv 1', address: 'Rothschild 10, Tel Aviv', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'Pizza Tel Aviv 2', address: 'Dizengoff 20, Tel Aviv', placeId: '2', id: '2', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'Pizza Tel Aviv 3', address: 'Ben Yehuda 5, Tel Aviv', placeId: '3', id: '3', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'Pizza Tel Aviv 4', address: 'Allenby 15, Tel Aviv', placeId: '4', id: '4', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'Pizza Tel Aviv 5', address: 'Sheinkin 8, Tel Aviv', placeId: '5', id: '5', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'Pizza Ramat Gan', address: 'Bialik 5, Ramat Gan', placeId: '6', id: '6', source: 'google_places', location: { lat: 32.0, lng: 34.8 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv');
    
    assert.equal(filtered.kept.length, 5, 'Should keep only Tel Aviv results');
    assert.equal(filtered.dropped.length, 1, 'Should drop Ramat Gan result');
    assert.equal((filtered.kept[0] as any).cityMatch, true, 'Kept result should have cityMatch=true');
    assert.equal((filtered.kept[0] as any).cityMatchReason, 'FORMATTED_ADDRESS');
  });

  it('should be case-insensitive when matching cities', () => {
    const results: Partial<RestaurantResult>[] = [
      { 
        name: 'Sushi', 
        address: 'Main St, TEL AVIV', 
        placeId: '1',
        id: '1',
        source: 'google_places',
        location: { lat: 32.0, lng: 34.7 }
      },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'tel aviv');
    
    assert.equal(filtered.kept.length, 1, 'Should match despite different case');
    assert.equal((filtered.kept[0] as any).cityMatch, true);
  });

  it('should trigger fallback when too few results', () => {
    const results: Partial<RestaurantResult>[] = [
      { 
        name: 'Pizza Tel Aviv', 
        address: 'Rothschild 10, Tel Aviv', 
        placeId: '1',
        id: '1',
        source: 'google_places',
        location: { lat: 32.0, lng: 34.7 }
      },
      { 
        name: 'Pizza Ramat Gan', 
        address: 'Bialik 5, Ramat Gan', 
        placeId: '2',
        id: '2',
        source: 'google_places',
        location: { lat: 32.0, lng: 34.8 }
      },
      { 
        name: 'Pizza Holon', 
        address: 'Weizmann 3, Holon', 
        placeId: '3',
        id: '3',
        source: 'google_places',
        location: { lat: 32.0, lng: 34.8 }
      },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'Tel Aviv');
    
    // Should include fallback results to reach MIN_CITY_RESULTS (5)
    assert.ok(filtered.kept.length >= 1, 'Should keep at least the matched result');
    assert.ok(filtered.kept.some((r: any) => r.isNearbyFallback === true), 'Should mark fallback results');
  });

  it('should return all results when no target city specified', () => {
    const results: Partial<RestaurantResult>[] = [
      { name: 'Pizza 1', address: 'City A', placeId: '1', id: '1', source: 'google_places', location: { lat: 0, lng: 0 } },
      { name: 'Pizza 2', address: 'City B', placeId: '2', id: '2', source: 'google_places', location: { lat: 0, lng: 0 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], undefined);
    
    assert.equal(filtered.kept.length, 2, 'Should keep all results when no city specified');
    assert.equal(filtered.dropped.length, 0, 'Should not drop any results');
  });

  it('should work with Hebrew city names', () => {
    // Create 6 results to avoid fallback
    const results: Partial<RestaurantResult>[] = [
      { name: 'פיצה 1', address: 'רוטשילד 10, תל אביב', placeId: '1', id: '1', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'פיצה 2', address: 'דיזנגוף 20, תל אביב', placeId: '2', id: '2', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'פיצה 3', address: 'בן יהודה 5, תל אביב', placeId: '3', id: '3', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'פיצה 4', address: 'אלנבי 15, תל אביב', placeId: '4', id: '4', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'פיצה 5', address: 'שינקין 8, תל אביב', placeId: '5', id: '5', source: 'google_places', location: { lat: 32.0, lng: 34.7 } },
      { name: 'פיצה אחרת', address: 'ביאליק 5, רמת גן', placeId: '6', id: '6', source: 'google_places', location: { lat: 32.0, lng: 34.8 } },
    ];

    const filtered = filter.filter(results as RestaurantResult[], 'תל אביב');
    
    assert.equal(filtered.kept.length, 5, 'Should handle Hebrew city names');
    assert.ok(filtered.kept[0].address.includes('תל אביב'));
  });
});

describe('Query Composer', () => {
  it('should not duplicate city if already in query', () => {
    const composed = QueryComposer.composeCityQuery('pizza Tel Aviv', 'Tel Aviv');
    assert.equal(composed, 'pizza Tel Aviv', 'Should not duplicate city');
  });

  it('should append city if not present', () => {
    const composed = QueryComposer.composeCityQuery('pizza', 'Tel Aviv');
    assert.equal(composed, 'pizza Tel Aviv', 'Should append city');
  });

  it('should handle Hebrew queries and cities', () => {
    const composed = QueryComposer.composeCityQuery('פיצה', 'תל אביב');
    assert.equal(composed, 'פיצה תל אביב', 'Should append Hebrew city');
  });

  it('should not duplicate when city is already in Hebrew query', () => {
    const composed = QueryComposer.composeCityQuery('פיצה בתל אביב', 'תל אביב');
    assert.equal(composed, 'פיצה בתל אביב', 'Should not duplicate Hebrew city');
  });

  it('should be case-insensitive when checking for duplication', () => {
    const composed = QueryComposer.composeCityQuery('pizza TEL AVIV', 'tel aviv');
    assert.equal(composed, 'pizza TEL AVIV', 'Should not duplicate despite case difference');
  });

  it('should return query unchanged if no city provided', () => {
    const composed = QueryComposer.composeCityQuery('pizza', undefined);
    assert.equal(composed, 'pizza', 'Should return query unchanged');
  });

  it('should correctly identify when query contains city', () => {
    assert.equal(QueryComposer.containsCity('pizza Tel Aviv', 'Tel Aviv'), true);
    assert.equal(QueryComposer.containsCity('pizza', 'Tel Aviv'), false);
    assert.equal(QueryComposer.containsCity('pizza in TEL AVIV', 'tel aviv'), true);
  });
});

