/**
 * Unit tests: mapPlaceCategory deterministic mapping (primaryType > types[])
 * and mapGooglePlaceToResult includes category in DTO (3 fixtures: restaurant, cafe, bakery)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mapPlaceCategory, mapGooglePlaceToResult } from '../result-mapper.js';

describe('mapPlaceCategory', () => {
  it('prefers primaryType: cafe => cafe', () => {
    assert.strictEqual(mapPlaceCategory({ primaryType: 'cafe', types: ['restaurant'] }), 'cafe');
  });

  it('prefers primaryType: coffee_shop => cafe', () => {
    assert.strictEqual(mapPlaceCategory({ primaryType: 'coffee_shop', types: [] }), 'cafe');
  });

  it('prefers primaryType: bakery => bakery', () => {
    assert.strictEqual(mapPlaceCategory({ primaryType: 'bakery', types: ['restaurant'] }), 'bakery');
  });

  it('prefers primaryType: restaurant => restaurant', () => {
    assert.strictEqual(mapPlaceCategory({ primaryType: 'restaurant', types: [] }), 'restaurant');
  });

  it('falls back to types[]: cafe in types => cafe', () => {
    assert.strictEqual(mapPlaceCategory({ types: ['restaurant', 'cafe'] }), 'cafe');
  });

  it('falls back to types[]: coffee_shop in types => cafe', () => {
    assert.strictEqual(mapPlaceCategory({ types: ['coffee_shop', 'food'] }), 'cafe');
  });

  it('falls back to types[]: bakery in types => bakery (when no cafe)', () => {
    assert.strictEqual(mapPlaceCategory({ types: ['bakery', 'restaurant'] }), 'bakery');
  });

  it('falls back to types[]: only restaurant => restaurant', () => {
    assert.strictEqual(mapPlaceCategory({ types: ['restaurant', 'food'] }), 'restaurant');
  });

  it('cafe wins over bakery in types[]', () => {
    assert.strictEqual(mapPlaceCategory({ types: ['cafe', 'bakery'] }), 'cafe');
  });

  it('empty types => restaurant', () => {
    assert.strictEqual(mapPlaceCategory({}), 'restaurant');
    assert.strictEqual(mapPlaceCategory({ types: [] }), 'restaurant');
  });
});

describe('mapGooglePlaceToResult - category in DTO (3 fixtures)', () => {
  const base = {
    id: 'places/ChIJxxx',
    displayName: { text: 'Place' },
    formattedAddress: '123 Main St',
    location: { latitude: 32, longitude: 34 }
  };

  it('fixture restaurant: types ["restaurant","food"] => category "restaurant"', () => {
    const place = { ...base, types: ['restaurant', 'food'] };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.category, 'restaurant');
  });

  it('fixture cafe: types ["cafe","restaurant"] => category "cafe"', () => {
    const place = { ...base, types: ['cafe', 'restaurant'] };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.category, 'cafe');
  });

  it('fixture bakery: types ["bakery","food"] => category "bakery"', () => {
    const place = { ...base, types: ['bakery', 'food'] };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.category, 'bakery');
  });
});
