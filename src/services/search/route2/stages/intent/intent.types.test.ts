/**
 * INTENT Types Unit Tests
 * 
 * Tests Zod schema validation for intent stage responses
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntentLLMSchema } from './intent.types.js';

describe('IntentLLMSchema Validation', () => {
  it('should parse valid intent response with cityText string', () => {
    const validResponse = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_location',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'language_hint',
      cityText: 'גדרה'
    };

    const result = IntentLLMSchema.parse(validResponse);

    assert.strictEqual(result.route, 'TEXTSEARCH');
    assert.strictEqual(result.cityText, 'גדרה');
  });

  it('should parse valid intent response with cityText null', () => {
    const responseWithNull = {
      route: 'NEARBY',
      confidence: 0.85,
      reason: 'near_me_phrase',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'user_location',
      cityText: null
    };

    const result = IntentLLMSchema.parse(responseWithNull);

    assert.strictEqual(result.route, 'NEARBY');
    assert.strictEqual(result.cityText, null);
  });

  it('should parse valid intent response without cityText', () => {
    const responseWithoutCity = {
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_detected',
      language: 'en',
      regionCandidate: 'US',
      regionConfidence: 0.85,
      regionReason: 'language_hint'
    };

    const result = IntentLLMSchema.parse(responseWithoutCity);

    assert.strictEqual(result.route, 'LANDMARK');
    assert.strictEqual(result.cityText, undefined);
  });

  it('should reject cityText empty string', () => {
    const responseWithEmptyCity = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'default',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'default',
      cityText: ''
    };

    assert.throws(
      () => IntentLLMSchema.parse(responseWithEmptyCity)
      // Error message varies by Zod version, just check it throws
    );
  });

  it('should reject missing required fields', () => {
    const incompleteResponse = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'default'
      // Missing language, region, regionConfidence, regionReason
    };

    assert.throws(
      () => IntentLLMSchema.parse(incompleteResponse)
    );
  });

  it('should reject invalid route value', () => {
    const invalidRoute = {
      route: 'INVALID',
      confidence: 0.8,
      reason: 'default',
      language: 'he',
      region: 'IL',
      regionConfidence: 0.7,
      regionReason: 'default'
    };

    assert.throws(
      () => IntentLLMSchema.parse(invalidRoute)
    );
  });

  it('should reject invalid region format', () => {
    const invalidRegion = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'default',
      language: 'he',
      regionCandidate: 'ISR', // Should be 2 letters
      regionConfidence: 0.7,
      regionReason: 'default'
    };

    assert.throws(
      () => IntentLLMSchema.parse(invalidRegion),
      /Invalid/
    );
  });

  it('should reject confidence out of range', () => {
    const invalidConfidence = {
      route: 'TEXTSEARCH',
      confidence: 1.5, // > 1
      reason: 'default',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'default'
    };

    assert.throws(
      () => IntentLLMSchema.parse(invalidConfidence)
      // Error message varies by Zod version, just check it throws
    );
  });

  it('should reject extra fields (strict mode)', () => {
    const responseWithExtra = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'default',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'default',
      extraField: 'should fail'
    };

    assert.throws(
      () => IntentLLMSchema.parse(responseWithExtra),
      /Unrecognized key/
    );
  });

  it('should handle all valid language options', () => {
    const languages = ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] as const;

    languages.forEach(lang => {
      const response = {
        route: 'TEXTSEARCH',
        confidence: 0.8,
        reason: 'default',
        language: lang,
        regionCandidate: 'IL',
        regionConfidence: 0.7,
        regionReason: 'default'
      };

      assert.doesNotThrow(() => IntentLLMSchema.parse(response));
    });
  });

  it('should handle all valid route options', () => {
    const routes = ['TEXTSEARCH', 'NEARBY', 'LANDMARK'] as const;

    routes.forEach(route => {
      const response = {
        route,
        confidence: 0.8,
        reason: 'default',
        language: 'he',
        regionCandidate: 'IL',
        regionConfidence: 0.7,
        regionReason: 'default'
      };

      assert.doesNotThrow(() => IntentLLMSchema.parse(response));
    });
  });

  it('should accept valid routing reason values', () => {
    // Valid reasons based on Intent2Reason type
    const validReasons = [
      'explicit_city_mentioned',
      'default_textsearch',
      'near_me_phrase',
      'explicit_distance_from_me',
      'landmark_detected',
      'ambiguous'
    ];

    validReasons.forEach(reason => {
      const response = {
        route: 'TEXTSEARCH',
        confidence: 0.8,
        reason,
        language: 'he',
        regionCandidate: 'IL',
        regionConfidence: 0.7,
        regionReason: 'language_hint'
      };

      assert.doesNotThrow(() => IntentLLMSchema.parse(response));
    });
  });

  it('should accept any 2-letter uppercase region codes (validation happens downstream)', () => {
    // Schema accepts any 2-letter uppercase codes (IS, TQ, XX, etc.)
    // Actual validation against ISO-3166-1 happens in sanitizeRegionCode
    const validFormat = ['IS', 'TQ', 'XX', 'ZZ', 'IL', 'US'];

    validFormat.forEach(regionCode => {
      const response = {
        route: 'TEXTSEARCH',
        confidence: 0.8,
        reason: 'default',
        language: 'he',
        regionCandidate: regionCode,
        regionConfidence: 0.7,
        regionReason: 'default'
      };

      assert.doesNotThrow(
        () => IntentLLMSchema.parse(response),
        `Should accept 2-letter uppercase: ${regionCode}`
      );
    });
  });

  it('should reject malformed region codes', () => {
    // Test truly invalid formats (not 2 uppercase letters)
    const invalidFormats = ['ISR', '12', 'il', 'Us', 'I', ''];

    invalidFormats.forEach(invalidFormat => {
      const response = {
        route: 'TEXTSEARCH',
        confidence: 0.8,
        reason: 'default',
        language: 'he',
        regionCandidate: invalidFormat,
        regionConfidence: 0.7,
        regionReason: 'default'
      };

      assert.throws(
        () => IntentLLMSchema.parse(response),
        `Should reject malformed region code: ${invalidFormat}`
      );
    });
  });
});
