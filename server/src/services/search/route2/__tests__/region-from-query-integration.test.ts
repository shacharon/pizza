/**
 * Integration Test: Region Inference from Query Text
 * Verifies that regionCode flows from Intent LLM through filters to Google API
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { resolveFilters } from '../shared/filters-resolver.js';
import type { PreGoogleBaseFilters } from '../shared/shared-filters.types.js';
import type { IntentResult } from '../types.js';

describe('Region Inference Integration', () => {
  it('should prioritize intent.regionCode over deviceRegionCode', async () => {
    const baseFilters: PreGoogleBaseFilters = {
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
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_near_query',
      language: 'ru',
      languageConfidence: 0.95,
      regionCandidate: 'IL', // Device region
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: 'GB', // ✅ Query-inferred region (Big Ben)
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

    const finalFilters = await resolveFilters({
      base: baseFilters,
      intent,
      deviceRegionCode: 'IL', // Device says IL
      userLocation: null,
      requestId: 'test-req-1',
      query: 'Рестораны рядом с Big Ben'
    });

    // CRITICAL: finalFilters.regionCode should use intent.regionCode (GB), not deviceRegionCode (IL)
    assert.strictEqual(
      finalFilters.regionCode,
      'GB',
      'Should prioritize query-inferred regionCode (GB) over device region (IL)'
    );
  });

  it('should fallback to deviceRegionCode when intent.regionCode is null', async () => {
    const baseFilters: PreGoogleBaseFilters = {
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
      clarify: null
    };

    const finalFilters = await resolveFilters({
      base: baseFilters,
      intent,
      deviceRegionCode: 'IL', // Fallback to device region
      userLocation: null,
      requestId: 'test-req-2',
      query: 'מסעדות לידי'
    });

    assert.strictEqual(
      finalFilters.regionCode,
      'IL',
      'Should fallback to deviceRegionCode (IL) when intent.regionCode is null'
    );
  });

  it('should use intent.regionCode for Eiffel Tower query', async () => {
    const baseFilters: PreGoogleBaseFilters = {
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
      route: 'LANDMARK',
      confidence: 0.9,
      reason: 'landmark_near_query',
      language: 'he',
      languageConfidence: 0.95,
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device_fallback',
      regionCode: 'FR', // ✅ Inferred from Eiffel Tower
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

    const finalFilters = await resolveFilters({
      base: baseFilters,
      intent,
      deviceRegionCode: 'IL',
      userLocation: null,
      requestId: 'test-req-3',
      query: 'מסעדות ליד מגדל אייפל'
    });

    assert.strictEqual(
      finalFilters.regionCode,
      'FR',
      'Should use query-inferred regionCode (FR) for Eiffel Tower'
    );
  });

  it('should fallback to IL when all region sources are null', async () => {
    const baseFilters: PreGoogleBaseFilters = {
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
      reason: 'default',
      language: 'en',
      languageConfidence: 0.8,
      regionCandidate: null as any, // No candidate
      regionConfidence: 0.5,
      regionReason: 'default',
      regionCode: null, // No query-inferred region
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

    const finalFilters = await resolveFilters({
      base: baseFilters,
      intent,
      deviceRegionCode: null, // No device region
      userLocation: null,
      requestId: 'test-req-4',
      query: 'pizza'
    });

    assert.strictEqual(
      finalFilters.regionCode,
      'IL',
      'Should fallback to default IL when all region sources are null'
    );
  });
});
