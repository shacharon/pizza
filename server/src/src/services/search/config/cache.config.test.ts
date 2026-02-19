/**
 * Unit tests for Cache Configuration
 * Intent Performance Policy: Cache key stability
 */

import { describe, it, expect } from '@jest/globals';
import { buildIntentCacheKey } from './cache.config.js';

describe('buildIntentCacheKey', () => {
  describe('Normalization', () => {
    it('should normalize spaces and punctuation', () => {
      const key1 = buildIntentCacheKey('pizza  in  tel  aviv', 'en');
      const key2 = buildIntentCacheKey('pizza in tel aviv', 'en');
      expect(key1).toBe(key2);
    });

    it('should strip punctuation', () => {
      const key1 = buildIntentCacheKey('pizza in tel aviv?', 'en');
      const key2 = buildIntentCacheKey('pizza in tel aviv', 'en');
      expect(key1).toBe(key2);
    });

    it('should strip multiple punctuation marks', () => {
      const key1 = buildIntentCacheKey('pizza, burger! sushi?', 'en');
      const key2 = buildIntentCacheKey('pizza burger sushi', 'en');
      expect(key1).toBe(key2);
    });

    it('should collapse multiple spaces', () => {
      const key1 = buildIntentCacheKey('pizza    in    tel    aviv', 'en');
      const key2 = buildIntentCacheKey('pizza in tel aviv', 'en');
      expect(key1).toBe(key2);
    });

    it('should be case insensitive', () => {
      const key1 = buildIntentCacheKey('Pizza In Tel Aviv', 'en');
      const key2 = buildIntentCacheKey('pizza in tel aviv', 'en');
      expect(key1).toBe(key2);
    });

    it('should trim whitespace', () => {
      const key1 = buildIntentCacheKey('  pizza in tel aviv  ', 'en');
      const key2 = buildIntentCacheKey('pizza in tel aviv', 'en');
      expect(key1).toBe(key2);
    });
  });

  describe('Language Differentiation', () => {
    it('should differentiate by language', () => {
      const keyEn = buildIntentCacheKey('pizza in tel aviv', 'en');
      const keyHe = buildIntentCacheKey('pizza in tel aviv', 'he');
      expect(keyEn).not.toBe(keyHe);
    });

    it('should handle Hebrew queries', () => {
      const key1 = buildIntentCacheKey('פיצה בתל אביב', 'he');
      const key2 = buildIntentCacheKey('פיצה בתל אביב', 'he');
      expect(key1).toBe(key2);
    });
  });

  describe('Geo Bucket', () => {
    it('should include geo bucket from currentCity', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', { currentCity: 'Tel Aviv' });
      const key2 = buildIntentCacheKey('pizza', 'en', { currentCity: 'Jerusalem' });
      expect(key1).not.toBe(key2);
    });

    it('should include geo bucket from lastIntent.location.city', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', { 
        lastIntent: { location: { city: 'Tel Aviv' } } 
      });
      const key2 = buildIntentCacheKey('pizza', 'en', { 
        lastIntent: { location: { city: 'Jerusalem' } } 
      });
      expect(key1).not.toBe(key2);
    });

    it('should prefer currentCity over lastIntent.location.city', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', { 
        currentCity: 'Tel Aviv',
        lastIntent: { location: { city: 'Jerusalem' } } 
      });
      const key2 = buildIntentCacheKey('pizza', 'en', { 
        currentCity: 'Tel Aviv',
        lastIntent: { location: { city: 'Haifa' } } 
      });
      expect(key1).toBe(key2); // Same currentCity, so same key
    });

    it('should use "unknown" when no geo context', () => {
      const key1 = buildIntentCacheKey('pizza', 'en');
      const key2 = buildIntentCacheKey('pizza', 'en', {});
      expect(key1).toBe(key2);
      expect(key1).toContain('unknown');
    });

    it('should normalize geo bucket case', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', { currentCity: 'Tel Aviv' });
      const key2 = buildIntentCacheKey('pizza', 'en', { currentCity: 'tel aviv' });
      expect(key1).toBe(key2);
    });
  });

  describe('Context Hash', () => {
    it('should include context hash when openNow filter exists', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', {
        lastIntent: { filters: { openNow: true } }
      });
      const key2 = buildIntentCacheKey('pizza', 'en', {
        lastIntent: { filters: { openNow: false } }
      });
      expect(key1).not.toBe(key2);
    });

    it('should include context hash when dietary filter exists', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', {
        lastIntent: { filters: { dietary: ['vegan'] } }
      });
      const key2 = buildIntentCacheKey('pizza', 'en', {
        lastIntent: { filters: { dietary: ['kosher'] } }
      });
      expect(key1).not.toBe(key2);
    });

    it('should omit context hash when no relevant filters', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', {
        lastIntent: { filters: {} }
      });
      const key2 = buildIntentCacheKey('pizza', 'en');
      expect(key1).toBe(key2);
    });

    it('should omit context hash when filters are undefined', () => {
      const key1 = buildIntentCacheKey('pizza', 'en', {
        lastIntent: {}
      });
      const key2 = buildIntentCacheKey('pizza', 'en');
      expect(key1).toBe(key2);
    });
  });

  describe('Cache Key Format', () => {
    it('should use v2 format', () => {
      const key = buildIntentCacheKey('pizza in tel aviv', 'en');
      expect(key).toContain('intent:v2:');
    });

    it('should have correct structure: intent:v2:lang:geo:query', () => {
      const key = buildIntentCacheKey('pizza', 'en', { currentCity: 'Tel Aviv' });
      expect(key).toMatch(/^intent:v2:en:tel aviv:pizza$/);
    });

    it('should append context hash when present', () => {
      const key = buildIntentCacheKey('pizza', 'en', {
        currentCity: 'Tel Aviv',
        lastIntent: { filters: { openNow: true } }
      });
      expect(key).toContain(':ctx:');
    });
  });

  describe('Stability Across Variations', () => {
    it('should produce same key for equivalent queries', () => {
      const variations = [
        'pizza in tel aviv',
        'Pizza In Tel Aviv',
        'pizza  in  tel  aviv',
        'pizza in tel aviv?',
        'pizza in tel aviv!',
        '  pizza in tel aviv  '
      ];

      const keys = variations.map(q => buildIntentCacheKey(q, 'en'));
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1);
    });

    it('should produce different keys for semantically different queries', () => {
      const queries = [
        'pizza in tel aviv',
        'burger in tel aviv',
        'pizza in jerusalem',
        'pizza'
      ];

      const keys = queries.map(q => buildIntentCacheKey(q, 'en'));
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(queries.length);
    });
  });
});

