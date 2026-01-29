/**
 * Region Code Validator Tests
 * Tests region code validation and sanitization logic
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  sanitizeRegionCode, 
  isValidRegionCode, 
  isKnownUnsupportedRegion,
  isInsideIsrael 
} from './region-code-validator.js';

describe('Region Code Validator', () => {
  describe('sanitizeRegionCode', () => {
    it('should map "IS" to "IL" (common LLM mistake for Israel)', () => {
      const result = sanitizeRegionCode('IS');
      assert.strictEqual(result, 'IL', 'IS should map to IL');
    });

    it('should pass through valid region codes unchanged', () => {
      const validCodes = ['IL', 'US', 'GB', 'FR', 'DE'];
      
      validCodes.forEach(code => {
        const result = sanitizeRegionCode(code);
        assert.strictEqual(result, code, `Valid code ${code} should pass through`);
      });
    });

    it('should return null for invalid region codes', () => {
      const invalidCodes = ['TQ', 'XX', 'ZZ', 'ISR', '12'];
      
      invalidCodes.forEach(code => {
        const result = sanitizeRegionCode(code);
        assert.strictEqual(result, null, `Invalid code ${code} should return null`);
      });
    });

    it('should handle "GZ" based on user location', () => {
      // Inside Israel -> map to IL
      const insideIsrael = { lat: 31.7683, lng: 35.2137 }; // Jerusalem
      const resultInside = sanitizeRegionCode('GZ', insideIsrael);
      assert.strictEqual(resultInside, 'IL', 'GZ inside Israel should map to IL');

      // Outside Israel -> return null
      const outsideIsrael = { lat: 40.7128, lng: -74.0060 }; // New York
      const resultOutside = sanitizeRegionCode('GZ', outsideIsrael);
      assert.strictEqual(resultOutside, null, 'GZ outside Israel should return null');
    });

    it('should return null for empty/null input', () => {
      assert.strictEqual(sanitizeRegionCode(null), null);
      assert.strictEqual(sanitizeRegionCode(undefined), null);
      assert.strictEqual(sanitizeRegionCode(''), null);
    });
  });

  describe('isValidRegionCode', () => {
    it('should validate common region codes', () => {
      const validCodes = ['IL', 'US', 'GB', 'FR', 'DE', 'JP', 'CN'];
      
      validCodes.forEach(code => {
        assert.strictEqual(
          isValidRegionCode(code), 
          true, 
          `${code} should be valid`
        );
      });
    });

    it('should reject invalid format codes', () => {
      const invalidCodes = ['ISR', '12', 'il', 'I', ''];
      
      invalidCodes.forEach(code => {
        assert.strictEqual(
          isValidRegionCode(code), 
          false, 
          `${code} should be invalid`
        );
      });
    });

    it('should reject codes not in CLDR allowlist', () => {
      // TQ, XX are valid format but not real ISO codes
      assert.strictEqual(isValidRegionCode('TQ'), false);
      assert.strictEqual(isValidRegionCode('XX'), false);
    });
  });

  describe('isKnownUnsupportedRegion', () => {
    it('should identify known unsupported regions', () => {
      assert.strictEqual(isKnownUnsupportedRegion('GZ'), true, 'GZ is known unsupported');
      assert.strictEqual(isKnownUnsupportedRegion('IS'), true, 'IS is known unsupported (LLM mistake)');
    });

    it('should return false for other codes', () => {
      const otherCodes = ['IL', 'US', 'TQ', 'XX'];
      
      otherCodes.forEach(code => {
        assert.strictEqual(
          isKnownUnsupportedRegion(code), 
          false, 
          `${code} should not be known unsupported`
        );
      });
    });
  });

  describe('isInsideIsrael', () => {
    it('should detect coordinates inside Israel', () => {
      // Tel Aviv
      assert.strictEqual(isInsideIsrael(32.0853, 34.7818), true);
      
      // Jerusalem
      assert.strictEqual(isInsideIsrael(31.7683, 35.2137), true);
      
      // Haifa
      assert.strictEqual(isInsideIsrael(32.7940, 34.9896), true);
    });

    it('should detect coordinates outside Israel', () => {
      // New York
      assert.strictEqual(isInsideIsrael(40.7128, -74.0060), false);
      
      // Paris
      assert.strictEqual(isInsideIsrael(48.8566, 2.3522), false);
      
      // Cairo (nearby but outside)
      assert.strictEqual(isInsideIsrael(30.0444, 31.2357), false);
    });

    it('should handle edge cases at borders', () => {
      // Just outside southern border
      assert.strictEqual(isInsideIsrael(29.0, 34.5), false);
      
      // Just outside northern border
      assert.strictEqual(isInsideIsrael(34.0, 35.5), false);
    });
  });
});
