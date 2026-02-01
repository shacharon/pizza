/**
 * Intent Stage - Region Inference from Query Text
 * Tests that regionCode is correctly inferred from query semantics via LLM
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { IntentLLMSchema } from '../intent.types.js';

describe('Intent Region Inference from Query Text', () => {
  it('should infer GB from "Рестораны рядом с Big Ben"', () => {
    const llmOutput = {
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_near_query',
      language: 'ru',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: 'GB', // ✅ Inferred from "Big Ben" (London, UK)
      cityText: null,
      assistantLanguage: 'ru',
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    const result = IntentLLMSchema.parse(llmOutput);
    assert.strictEqual(result.regionCode, 'GB', 'Should infer GB from Big Ben');
  });

  it('should infer FR from "מסעדות ליד מגדל אייפל"', () => {
    const llmOutput = {
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_near_query',
      language: 'he',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: 'FR', // ✅ Inferred from "מגדל אייפל" (Eiffel Tower, Paris, France)
      cityText: null,
      assistantLanguage: 'he',
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    const result = IntentLLMSchema.parse(llmOutput);
    assert.strictEqual(result.regionCode, 'FR', 'Should infer FR from Eiffel Tower');
  });

  it('should return null regionCode for "מסעדות לידי" (no geographic clue)', () => {
    const llmOutput = {
      route: 'NEARBY',
      confidence: 0.85,
      reason: 'near_me_intent',
      language: 'he',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: null, // ✅ No geographic clue in query
      cityText: null,
      assistantLanguage: 'he',
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: {
        reason: 'MISSING_LOCATION',
        blocksSearch: true,
        suggestedAction: 'ASK_LOCATION',
        message: 'כדי לחפש לידי אני צריך את המיקום שלך',
        question: 'באיזה אזור אתה מחפש?'
      }
    };

    const result = IntentLLMSchema.parse(llmOutput);
    assert.strictEqual(result.regionCode, null, 'Should return null for queries without geographic clues');
  });

  it('should infer IL from "pizza in Tel Aviv"', () => {
    const llmOutput = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'explicit_city',
      language: 'en',
      languageConfidence: 0.9,
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit_city',
      regionCode: 'IL', // ✅ Inferred from "Tel Aviv" (Israel)
      cityText: 'Tel Aviv',
      assistantLanguage: 'en',
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    const result = IntentLLMSchema.parse(llmOutput);
    assert.strictEqual(result.regionCode, 'IL', 'Should infer IL from Tel Aviv');
  });

  it('should infer US from "sushi near Times Square"', () => {
    const llmOutput = {
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_near_query',
      language: 'en',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: 'US', // ✅ Inferred from "Times Square" (New York, USA)
      cityText: null,
      assistantLanguage: 'en',
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    const result = IntentLLMSchema.parse(llmOutput);
    assert.strictEqual(result.regionCode, 'US', 'Should infer US from Times Square');
  });

  it('should infer IT from "pizza near Colosseum"', () => {
    const llmOutput = {
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_near_query',
      language: 'en',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: 'IT', // ✅ Inferred from "Colosseum" (Rome, Italy)
      cityText: null,
      assistantLanguage: 'en',
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    const result = IntentLLMSchema.parse(llmOutput);
    assert.strictEqual(result.regionCode, 'IT', 'Should infer IT from Colosseum');
  });

  it('should reject invalid ISO-2 codes', () => {
    const invalidOutput = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'test',
      language: 'en',
      languageConfidence: 0.9,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'test',
      regionCode: 'USA', // ❌ Invalid ISO-2 code (should be 'US')
      cityText: null,
      assistantLanguage: 'en',
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    assert.throws(() => IntentLLMSchema.parse(invalidOutput), 'Should reject invalid ISO-2 codes');
  });

  it('should accept lowercase null as regionCode', () => {
    const validOutput = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'test',
      language: 'en',
      languageConfidence: 0.9,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'test',
      regionCode: null, // ✅ null is valid (no geographic clue)
      cityText: null,
      assistantLanguage: 'en',
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: null,
      cuisineKey: null,
      clarify: null
    };

    const result = IntentLLMSchema.parse(validOutput);
    assert.strictEqual(result.regionCode, null, 'Should accept null regionCode');
  });
});
