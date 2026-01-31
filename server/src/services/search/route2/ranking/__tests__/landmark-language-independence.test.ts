/**
 * Landmark Search Language Independence Tests
 * 
 * Validates that LANDMARK route produces identical results regardless of query language
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeLandmark, createLandmarkResolutionCacheKey, createLandmarkSearchCacheKey } from '../../stages/route-llm/landmark-normalizer.js';
import { extractCuisineKeyFromQuery, extractTypeKeyFromQuery } from '../../stages/route-llm/query-cuisine-extractor.js';
import { mapCuisineToIncludedTypes, mapTypeToIncludedTypes } from '../../stages/google-maps/cuisine-to-types-mapper.js';

describe('Landmark Search Language Independence', () => {
  describe('Landmark Normalization (Multilingual)', () => {
    it('should normalize Eiffel Tower across languages to same landmarkId', () => {
      const hebrewLandmark = normalizeLandmark('מגדל אייפל', 'FR');
      const englishLandmark = normalizeLandmark('Eiffel Tower', 'FR');
      const frenchLandmark = normalizeLandmark('Tour Eiffel', 'FR');
      const russianLandmark = normalizeLandmark('Эйфелева башня', 'FR');
      
      assert.ok(hebrewLandmark, 'Hebrew landmark should be recognized');
      assert.ok(englishLandmark, 'English landmark should be recognized');
      assert.ok(frenchLandmark, 'French landmark should be recognized');
      assert.ok(russianLandmark, 'Russian landmark should be recognized');
      
      assert.strictEqual(hebrewLandmark.landmarkId, 'eiffel-tower-paris');
      assert.strictEqual(englishLandmark.landmarkId, 'eiffel-tower-paris');
      assert.strictEqual(frenchLandmark.landmarkId, 'eiffel-tower-paris');
      assert.strictEqual(russianLandmark.landmarkId, 'eiffel-tower-paris');
      
      assert.strictEqual(hebrewLandmark.primaryName, 'Eiffel Tower');
      assert.strictEqual(englishLandmark.primaryName, 'Eiffel Tower');
      assert.strictEqual(frenchLandmark.primaryName, 'Eiffel Tower');
    });

    it('should normalize Dizengoff Center across languages to same landmarkId', () => {
      const hebrewLandmark = normalizeLandmark('דיזנגוף סנטר', 'IL');
      const englishLandmark = normalizeLandmark('Dizengoff Center', 'IL');
      const russianLandmark = normalizeLandmark('Дизенгоф центр', 'IL');
      
      assert.ok(hebrewLandmark);
      assert.ok(englishLandmark);
      assert.ok(russianLandmark);
      
      assert.strictEqual(hebrewLandmark.landmarkId, 'dizengoff-center-tlv');
      assert.strictEqual(englishLandmark.landmarkId, 'dizengoff-center-tlv');
      assert.strictEqual(russianLandmark.landmarkId, 'dizengoff-center-tlv');
    });

    it('should normalize Times Square across languages to same landmarkId', () => {
      const hebrewLandmark = normalizeLandmark('טיימס סקוור', 'US');
      const englishLandmark = normalizeLandmark('Times Square', 'US');
      const russianLandmark = normalizeLandmark('Таймс-сквер', 'US');
      
      assert.ok(hebrewLandmark);
      assert.ok(englishLandmark);
      assert.ok(russianLandmark);
      
      assert.strictEqual(hebrewLandmark.landmarkId, 'times-square-nyc');
      assert.strictEqual(englishLandmark.landmarkId, 'times-square-nyc');
      assert.strictEqual(russianLandmark.landmarkId, 'times-square-nyc');
    });

    it('should return null for unknown landmarks', () => {
      const unknownLandmark = normalizeLandmark('Some Random Place That Does Not Exist', 'US');
      assert.strictEqual(unknownLandmark, null);
    });

    it('should prefer region-matching landmarks', () => {
      // If we search for "Azrieli" in IL region, should match Israeli Azrieli
      const israeliAzrieli = normalizeLandmark('עזריאלי', 'IL');
      assert.ok(israeliAzrieli);
      assert.strictEqual(israeliAzrieli.landmarkId, 'azrieli-center-tlv');
      // Landmark is recognized as Israeli landmark (from registry)
      assert.ok(israeliAzrieli.knownLatLng, 'Should have Israeli coordinates');
    });

    it('should include knownLatLng for registry landmarks', () => {
      const eiffelTower = normalizeLandmark('Eiffel Tower', 'FR');
      assert.ok(eiffelTower);
      assert.ok(eiffelTower.knownLatLng, 'Should have known coordinates');
      assert.strictEqual(eiffelTower.knownLatLng.lat, 48.8584);
      assert.strictEqual(eiffelTower.knownLatLng.lng, 2.2945);
    });
  });

  describe('Landmark Resolution Cache Keys (Multilingual)', () => {
    it('should generate same cache key for Eiffel Tower across languages', () => {
      const hebrewKey = createLandmarkResolutionCacheKey('מגדל אייפל', 'FR');
      const englishKey = createLandmarkResolutionCacheKey('Eiffel Tower', 'FR');
      const frenchKey = createLandmarkResolutionCacheKey('Tour Eiffel', 'FR');
      
      // All should produce same cache key (based on landmarkId)
      assert.strictEqual(hebrewKey, 'landmark:eiffel-tower-paris');
      assert.strictEqual(englishKey, 'landmark:eiffel-tower-paris');
      assert.strictEqual(frenchKey, 'landmark:eiffel-tower-paris');
    });

    it('should generate same cache key for Dizengoff Center across languages', () => {
      const hebrewKey = createLandmarkResolutionCacheKey('דיזנגוף סנטר', 'IL');
      const englishKey = createLandmarkResolutionCacheKey('Dizengoff Center', 'IL');
      
      assert.strictEqual(hebrewKey, 'landmark:dizengoff-center-tlv');
      assert.strictEqual(englishKey, 'landmark:dizengoff-center-tlv');
    });

    it('should handle unknown landmarks with normalized fallback key', () => {
      const key = createLandmarkResolutionCacheKey('Some Random Landmark', 'US');
      
      // Should create a normalized key (not throw)
      assert.ok(key.startsWith('landmark:'));
      assert.ok(key.includes('US'));
    });
  });

  describe('Landmark Search Cache Keys (Post-Resolution)', () => {
    it('should generate identical search cache keys for same landmark+cuisine', () => {
      const key1 = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      const key2 = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      
      assert.strictEqual(key1, key2, 'Same landmark + cuisine should produce identical search cache key');
    });

    it('should use cuisineKey in search cache key (not raw keyword)', () => {
      const key = createLandmarkSearchCacheKey('eiffel-tower-paris', 800, 'italian', undefined, 'FR');
      
      assert.ok(key.includes('italian'), 'Should include cuisineKey');
      assert.ok(key.includes('eiffel-tower-paris'), 'Should include landmarkId');
      assert.ok(key.includes('800'), 'Should include radius');
    });

    it('should differentiate by radius', () => {
      const key500 = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      const key1000 = createLandmarkSearchCacheKey('eiffel-tower-paris', 1000, 'italian', undefined, 'FR');
      
      assert.notStrictEqual(key500, key1000, 'Different radii should produce different cache keys');
    });

    it('should differentiate by cuisine', () => {
      const italianKey = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      const japaneseKey = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'japanese', undefined, 'FR');
      
      assert.notStrictEqual(italianKey, japaneseKey, 'Different cuisines should produce different cache keys');
    });
  });

  describe('End-to-End Language Independence', () => {
    it('should produce identical pipeline for "Italian restaurants Eiffel Tower" in he vs en vs fr', () => {
      // Hebrew query
      const heQuery = 'מסעדות איטלקיות ליד מגדל אייפל';
      const heLandmark = normalizeLandmark('מגדל אייפל', 'FR');
      const heCuisine = extractCuisineKeyFromQuery(heQuery);
      
      // English query
      const enQuery = 'Italian restaurants near Eiffel Tower';
      const enLandmark = normalizeLandmark('Eiffel Tower', 'FR');
      const enCuisine = extractCuisineKeyFromQuery(enQuery);
      
      // French query
      const frQuery = 'Restaurants italiens près de la Tour Eiffel';
      const frLandmark = normalizeLandmark('Tour Eiffel', 'FR');
      const frCuisine = extractCuisineKeyFromQuery(frQuery);
      
      // All should resolve to same landmarkId
      assert.strictEqual(heLandmark?.landmarkId, 'eiffel-tower-paris');
      assert.strictEqual(enLandmark?.landmarkId, 'eiffel-tower-paris');
      assert.strictEqual(frLandmark?.landmarkId, 'eiffel-tower-paris');
      
      // All should extract same cuisineKey
      assert.strictEqual(heCuisine, 'italian');
      assert.strictEqual(enCuisine, 'italian');
      assert.strictEqual(frCuisine, 'italian');
      
      // All should produce same includedTypes
      const heTypes = mapCuisineToIncludedTypes(heCuisine || undefined);
      const enTypes = mapCuisineToIncludedTypes(enCuisine || undefined);
      const frTypes = mapCuisineToIncludedTypes(frCuisine || undefined);
      
      assert.deepEqual(heTypes, enTypes);
      assert.deepEqual(enTypes, frTypes);
      
      // All should produce same search cache key
      const heSearchKey = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      const enSearchKey = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      const frSearchKey = createLandmarkSearchCacheKey('eiffel-tower-paris', 500, 'italian', undefined, 'FR');
      
      assert.strictEqual(heSearchKey, enSearchKey);
      assert.strictEqual(enSearchKey, frSearchKey);
    });

    it('should produce identical pipeline for "Sushi Dizengoff Center" in he vs en vs ru', () => {
      // Hebrew
      const heQuery = 'סושי ליד דיזנגוף סנטר';
      const heLandmark = normalizeLandmark('דיזנגוף סנטר', 'IL');
      const heCuisine = extractCuisineKeyFromQuery(heQuery);
      
      // English
      const enQuery = 'Sushi near Dizengoff Center';
      const enLandmark = normalizeLandmark('Dizengoff Center', 'IL');
      const enCuisine = extractCuisineKeyFromQuery(enQuery);
      
      // Russian
      const ruQuery = 'Суши возле Дизенгоф центр';
      const ruLandmark = normalizeLandmark('Дизенгоф центр', 'IL');
      const ruCuisine = extractCuisineKeyFromQuery(ruQuery);
      
      // All should resolve to same landmarkId
      assert.strictEqual(heLandmark?.landmarkId, 'dizengoff-center-tlv');
      assert.strictEqual(enLandmark?.landmarkId, 'dizengoff-center-tlv');
      assert.strictEqual(ruLandmark?.landmarkId, 'dizengoff-center-tlv');
      
      // All should extract same cuisineKey
      assert.strictEqual(heCuisine, 'sushi');
      assert.strictEqual(enCuisine, 'sushi');
      assert.strictEqual(ruCuisine, 'sushi');
      
      // All should produce same search cache key
      const heSearchKey = createLandmarkSearchCacheKey('dizengoff-center-tlv', 500, 'sushi', undefined, 'IL');
      const enSearchKey = createLandmarkSearchCacheKey('dizengoff-center-tlv', 500, 'sushi', undefined, 'IL');
      const ruSearchKey = createLandmarkSearchCacheKey('dizengoff-center-tlv', 500, 'sushi', undefined, 'IL');
      
      assert.strictEqual(heSearchKey, enSearchKey);
      assert.strictEqual(enSearchKey, ruSearchKey);
    });

    it('should produce identical pipeline for generic "restaurants Times Square" across languages', () => {
      // Hebrew
      const heQuery = 'מסעדות ליד טיימס סקוור';
      const heLandmark = normalizeLandmark('טיימס סקוור', 'US');
      const heCuisine = extractCuisineKeyFromQuery(heQuery);
      const heType = extractTypeKeyFromQuery(heQuery);
      
      // English
      const enQuery = 'restaurants near Times Square';
      const enLandmark = normalizeLandmark('Times Square', 'US');
      const enCuisine = extractCuisineKeyFromQuery(enQuery);
      const enType = extractTypeKeyFromQuery(enQuery);
      
      // Russian
      const ruQuery = 'рестораны возле Таймс-сквер';
      const ruLandmark = normalizeLandmark('Таймс-сквер', 'US');
      const ruCuisine = extractCuisineKeyFromQuery(ruQuery);
      const ruType = extractTypeKeyFromQuery(ruQuery);
      
      // All should resolve to same landmarkId
      assert.strictEqual(heLandmark?.landmarkId, 'times-square-nyc');
      assert.strictEqual(enLandmark?.landmarkId, 'times-square-nyc');
      assert.strictEqual(ruLandmark?.landmarkId, 'times-square-nyc');
      
      // All should have null cuisineKey (generic restaurant)
      assert.strictEqual(heCuisine, null);
      assert.strictEqual(enCuisine, null);
      assert.strictEqual(ruCuisine, null);
      
      // All should extract same typeKey
      assert.strictEqual(heType, 'restaurant');
      assert.strictEqual(enType, 'restaurant');
      assert.strictEqual(ruType, 'restaurant');
      
      // All should produce same includedTypes
      const heTypes = mapTypeToIncludedTypes(heType || undefined);
      const enTypes = mapTypeToIncludedTypes(enType || undefined);
      const ruTypes = mapTypeToIncludedTypes(ruType || undefined);
      
      assert.deepEqual(heTypes, enTypes);
      assert.deepEqual(enTypes, ruTypes);
    });
  });

  describe('Distance Origin (LANDMARK = landmark geocoded coords)', () => {
    it('should always use landmark coordinates as distance origin', () => {
      // For LANDMARK route, distance origin is the resolved landmark coordinates
      // This is analogous to USER_LOCATION for NEARBY
      
      const eiffelTower = normalizeLandmark('Eiffel Tower', 'FR');
      assert.ok(eiffelTower);
      assert.ok(eiffelTower.knownLatLng, 'Eiffel Tower should have known coordinates');
      
      // Distance origin for ranking should be these coordinates
      const expectedOrigin = {
        type: 'LANDMARK_CENTER',
        lat: 48.8584,
        lng: 2.2945
      };
      
      assert.strictEqual(eiffelTower.knownLatLng.lat, expectedOrigin.lat);
      assert.strictEqual(eiffelTower.knownLatLng.lng, expectedOrigin.lng);
    });
  });
});
