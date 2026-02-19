/**
 * Unit tests: mapGooglePlaceToResult sets businessStatus and openNow for TEMP/OPERATIONAL
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mapGooglePlaceToResult } from '../result-mapper.js';

const basePlace = {
  id: 'places/ChIJxxx',
  displayName: { text: 'Test Place' },
  formattedAddress: '123 Main St',
  location: { latitude: 32, longitude: 34 },
  types: ['restaurant']
};

describe('mapGooglePlaceToResult - businessStatus', () => {
  it('sets businessStatus OPERATIONAL when place has businessStatus OPERATIONAL', () => {
    const place = { ...basePlace, businessStatus: 'OPERATIONAL' };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.businessStatus, 'OPERATIONAL');
  });

  it('sets businessStatus CLOSED_TEMPORARILY, openNow false, and openClose TEMP_CLOSED when place is TEMP closed', () => {
    const place = { ...basePlace, businessStatus: 'CLOSED_TEMPORARILY' };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.businessStatus, 'CLOSED_TEMPORARILY');
    assert.strictEqual(result.openNow, false);
    assert.strictEqual(result.openClose, 'TEMP_CLOSED');
  });

  it('does not set businessStatus when missing (treated as operational)', () => {
    const place = { ...basePlace };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.businessStatus, undefined);
  });

  it('openNow from currentOpeningHours when present', () => {
    const place = {
      ...basePlace,
      businessStatus: 'OPERATIONAL',
      currentOpeningHours: { openNow: true }
    };
    const result = mapGooglePlaceToResult(place);
    assert.strictEqual(result.openNow, true);
  });
});
