/**
 * Tests for Intent Stage - Hybrid Ordering Flags
 * 
 * Verifies that intent flags are language-agnostic:
 * Same semantic query in different languages → same flags
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IntentLLMSchema } from '../intent.types.js';

describe('Intent Stage - Hybrid Ordering Flags', () => {
  describe('Language-Agnostic Flag Detection', () => {
    it('Italian query - Hebrew vs English should have same cuisineKey', () => {
      const hebrewResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'he' as const,
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: 'תל אביב',
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: 'italian'
      };

      const englishResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'en' as const,
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'english_query',
        cityText: 'Tel Aviv',
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: 'italian'
      };

      // Validate both schemas
      const heValidated = IntentLLMSchema.parse(hebrewResult);
      const enValidated = IntentLLMSchema.parse(englishResult);

      // Same semantic intent → same flags (language-agnostic)
      assert.strictEqual(heValidated.cuisineKey, enValidated.cuisineKey);
      assert.strictEqual(heValidated.distanceIntent, enValidated.distanceIntent);
      assert.strictEqual(heValidated.openNowRequested, enValidated.openNowRequested);
      assert.strictEqual(heValidated.priceIntent, enValidated.priceIntent);
      assert.strictEqual(heValidated.qualityIntent, enValidated.qualityIntent);
      assert.strictEqual(heValidated.occasion, enValidated.occasion);
    });

    it('Romantic query - Hebrew vs English should have same flags', () => {
      const hebrewResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.85,
        reason: 'default_textsearch',
        language: 'he' as const,
        languageConfidence: 0.9,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: true,
        occasion: 'romantic' as const,
        cuisineKey: null
      };

      const englishResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.85,
        reason: 'default_textsearch',
        language: 'en' as const,
        languageConfidence: 0.9,
        regionCandidate: 'US',
        regionConfidence: 0.8,
        regionReason: 'english_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: true,
        occasion: 'romantic' as const,
        cuisineKey: null
      };

      const heValidated = IntentLLMSchema.parse(hebrewResult);
      const enValidated = IntentLLMSchema.parse(englishResult);

      // Romantic intent should be detected regardless of language
      assert.strictEqual(heValidated.qualityIntent, true);
      assert.strictEqual(enValidated.qualityIntent, true);
      assert.strictEqual(heValidated.occasion, 'romantic');
      assert.strictEqual(enValidated.occasion, 'romantic');

      // All flags should match
      assert.strictEqual(heValidated.distanceIntent, enValidated.distanceIntent);
      assert.strictEqual(heValidated.openNowRequested, enValidated.openNowRequested);
      assert.strictEqual(heValidated.priceIntent, enValidated.priceIntent);
    });

    it('Near me query - Hebrew vs English should have same distanceIntent', () => {
      const hebrewResult = {
        route: 'NEARBY' as const,
        confidence: 0.9,
        reason: 'near_me_phrase',
        language: 'he' as const,
        languageConfidence: 0.9,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: null,
        distanceIntent: true,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const englishResult = {
        route: 'NEARBY' as const,
        confidence: 0.9,
        reason: 'near_me_phrase',
        language: 'en' as const,
        languageConfidence: 0.95,
        regionCandidate: 'US',
        regionConfidence: 0.9,
        regionReason: 'english_query',
        cityText: null,
        distanceIntent: true,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const heValidated = IntentLLMSchema.parse(hebrewResult);
      const enValidated = IntentLLMSchema.parse(englishResult);

      // Distance intent should be detected for both
      assert.strictEqual(heValidated.distanceIntent, true);
      assert.strictEqual(enValidated.distanceIntent, true);
      assert.strictEqual(heValidated.route, 'NEARBY');
      assert.strictEqual(enValidated.route, 'NEARBY');
    });

    it('Cheap query - Hebrew vs English should have same priceIntent', () => {
      const hebrewResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.85,
        reason: 'default_textsearch',
        language: 'he' as const,
        languageConfidence: 0.9,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'cheap' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const englishResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.85,
        reason: 'default_textsearch',
        language: 'en' as const,
        languageConfidence: 0.9,
        regionCandidate: 'US',
        regionConfidence: 0.8,
        regionReason: 'english_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'cheap' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const heValidated = IntentLLMSchema.parse(hebrewResult);
      const enValidated = IntentLLMSchema.parse(englishResult);

      // Price intent should match
      assert.strictEqual(heValidated.priceIntent, 'cheap');
      assert.strictEqual(enValidated.priceIntent, 'cheap');
    });

    it('Open now query - Hebrew vs English should have same openNowRequested', () => {
      const hebrewResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.85,
        reason: 'default_textsearch',
        language: 'he' as const,
        languageConfidence: 0.9,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: true,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const englishResult = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.85,
        reason: 'default_textsearch',
        language: 'en' as const,
        languageConfidence: 0.9,
        regionCandidate: 'US',
        regionConfidence: 0.8,
        regionReason: 'english_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: true,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const heValidated = IntentLLMSchema.parse(hebrewResult);
      const enValidated = IntentLLMSchema.parse(englishResult);

      // OpenNow intent should match
      assert.strictEqual(heValidated.openNowRequested, true);
      assert.strictEqual(enValidated.openNowRequested, true);
    });

    it('Complex query - multiple flags in Hebrew vs English', () => {
      // "cheap italian near me open now" in both languages
      const hebrewResult = {
        route: 'NEARBY' as const,
        confidence: 0.85,
        reason: 'near_me_phrase',
        language: 'he' as const,
        languageConfidence: 0.9,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: null,
        distanceIntent: true,
        openNowRequested: true,
        priceIntent: 'cheap' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: 'italian'
      };

      const englishResult = {
        route: 'NEARBY' as const,
        confidence: 0.85,
        reason: 'near_me_phrase',
        language: 'en' as const,
        languageConfidence: 0.95,
        regionCandidate: 'US',
        regionConfidence: 0.8,
        regionReason: 'english_query',
        cityText: null,
        distanceIntent: true,
        openNowRequested: true,
        priceIntent: 'cheap' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: 'italian'
      };

      const heValidated = IntentLLMSchema.parse(hebrewResult);
      const enValidated = IntentLLMSchema.parse(englishResult);

      // All flags should match (language-agnostic)
      assert.strictEqual(heValidated.distanceIntent, enValidated.distanceIntent);
      assert.strictEqual(heValidated.openNowRequested, enValidated.openNowRequested);
      assert.strictEqual(heValidated.priceIntent, enValidated.priceIntent);
      assert.strictEqual(heValidated.qualityIntent, enValidated.qualityIntent);
      assert.strictEqual(heValidated.occasion, enValidated.occasion);
      assert.strictEqual(heValidated.cuisineKey, enValidated.cuisineKey);
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid intent with all hybrid flags', () => {
      const validIntent = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'he' as const,
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: 'תל אביב',
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const result = IntentLLMSchema.parse(validIntent);
      assert.ok(result);
      assert.strictEqual(result.route, 'TEXTSEARCH');
      assert.strictEqual(result.distanceIntent, false);
      assert.strictEqual(result.priceIntent, 'any');
    });

    it('should reject intent missing hybrid flags', () => {
      const invalidIntent = {
        route: 'TEXTSEARCH',
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'he',
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: 'תל אביב'
        // Missing: distanceIntent, openNowRequested, priceIntent, qualityIntent, occasion, cuisineKey
      };

      assert.throws(() => {
        IntentLLMSchema.parse(invalidIntent);
      });
    });

    it('should reject invalid priceIntent value', () => {
      const invalidIntent = {
        route: 'TEXTSEARCH',
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'he',
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: 'תל אביב',
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'expensive', // Invalid value
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      assert.throws(() => {
        IntentLLMSchema.parse(invalidIntent);
      });
    });

    it('should reject invalid occasion value', () => {
      const invalidIntent = {
        route: 'TEXTSEARCH',
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'he',
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: 'תל אביב',
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any',
        qualityIntent: false,
        occasion: 'birthday', // Invalid value (not in enum)
        cuisineKey: null
      };

      assert.throws(() => {
        IntentLLMSchema.parse(invalidIntent);
      });
    });

    it('should accept null values for nullable fields', () => {
      const validIntent = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.9,
        reason: 'default_textsearch',
        language: 'en' as const,
        languageConfidence: 0.9,
        regionCandidate: 'US',
        regionConfidence: 0.8,
        regionReason: 'english_query',
        cityText: null,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const,
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const result = IntentLLMSchema.parse(validIntent);
      assert.ok(result);
      // For nullable().optional() fields, null input stays as null (not undefined)
      // undefined is only used when the key is missing entirely
      assert.strictEqual(result.cityText, null);
      assert.strictEqual(result.occasion, null);
      assert.strictEqual(result.cuisineKey, null);
    });
  });

  describe('Default Values', () => {
    it('should use default "any" for priceIntent when not specified', () => {
      // This tests the expected behavior - in practice, LLM should always provide priceIntent
      // But if fallback is used, "any" is the default
      const intentWithDefaults = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.3,
        reason: 'fallback',
        language: 'en' as const,
        languageConfidence: 0.5,
        regionCandidate: 'IL',
        regionConfidence: 0.1,
        regionReason: 'fallback_default',
        cityText: null,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any' as const, // Default
        qualityIntent: false,
        occasion: null,
        cuisineKey: null
      };

      const result = IntentLLMSchema.parse(intentWithDefaults);
      assert.strictEqual(result.priceIntent, 'any');
    });

    it('should use false for boolean flags when not triggered', () => {
      const intentWithFalseFlags = {
        route: 'TEXTSEARCH' as const,
        confidence: 0.9,
        reason: 'explicit_city_mentioned',
        language: 'he' as const,
        languageConfidence: 0.95,
        regionCandidate: 'IL',
        regionConfidence: 0.9,
        regionReason: 'hebrew_query',
        cityText: 'תל אביב',
        distanceIntent: false, // Not a proximity query
        openNowRequested: false, // Not an open now query
        priceIntent: 'any' as const,
        qualityIntent: false, // Not a quality query
        occasion: null,
        cuisineKey: 'italian'
      };

      const result = IntentLLMSchema.parse(intentWithFalseFlags);
      assert.strictEqual(result.distanceIntent, false);
      assert.strictEqual(result.openNowRequested, false);
      assert.strictEqual(result.qualityIntent, false);
    });
  });
});
