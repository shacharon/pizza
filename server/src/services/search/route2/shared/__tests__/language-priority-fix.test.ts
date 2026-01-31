/**
 * Language Priority Fix Tests
 * 
 * P0 Fix: Intent language with high confidence should override deterministic detection
 * 
 * Before: detectQueryLanguage('Restaurante asiático en Tel Aviv') -> 'en' (wrong)
 * After:  intentLanguage='es', confidence=1.0 -> queryLanguage='es' (correct)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFilters } from '../filters-resolver.js';
import type { PreGoogleBaseFilters } from '../shared-filters.types.js';
import type { IntentResult } from '../../types.js';

describe('Language Priority Fix - IntentLanguage with High Confidence', () => {
  it('should use intentLanguage=es when confidence >= 0.7 (Spanish query)', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 1.0,
      reason: 'explicit_city_mentioned',
      language: 'es', // LLM detected Spanish
      languageConfidence: 1.0, // High confidence
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'Tel Aviv'
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'Restaurante asiático en Tel Aviv',
      deviceRegionCode: 'IL',
      requestId: 'test-es-priority'
    });

    // CRITICAL: queryLanguage should be 'es' (from intentLanguage), not 'en' (from detector)
    assert.strictEqual(result.languageContext.queryLanguage, 'es', 'queryLanguage should be es from intentLanguage');
    assert.strictEqual(result.languageContext.assistantLanguage, 'es', 'assistantLanguage should match queryLanguage');
    assert.strictEqual(result.languageContext.searchLanguage, 'es', 'searchLanguage should be es (queryLanguage policy)');
    assert.strictEqual(result.providerLanguage, 'es', 'providerLanguage should be es');
  });

  it('should use intentLanguage=ru when confidence >= 0.7 (Russian query)', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_city_mentioned',
      language: 'ru', // LLM detected Russian
      languageConfidence: 0.9, // High confidence
      regionCandidate: 'IL',
      regionConfidence: 0.85,
      regionReason: 'device',
      cityText: undefined
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'Ресторан в Тель-Авиве',
      deviceRegionCode: 'IL',
      requestId: 'test-ru-priority'
    });

    assert.strictEqual(result.languageContext.queryLanguage, 'ru', 'queryLanguage should be ru from intentLanguage');
    assert.strictEqual(result.languageContext.assistantLanguage, 'ru', 'assistantLanguage should match queryLanguage');
    assert.strictEqual(result.languageContext.searchLanguage, 'ru', 'searchLanguage should be ru');
  });

  it('should use intentLanguage=ar when confidence >= 0.7 (Arabic query)', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'generic_food',
      language: 'ar', // LLM detected Arabic
      languageConfidence: 0.8, // High confidence
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'مطعم في تل أبيب',
      deviceRegionCode: 'IL',
      requestId: 'test-ar-priority'
    });

    assert.strictEqual(result.languageContext.queryLanguage, 'ar', 'queryLanguage should be ar from intentLanguage');
    assert.strictEqual(result.languageContext.assistantLanguage, 'ar', 'assistantLanguage should match queryLanguage');
    assert.strictEqual(result.languageContext.searchLanguage, 'ar', 'searchLanguage should be ar');
  });

  it('should use detectQueryLanguage when intentLanguage confidence < 0.7 (Hebrew query)', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.85,
      reason: 'explicit_city_mentioned',
      language: 'he', // LLM detected Hebrew
      languageConfidence: 0.6, // Low confidence (below 0.7 threshold)
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'גדרה'
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'מסעדות בגדרה',
      deviceRegionCode: 'IL',
      requestId: 'test-he-detector'
    });

    // Should use detector (returns 'he' for Hebrew text)
    assert.strictEqual(result.languageContext.queryLanguage, 'he', 'queryLanguage should be he from detector');
    assert.strictEqual(result.languageContext.assistantLanguage, 'he', 'assistantLanguage should match queryLanguage');
  });

  it('should fallback to detector for English when intentLanguage confidence < 0.7', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'explicit_city_mentioned',
      language: 'en', // LLM detected English
      languageConfidence: 0.5, // Low confidence (below 0.7 threshold)
      regionCandidate: 'US',
      regionConfidence: 0.8,
      regionReason: 'explicit',
      cityText: 'New York'
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'restaurants in New York',
      deviceRegionCode: 'US',
      requestId: 'test-en-detector'
    });

    // Should use detector (returns 'en' for English text)
    assert.strictEqual(result.languageContext.queryLanguage, 'en', 'queryLanguage should be en from detector');
    assert.strictEqual(result.languageContext.assistantLanguage, 'en', 'assistantLanguage should match queryLanguage');
  });

  it('should handle missing query (no detector) - use intentLanguage if confidence high', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'explicit_city_mentioned',
      language: 'fr', // LLM detected French
      languageConfidence: 0.85, // High confidence
      regionCandidate: 'FR',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'Paris'
    };

    const result = await resolveFilters({
      base,
      intent,
      // No query provided
      deviceRegionCode: 'FR',
      requestId: 'test-fr-no-query'
    });

    // Should use intentLanguage since no query to detect from
    assert.strictEqual(result.languageContext.queryLanguage, 'fr', 'queryLanguage should be fr from intentLanguage');
    assert.strictEqual(result.languageContext.assistantLanguage, 'fr', 'assistantLanguage should match queryLanguage');
  });

  it('should fallback to en when intentLanguage confidence < 0.7 and no query', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.7,
      reason: 'generic_food',
      language: 'es', // LLM detected Spanish
      languageConfidence: 0.6, // Low confidence (below 0.7 threshold)
      regionCandidate: 'ES',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const result = await resolveFilters({
      base,
      intent,
      // No query provided AND low confidence
      deviceRegionCode: 'ES',
      requestId: 'test-fallback-en'
    });

    // Should fallback to 'en' (no query to detect from, low confidence intentLanguage)
    assert.strictEqual(result.languageContext.queryLanguage, 'en', 'queryLanguage should fallback to en');
    assert.strictEqual(result.languageContext.assistantLanguage, 'en', 'assistantLanguage should match queryLanguage');
  });
});

describe('Language Priority Fix - Backward Compatibility', () => {
  it('should not affect Hebrew queries (already working)', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.95,
      reason: 'explicit_city_mentioned',
      language: 'he',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.95,
      regionReason: 'explicit',
      cityText: 'תל אביב'
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'מסעדות בתל אביב',
      deviceRegionCode: 'IL',
      requestId: 'test-he-compat'
    });

    assert.strictEqual(result.languageContext.queryLanguage, 'he');
    assert.strictEqual(result.languageContext.assistantLanguage, 'he');
  });

  it('should not affect English queries (already working)', async () => {
    const base: PreGoogleBaseFilters = {
      language: 'auto',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionHint: null
    };

    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'explicit_city_mentioned',
      language: 'en',
      languageConfidence: 0.9,
      regionCandidate: 'US',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'New York'
    };

    const result = await resolveFilters({
      base,
      intent,
      query: 'restaurants in New York',
      deviceRegionCode: 'US',
      requestId: 'test-en-compat'
    });

    assert.strictEqual(result.languageContext.queryLanguage, 'en');
    assert.strictEqual(result.languageContext.assistantLanguage, 'en');
  });
});
