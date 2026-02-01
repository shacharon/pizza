/**
 * ROUTE_LLM Schemas Tests
 * 
 * Comprehensive unit tests for all three mapper schemas:
 * - TextSearchMappingSchema
 * - NearbyMappingSchema
 * - LandmarkMappingSchema
 * - RouteLLMMappingSchema (discriminated union)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TextSearchMappingSchema,
  NearbyMappingSchema,
  LandmarkMappingSchema,
  RouteLLMMappingSchema
} from './schemas.js';

describe('ROUTE_LLM Schemas', () => {
  // ==========================================================================
  // TextSearchMappingSchema Tests
  // ==========================================================================

  describe('TextSearchMappingSchema', () => {
    it('validates happy path with bias', () => {
      const valid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza restaurant',
        region: 'IL',
        language: 'he',
        bias: {
          type: 'locationBias',
          center: { lat: 32.0853, lng: 34.7818 },
          radiusMeters: 2000
        },
        reason: 'city_text_with_user_location'
      };
      assert.doesNotThrow(() => TextSearchMappingSchema.parse(valid));
    });

    it('rejects missing language field', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        // language missing
        bias: null,
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects missing region field', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        // region missing
        language: 'he',
        bias: null,
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects invalid language value', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        language: 'invalid', // not in enum
        bias: null,
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects invalid region format', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'israel', // not ISO-3166-1 alpha-2
        language: 'he',
        bias: null,
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('validates happy path without bias', () => {
      const valid = {
        providerMethod: 'textSearch',
        textQuery: 'sushi in tel aviv',
        region: 'IL',
        language: 'he',
        bias: null,
        reason: 'explicit_city'
      };
      assert.doesNotThrow(() => TextSearchMappingSchema.parse(valid));
    });

    it('rejects extra keys (strict)', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        language: 'he',
        bias: null,
        reason: 'test',
        extraField: 'not allowed' // <-- should fail
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects invalid lat/lng', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        language: 'he',
        bias: {
          type: 'locationBias',
          center: { lat: 999, lng: 34.7818 }, // invalid lat
          radiusMeters: 2000
        },
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects empty textQuery', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: '',
        region: 'IL',
        language: 'he',
        bias: null,
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects invalid region code', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'X', // too short
        language: 'he',
        bias: null,
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects radius out of bounds', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        language: 'he',
        bias: {
          type: 'locationBias',
          center: { lat: 32, lng: 34 },
          radiusMeters: 100000 // exceeds 50000
        },
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });

    it('rejects extra keys in bias object', () => {
      const invalid = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        language: 'he',
        bias: {
          type: 'locationBias',
          center: { lat: 32, lng: 34 },
          radiusMeters: 2000,
          extraField: 'not allowed' // <-- should fail
        },
        reason: 'test'
      };
      assert.throws(() => TextSearchMappingSchema.parse(invalid));
    });
  });

  // ==========================================================================
  // NearbyMappingSchema Tests
  // ==========================================================================

  describe('NearbyMappingSchema', () => {
    it('validates happy path', () => {
      const valid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32.0853, lng: 34.7818 },
        radiusMeters: 1500,
        keyword: 'hummus',
        region: 'IL',
        language: 'he',
        reason: 'near_me_explicit'
      };
      assert.doesNotThrow(() => NearbyMappingSchema.parse(valid));
    });

    it('rejects missing language field', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 34 },
        radiusMeters: 1500,
        keyword: 'pizza',
        region: 'IL',
        // language missing
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects missing region field', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 34 },
        radiusMeters: 1500,
        keyword: 'pizza',
        // region missing
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects extra keys (strict)', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32.0853, lng: 34.7818 },
        radiusMeters: 1500,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test',
        extra: 'field' // <-- should fail
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects radius out of bounds', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32.0853, lng: 34.7818 },
        radiusMeters: 100000, // exceeds 50000
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects keyword too long', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 34 },
        radiusMeters: 1500,
        keyword: 'a'.repeat(81), // exceeds 80
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects invalid location coordinates', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 999 }, // invalid lng
        radiusMeters: 1500,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects extra keys in location object', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 34, extra: 'field' }, // extra key
        radiusMeters: 1500,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });

    it('rejects non-integer radius', () => {
      const invalid = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 34 },
        radiusMeters: 1500.5, // must be integer
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => NearbyMappingSchema.parse(invalid));
    });
  });

  // ==========================================================================
  // LandmarkMappingSchema Tests
  // ==========================================================================

  describe('LandmarkMappingSchema', () => {
    it('validates happy path with nearbySearch', () => {
      const valid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Azrieli Center Tel Aviv',
        afterGeocode: 'nearbySearch',
        radiusMeters: 800,
        keyword: 'restaurant',
        region: 'IL',
        language: 'he',
        reason: 'landmark_detected',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };
      assert.doesNotThrow(() => LandmarkMappingSchema.parse(valid));
    });

    it('rejects missing language field', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Azrieli',
        afterGeocode: 'nearbySearch',
        radiusMeters: 1000,
        keyword: 'pizza',
        region: 'IL',
        // language missing
        reason: 'test',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('rejects missing region field', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Azrieli',
        afterGeocode: 'nearbySearch',
        radiusMeters: 1000,
        keyword: 'pizza',
        // region missing
        language: 'he',
        reason: 'test',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('validates happy path with textSearchWithBias', () => {
      const valid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Dizengoff Center',
        afterGeocode: 'textSearchWithBias',
        radiusMeters: 1000,
        keyword: 'cafe',
        region: 'IL',
        language: 'he',
        reason: 'landmark_with_bias',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };
      assert.doesNotThrow(() => LandmarkMappingSchema.parse(valid));
    });

    it('rejects extra keys (strict)', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Dizengoff Center',
        afterGeocode: 'textSearchWithBias',
        radiusMeters: 1000,
        keyword: 'cafe',
        region: 'IL',
        language: 'he',
        reason: 'test',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null,
        notAllowed: true // <-- should fail
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('rejects invalid afterGeocode value', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Azrieli',
        afterGeocode: 'invalidMode', // not in enum
        radiusMeters: 1000,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('rejects geocodeQuery too long', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'a'.repeat(121), // exceeds 120
        afterGeocode: 'nearbySearch',
        radiusMeters: 1000,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('rejects empty geocodeQuery', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: '',
        afterGeocode: 'nearbySearch',
        radiusMeters: 1000,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('rejects radius out of bounds', () => {
      const invalid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Azrieli',
        afterGeocode: 'nearbySearch',
        radiusMeters: 60000, // exceeds 50000
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };
      assert.throws(() => LandmarkMappingSchema.parse(invalid));
    });

    it('accepts null values for nullable fields', () => {
      const valid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Big Ben',
        afterGeocode: 'nearbySearch',
        radiusMeters: 500,
        keyword: null, // null is valid
        region: 'GB',
        language: 'en',
        reason: 'landmark_search',
        landmarkId: null, // null is valid
        cuisineKey: null, // null is valid
        typeKey: null, // null is valid
        resolvedLatLng: null // null is valid
      };
      assert.doesNotThrow(() => LandmarkMappingSchema.parse(valid));
    });

    it('accepts non-null values for nullable fields', () => {
      const valid = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Eiffel Tower',
        afterGeocode: 'nearbySearch',
        radiusMeters: 800,
        keyword: 'restaurant',
        region: 'FR',
        language: 'fr',
        reason: 'landmark_search',
        landmarkId: 'eiffel_tower_paris',
        cuisineKey: 'french',
        typeKey: 'restaurant',
        resolvedLatLng: { lat: 48.8584, lng: 2.2945 }
      };
      assert.doesNotThrow(() => LandmarkMappingSchema.parse(valid));
    });
  });

  // ==========================================================================
  // RouteLLMMappingSchema (Discriminated Union) Tests
  // ==========================================================================

  describe('RouteLLMMappingSchema (discriminated union)', () => {
    it('validates all three variants', () => {
      const textSearch = {
        providerMethod: 'textSearch',
        textQuery: 'pizza',
        region: 'IL',
        language: 'he',
        bias: null,
        reason: 'test'
      };

      const nearby = {
        providerMethod: 'nearbySearch',
        location: { lat: 32, lng: 34 },
        radiusMeters: 1000,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test'
      };

      const landmark = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: 'Azrieli',
        afterGeocode: 'nearbySearch',
        radiusMeters: 1000,
        keyword: 'pizza',
        region: 'IL',
        language: 'he',
        reason: 'test',
        landmarkId: null,
        cuisineKey: null,
        typeKey: null,
        resolvedLatLng: null
      };

      assert.doesNotThrow(() => RouteLLMMappingSchema.parse(textSearch));
      assert.doesNotThrow(() => RouteLLMMappingSchema.parse(nearby));
      assert.doesNotThrow(() => RouteLLMMappingSchema.parse(landmark));
    });

    it('rejects invalid providerMethod', () => {
      const invalid = {
        providerMethod: 'unknownMethod',
        region: 'IL',
        language: 'he'
      };
      assert.throws(() => RouteLLMMappingSchema.parse(invalid));
    });

    it('type-narrows correctly after parse', () => {
      const textSearchInput = {
        providerMethod: 'textSearch',
        textQuery: 'pizza in tel aviv',
        region: 'IL',
        language: 'he',
        bias: null,
        reason: 'explicit_city'
      };

      const result = RouteLLMMappingSchema.parse(textSearchInput);

      // TypeScript should narrow the type based on discriminator
      if (result.providerMethod === 'textSearch') {
        assert.strictEqual(result.textQuery, 'pizza in tel aviv');
        // @ts-expect-error - location doesn't exist on textSearch
        assert.strictEqual(result.location, undefined);
      }
    });

    it('validates complex textSearch with bias', () => {
      const complex = {
        providerMethod: 'textSearch',
        textQuery: 'best hummus',
        region: 'IL',
        language: 'he',
        bias: {
          type: 'locationBias',
          center: { lat: 32.0853, lng: 34.7818 },
          radiusMeters: 5000
        },
        reason: 'user_location_available'
      };
      assert.doesNotThrow(() => RouteLLMMappingSchema.parse(complex));
    });
  });
});
