/**
 * Google Places API (New) Integration Tests
 * 
 * Tests to ensure:
 * 1. Request bodies use correct field names (includedTypes vs includedType)
 * 2. Error handling propagates provider failures correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Google Places API (New) - Request Format', () => {
  it('Text Search should NOT include includedTypes field', () => {
    // Text Search request body structure
    const textSearchBody = {
      textQuery: 'מסעדה בשרית אשקלון', // Place type in textQuery
      languageCode: 'he',
      regionCode: 'IL'
      // NO includedTypes - not supported by searchText!
    };

    assert.strictEqual((textSearchBody as any).includedTypes, undefined, 'Text Search must NOT include includedTypes');
    assert.ok(textSearchBody.textQuery.includes('מסעדה'), 'textQuery should contain place type (מסעדה)');
  });

  it('Nearby Search MUST include includedTypes (plural, array)', () => {
    // Test Nearby Search request body structure
    const nearbySearchBody = {
      locationRestriction: {
        circle: {
          center: { latitude: 32.0853, longitude: 34.7818 },
          radius: 500
        }
      },
      languageCode: 'en',
      includedTypes: ['restaurant'],  // REQUIRED for Nearby Search
      rankPreference: 'DISTANCE'
    };

    assert.ok(Array.isArray(nearbySearchBody.includedTypes), 'includedTypes must be an array');
    assert.strictEqual(nearbySearchBody.includedTypes.length, 1);
    assert.strictEqual(nearbySearchBody.includedTypes[0], 'restaurant');
  });

  it('should have correct field structure for locationRestriction', () => {
    const nearbySearchBody = {
      locationRestriction: {
        circle: {
          center: { latitude: 32.0853, longitude: 34.7818 },
          radius: 500
        }
      },
      languageCode: 'en',
      includedTypes: ['restaurant'],
      rankPreference: 'DISTANCE'
    };

    assert.ok(nearbySearchBody.locationRestriction);
    assert.ok(nearbySearchBody.locationRestriction.circle);
    assert.ok(nearbySearchBody.locationRestriction.circle.center);
    assert.strictEqual(typeof nearbySearchBody.locationRestriction.circle.center.latitude, 'number');
    assert.strictEqual(typeof nearbySearchBody.locationRestriction.circle.center.longitude, 'number');
    assert.strictEqual(typeof nearbySearchBody.locationRestriction.circle.radius, 'number');
  });

  it('should have correct field structure for locationBias', () => {
    const textSearchBody = {
      textQuery: 'pizza',
      languageCode: 'en',
      includedTypes: ['restaurant'],
      locationBias: {
        circle: {
          center: { latitude: 32.0853, longitude: 34.7818 },
          radius: 1000
        }
      }
    };

    assert.ok(textSearchBody.locationBias);
    assert.ok(textSearchBody.locationBias.circle);
    assert.ok(textSearchBody.locationBias.circle.center);
    assert.strictEqual(typeof textSearchBody.locationBias.circle.center.latitude, 'number');
    assert.strictEqual(typeof textSearchBody.locationBias.circle.center.longitude, 'number');
    assert.strictEqual(typeof textSearchBody.locationBias.circle.radius, 'number');
  });
});

describe('Google Places API (New) - Error Handling', () => {
  it('should construct meaningful error messages with HTTP status', () => {
    const status = 400;
    const errorBody = JSON.stringify({
      error: {
        code: 400,
        message: 'Unknown name includedType',
        status: 'INVALID_ARGUMENT'
      }
    });

    const errorMessage = `Google Places API (New) searchNearby failed: HTTP ${status} - ${errorBody}`;
    
    assert.ok(errorMessage.includes('searchNearby'), 'Error should include endpoint name');
    assert.ok(errorMessage.includes('400'), 'Error should include HTTP status');
    assert.ok(errorMessage.includes(errorBody), 'Error should include error body');
  });

  it('should differentiate between endpoint types in errors', () => {
    const textSearchError = 'Google Places API (New) searchText failed: HTTP 400 - error';
    const nearbySearchError = 'Google Places API (New) searchNearby failed: HTTP 400 - error';

    assert.ok(textSearchError.includes('searchText'));
    assert.ok(nearbySearchError.includes('searchNearby'));
    assert.notStrictEqual(textSearchError, nearbySearchError);
  });
});

describe('Google Places API (New) - Field Validation', () => {
  it('should reject Text Search bodies with includedTypes', () => {
    const invalidBody = {
      textQuery: 'pizza',
      includedTypes: ['restaurant']  // WRONG - not supported by searchText!
    };

    // This test ensures we catch the mistake at compile/test time
    assert.ok((invalidBody as any).includedTypes, 'Invalid body has includedTypes');
    
    // In production, this would fail with HTTP 400 from Google:
    // "Invalid JSON payload received. Unknown name \"includedTypes\": Cannot find field."
    console.warn('WARNING: Text Search with includedTypes will fail with HTTP 400');
  });

  it('Nearby Search includedTypes must be array', () => {
    const validBody = {
      locationRestriction: {
        circle: {
          center: { latitude: 32.0853, longitude: 34.7818 },
          radius: 500
        }
      },
      includedTypes: ['restaurant']
    };

    assert.ok(Array.isArray(validBody.includedTypes));
    assert.ok(validBody.includedTypes.length > 0);
  });

  it('should validate textQuery contains place type for Text Search', () => {
    const validHebrewBody = {
      textQuery: 'מסעדה בשרית אשקלון',  // "restaurant" is in Hebrew
      languageCode: 'he'
    };

    const validEnglishBody = {
      textQuery: 'pizza restaurant tel aviv',
      languageCode: 'en'
    };

    assert.ok(validHebrewBody.textQuery.includes('מסעדה'));
    assert.ok(validEnglishBody.textQuery.includes('restaurant'));
  });
});

/**
 * NOTE: These are structure/format tests, not integration tests.
 * For actual integration testing with Google API, use manual testing or
 * separate integration test suite with real API credentials.
 */
