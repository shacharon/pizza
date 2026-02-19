import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToGoogleQuery, isValidGoogleQuery, getSupportedCanonicals } from './google-query-normalizer.js';

describe('GoogleQueryNormalizer', () => {
  describe('normalizeToGoogleQuery', () => {
    it('should map "meat restaurant" to "steakhouse"', () => {
      const result = normalizeToGoogleQuery('meat restaurant');
      assert.equal(result, 'steakhouse');
    });

    it('should map "hummus restaurant" to "hummus"', () => {
      const result = normalizeToGoogleQuery('hummus restaurant');
      assert.equal(result, 'hummus');
    });

    it('should map "dairy restaurant" to "dairy restaurant"', () => {
      const result = normalizeToGoogleQuery('dairy restaurant');
      assert.equal(result, 'dairy restaurant');
    });

    it('should map "pizza" to "pizza"', () => {
      const result = normalizeToGoogleQuery('pizza');
      assert.equal(result, 'pizza');
    });

    it('should map "sushi restaurant" to "sushi"', () => {
      const result = normalizeToGoogleQuery('sushi restaurant');
      assert.equal(result, 'sushi');
    });

    it('should map "burger place" to "burger"', () => {
      const result = normalizeToGoogleQuery('burger place');
      assert.equal(result, 'burger');
    });

    it('should handle case-insensitive matching', () => {
      const result = normalizeToGoogleQuery('MEAT RESTAURANT');
      assert.equal(result, 'steakhouse');
    });

    it('should handle mixed case', () => {
      const result = normalizeToGoogleQuery('Meat Restaurant');
      assert.equal(result, 'steakhouse');
    });

    it('should return canonical as-is if no mapping exists', () => {
      const result = normalizeToGoogleQuery('exotic fusion cuisine');
      assert.equal(result, 'exotic fusion cuisine');
    });

    it('should return "restaurant" for null canonical', () => {
      const result = normalizeToGoogleQuery(null);
      assert.equal(result, 'restaurant');
    });

    it('should return "restaurant" for undefined canonical', () => {
      const result = normalizeToGoogleQuery(undefined);
      assert.equal(result, 'restaurant');
    });

    it('should return "restaurant" for empty string', () => {
      const result = normalizeToGoogleQuery('');
      assert.equal(result, 'restaurant');
    });

    it('should return "restaurant" for whitespace-only string', () => {
      const result = normalizeToGoogleQuery('   ');
      assert.equal(result, 'restaurant');
    });

    it('should trim whitespace before matching', () => {
      const result = normalizeToGoogleQuery('  meat restaurant  ');
      assert.equal(result, 'steakhouse');
    });
  });

  describe('isValidGoogleQuery', () => {
    it('should accept English queries', () => {
      assert.equal(isValidGoogleQuery('steakhouse'), true);
      assert.equal(isValidGoogleQuery('italian restaurant'), true);
      assert.equal(isValidGoogleQuery('pizza'), true);
    });

    it('should reject Hebrew queries', () => {
      assert.equal(isValidGoogleQuery('בשרים'), false);
      assert.equal(isValidGoogleQuery('מסעדה'), false);
      assert.equal(isValidGoogleQuery('פיצה'), false);
    });

    it('should reject Russian queries', () => {
      assert.equal(isValidGoogleQuery('мясной'), false);
      assert.equal(isValidGoogleQuery('ресторан'), false);
    });

    it('should reject Arabic queries', () => {
      assert.equal(isValidGoogleQuery('مطعم'), false);
      assert.equal(isValidGoogleQuery('لحم'), false);
    });

    it('should reject mixed English-Hebrew queries', () => {
      assert.equal(isValidGoogleQuery('restaurant בשרים'), false);
      assert.equal(isValidGoogleQuery('בשרים restaurant'), false);
    });

    it('should reject mixed English-Russian queries', () => {
      assert.equal(isValidGoogleQuery('restaurant мясной'), false);
    });

    it('should accept queries with numbers', () => {
      assert.equal(isValidGoogleQuery('restaurant 123'), true);
    });

    it('should accept queries with punctuation', () => {
      assert.equal(isValidGoogleQuery('pizza & pasta'), true);
    });
  });

  describe('getSupportedCanonicals', () => {
    it('should return list of supported canonicals', () => {
      const supported = getSupportedCanonicals();
      assert.ok(supported.length > 0);
      assert.ok(supported.includes('meat restaurant'));
      assert.ok(supported.includes('hummus restaurant'));
      assert.ok(supported.includes('pizza'));
    });

    it('should return unique list', () => {
      const supported = getSupportedCanonicals();
      const unique = [...new Set(supported)];
      assert.equal(supported.length, unique.length);
    });

    it('should include dairy restaurant', () => {
      const supported = getSupportedCanonicals();
      assert.ok(supported.includes('dairy restaurant'));
    });

    it('should include common cuisines', () => {
      const supported = getSupportedCanonicals();
      assert.ok(supported.includes('italian restaurant'));
      assert.ok(supported.includes('chinese restaurant'));
      assert.ok(supported.includes('japanese restaurant'));
    });
  });

  describe('Non-Latin Recovery', () => {
    it('should recover Hebrew sushi to "sushi"', () => {
      const result = normalizeToGoogleQuery('סושי');
      assert.equal(result, 'sushi');
    });

    it('should recover Hebrew meat restaurant to "steakhouse"', () => {
      const result = normalizeToGoogleQuery('בשרים');
      assert.equal(result, 'steakhouse');
    });

    it('should recover Hebrew hummus to "hummus"', () => {
      const result = normalizeToGoogleQuery('חומוסיה');
      assert.equal(result, 'hummus');
    });

    it('should recover Russian sushi to "sushi"', () => {
      const result = normalizeToGoogleQuery('суши');
      assert.equal(result, 'sushi');
    });

    it('should recover Russian meat restaurant to "steakhouse"', () => {
      const result = normalizeToGoogleQuery('мясной ресторан');
      assert.equal(result, 'steakhouse');
    });

    it('should fall back to "restaurant" for unknown non-Latin', () => {
      const result = normalizeToGoogleQuery('קטגוריה_לא_ידועה');
      assert.equal(result, 'restaurant');
    });

    it('should handle partial matches in compound queries', () => {
      const result = normalizeToGoogleQuery('מסעדת סושי במרכז');
      assert.equal(result, 'sushi');
    });
  });
});
