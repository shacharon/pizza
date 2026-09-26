import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNearbyGoogleCall, nearbyFoodTextQuery } from '../nearby-food-query.js';
import type { NearbyMapping } from '../../route-llm/schemas.js';

function mapping(keyword: string, region = 'IL'): NearbyMapping {
  return {
    providerMethod: 'nearbySearch',
    location: { lat: 32.16, lng: 34.8 },
    radiusMeters: 500,
    keyword,
    region,
    language: region === 'IL' ? 'he' : 'en',
    reason: 'distance_default',
  };
}

describe('nearby food query', () => {
  it('keeps a cuisine word for Text Search', () => {
    assert.equal(nearbyFoodTextQuery('אסייתית', 'IL'), 'אסייתית');
    assert.equal(nearbyFoodTextQuery('איסאיתי', 'IL'), 'איסאיתי');
  });

  it('treats a bare restaurant word as generic', () => {
    assert.equal(nearbyFoodTextQuery('מסעדה', 'IL'), null);
    assert.equal(nearbyFoodTextQuery('restaurant', 'US'), null);
  });

  it('sends a food word as textQuery inside the GPS circle', () => {
    const call = buildNearbyGoogleCall(mapping('אסייתית'));
    assert.equal(call.api, 'searchText');
    assert.equal(call.api === 'searchText' ? call.body.textQuery : '', 'אסייתית');
    assert.equal('includedTypes' in call.body, false);
    const bias = call.body.locationBias as { circle: { radius: number } };
    assert.equal(bias.circle.radius, 500);
  });

  it('keeps a generic nearby query on distance-ranked restaurants', () => {
    const call = buildNearbyGoogleCall(mapping('מסעדה'));
    assert.equal(call.api, 'searchNearby');
    assert.deepEqual(call.body.includedTypes, ['restaurant']);
    assert.equal(call.body.rankPreference, 'DISTANCE');
    assert.equal('textQuery' in call.body, false);
  });

  it('appends restaurant for a non-IL food word', () => {
    const call = buildNearbyGoogleCall(mapping('pizza', 'US'));
    assert.equal(call.api, 'searchText');
    assert.equal(call.api === 'searchText' ? call.textQuery : '', 'pizza restaurant');
  });
});
