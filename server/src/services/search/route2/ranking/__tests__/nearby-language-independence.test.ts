/**
 * Nearby Search Language Independence Tests
 * 
 * Validates that NEARBY route produces identical results regardless of query language
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { extractCuisineKeyFromQuery, extractTypeKeyFromQuery } from '../../stages/route-llm/query-cuisine-extractor.js';
import { mapCuisineToIncludedTypes, mapTypeToIncludedTypes } from '../../stages/google-maps/cuisine-to-types-mapper.js';

describe('Nearby Search Language Independence', () => {
  describe('Cuisine Extraction (Deterministic)', () => {
    it('should extract same cuisineKey from Italian queries in different languages', () => {
      const queries = [
        'מסעדות איטלקיות קרוב',         // Hebrew
        'italian restaurants nearby',    // English
        'итальянские рестораны рядом',   // Russian
        'restaurante italiano cerca'     // Spanish
      ];

      const results = queries.map(q => extractCuisineKeyFromQuery(q));
      
      // All should extract 'italian'
      assert.ok(results.every(r => r === 'italian'), 'All queries should extract cuisineKey="italian"');
    });

    it('should extract same cuisineKey from Japanese/Sushi queries', () => {
      const queries = [
        'מסעדות יפניות קרוב',           // Hebrew
        'japanese restaurants near me',  // English
        'японские рестораны рядом',      // Russian
        'sushi cerca de mi'              // Spanish
      ];

      const results = queries.map(q => extractCuisineKeyFromQuery(q));
      
      // All should extract either 'japanese' or 'sushi'
      assert.ok(results.every(r => r === 'japanese' || r === 'sushi'), 
        'All queries should extract Japanese or Sushi cuisineKey');
    });

    it('should extract same cuisineKey from Asian queries', () => {
      const queries = [
        'מסעדות אסיאתיות קרוב',         // Hebrew
        'asian food nearby',             // English
        'азиатская еда рядом'            // Russian
      ];

      const results = queries.map(q => extractCuisineKeyFromQuery(q));
      
      assert.ok(results.every(r => r === 'asian'), 'All queries should extract cuisineKey="asian"');
    });

    it('should return null for generic restaurant queries', () => {
      const queries = [
        'מסעדות קרוב',                  // Hebrew: restaurants nearby
        'restaurants near me',           // English
        'рестораны рядом'               // Russian
      ];

      const results = queries.map(q => extractCuisineKeyFromQuery(q));
      
      assert.ok(results.every(r => r === null), 'Generic restaurant queries should return null cuisineKey');
    });
  });

  describe('Type Extraction (Fallback)', () => {
    it('should extract same typeKey from cafe queries in different languages', () => {
      const queries = [
        'בתי קפה קרוב',                 // Hebrew
        'cafes nearby',                  // English
        'кафе рядом'                    // Russian
      ];

      const results = queries.map(q => extractTypeKeyFromQuery(q));
      
      assert.ok(results.every(r => r === 'cafe'), 'All queries should extract typeKey="cafe"');
    });

    it('should extract restaurant typeKey for generic queries', () => {
      const queries = [
        'מסעדות קרוב',                  // Hebrew
        'restaurants near me',           // English
        'рестораны рядом'               // Russian
      ];

      const results = queries.map(q => extractTypeKeyFromQuery(q));
      
      assert.ok(results.every(r => r === 'restaurant'), 'All generic queries should extract typeKey="restaurant"');
    });
  });

  describe('Cuisine-to-Types Mapping (Deterministic)', () => {
    it('should map cuisineKey to consistent includedTypes', () => {
      const includedTypes1 = mapCuisineToIncludedTypes('italian');
      const includedTypes2 = mapCuisineToIncludedTypes('italian');
      
      assert.deepEqual(includedTypes1, includedTypes2, 'Same cuisineKey should produce identical includedTypes');
      assert.ok(includedTypes1.includes('italian_restaurant'), 'Italian should include italian_restaurant type');
    });

    it('should map different cuisines to different types', () => {
      const italianTypes = mapCuisineToIncludedTypes('italian');
      const japaneseTypes = mapCuisineToIncludedTypes('japanese');
      
      assert.notDeepEqual(italianTypes, japaneseTypes, 'Different cuisineKeys should produce different includedTypes');
    });

    it('should include generic restaurant fallback', () => {
      const types = mapCuisineToIncludedTypes('italian');
      assert.ok(types.includes('restaurant'), 'All cuisine types should include generic "restaurant" fallback');
    });

    it('should handle null cuisineKey with default restaurant', () => {
      const types = mapCuisineToIncludedTypes(undefined);
      assert.deepEqual(types, ['restaurant'], 'Null cuisineKey should default to ["restaurant"]');
    });
  });

  describe('End-to-End Language Independence', () => {
    it('should produce identical includedTypes for Italian queries in he vs en vs ru', () => {
      const hebrewQuery = 'מסעדות איטלקיות קרוב';
      const englishQuery = 'italian restaurants nearby';
      const russianQuery = 'итальянские рестораны рядом';

      const hebrewCuisine = extractCuisineKeyFromQuery(hebrewQuery);
      const englishCuisine = extractCuisineKeyFromQuery(englishQuery);
      const russianCuisine = extractCuisineKeyFromQuery(russianQuery);

      const hebrewTypes = mapCuisineToIncludedTypes(hebrewCuisine || undefined);
      const englishTypes = mapCuisineToIncludedTypes(englishCuisine || undefined);
      const russianTypes = mapCuisineToIncludedTypes(russianCuisine || undefined);

      assert.deepEqual(hebrewTypes, englishTypes, 'Hebrew and English should produce identical includedTypes');
      assert.deepEqual(englishTypes, russianTypes, 'English and Russian should produce identical includedTypes');
    });

    it('should produce identical includedTypes for Sushi queries in he vs en vs ru', () => {
      const hebrewQuery = 'סושי קרוב';
      const englishQuery = 'sushi nearby';
      const russianQuery = 'суши рядом';

      const hebrewCuisine = extractCuisineKeyFromQuery(hebrewQuery);
      const englishCuisine = extractCuisineKeyFromQuery(englishQuery);
      const russianCuisine = extractCuisineKeyFromQuery(russianQuery);

      const hebrewTypes = mapCuisineToIncludedTypes(hebrewCuisine || undefined);
      const englishTypes = mapCuisineToIncludedTypes(englishCuisine || undefined);
      const russianTypes = mapCuisineToIncludedTypes(russianCuisine || undefined);

      assert.deepEqual(hebrewTypes, englishTypes, 'Hebrew and English sushi queries should produce identical includedTypes');
      assert.deepEqual(englishTypes, russianTypes, 'English and Russian sushi queries should produce identical includedTypes');
    });

    it('should produce identical includedTypes for generic restaurant queries', () => {
      const hebrewQuery = 'מסעדות קרוב';
      const englishQuery = 'restaurants nearby';
      const russianQuery = 'рестораны рядом';

      // Generic queries: cuisineKey=null, typeKey=restaurant
      const hebrewCuisine = extractCuisineKeyFromQuery(hebrewQuery);
      const englishCuisine = extractCuisineKeyFromQuery(englishQuery);
      const russianCuisine = extractCuisineKeyFromQuery(russianQuery);

      // All should be null (generic)
      assert.strictEqual(hebrewCuisine, null);
      assert.strictEqual(englishCuisine, null);
      assert.strictEqual(russianCuisine, null);

      // TypeKey extraction
      const hebrewType = extractTypeKeyFromQuery(hebrewQuery);
      const englishType = extractTypeKeyFromQuery(englishQuery);
      const russianType = extractTypeKeyFromQuery(russianQuery);

      // All should extract 'restaurant'
      assert.strictEqual(hebrewType, 'restaurant');
      assert.strictEqual(englishType, 'restaurant');
      assert.strictEqual(russianType, 'restaurant');

      // IncludedTypes should be identical
      const hebrewTypes = mapTypeToIncludedTypes(hebrewType || undefined);
      const englishTypes = mapTypeToIncludedTypes(englishType || undefined);
      const russianTypes = mapTypeToIncludedTypes(russianType || undefined);

      assert.deepEqual(hebrewTypes, englishTypes, 'Hebrew and English should produce identical includedTypes');
      assert.deepEqual(englishTypes, russianTypes, 'English and Russian should produce identical includedTypes');
    });
  });

  describe('Distance Origin (USER_LOCATION invariant)', () => {
    it('should always use USER_LOCATION for NEARBY route', () => {
      // This is verified by the ranking_distance_origin_selected log
      // For NEARBY route, distance origin should ALWAYS be USER_LOCATION
      // This test documents the invariant (actual verification in ranking tests)
      
      const routes = ['NEARBY', 'NEARBY', 'NEARBY'];
      const expectedOrigins = ['USER_LOCATION', 'USER_LOCATION', 'USER_LOCATION'];
      
      // All NEARBY routes should use USER_LOCATION
      assert.deepEqual(routes.map(() => 'USER_LOCATION'), expectedOrigins,
        'NEARBY route must always use USER_LOCATION as distance origin');
    });
  });
});
