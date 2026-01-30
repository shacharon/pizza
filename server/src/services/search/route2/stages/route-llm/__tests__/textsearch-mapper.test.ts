/**
 * Unit tests for TEXTSEARCH mapper - Location Bias & Cleanup
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { executeTextSearchMapper } from '../textsearch.mapper.js';
import type { IntentResult } from '../../../types.js';
import type { SearchRequest } from '../../../../types/search-request.dto.js';
import type { Route2Context } from '../../../types.js';
import type { FinalSharedFilters } from '../../../shared/shared-filters.types.js';

describe('TEXTSEARCH Mapper - Bias Cleanup', () => {
  /**
   * Test: TEXTSEARCH should NOT include dummy bias objects
   * Regression test for bias leftovers (lat:0, lng:0)
   */
  it('should not include dummy bias objects for city_text queries', async () => {
    // Mock intent
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'he',
      confidence: 0.8,
      reason: 'city_text',
      regionConfidence: 0.9,
      regionReason: 'explicit'
    };

    // Mock request
    const request: SearchRequest = {
      query: 'מסעדות איטלקיות בגדרה',
      userLocation: {
        lat: 32.0804,
        lng: 34.7807
      }
    };

    // Mock context with LLM provider
    const mockLLMProvider = {
      completeJSON: async () => ({
        data: {
          providerMethod: 'textSearch' as const,
          textQuery: 'מסעדות איטלקיות בגדרה',
          region: 'IL',
          language: 'he',
          bias: null, // LLM correctly returns null
          reason: 'original_preserved'
        },
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        },
        model: 'gpt-4o-mini'
      }),
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-req-1',
      traceId: 'test-trace-1',
      sessionId: 'test-session-1',
      llmProvider: mockLLMProvider as any,
      userRegionCode: 'IL',
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'he',
      uiLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    // Execute mapper
    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Assertions
    assert.strictEqual(result.providerMethod, 'textSearch');
    assert.strictEqual(result.textQuery, 'מסעדות איטלקיות בגדרה');

    // UPDATED: With userLocation present, bias should be set from userLocation
    assert.ok(result.bias, 'Bias should be set when userLocation is present');
    assert.strictEqual(result.bias?.center.lat, 32.0804);
    assert.strictEqual(result.bias?.center.lng, 34.7807);
    assert.strictEqual(result.bias?.radiusMeters, 20000);

    // Ensure no dummy coordinates
    if (result.bias !== null && result.bias !== undefined) {
      assert.notDeepStrictEqual(result.bias, {
        type: 'locationBias',
        center: { lat: 0, lng: 0 },
        radiusMeters: 500
      });
      assert.notDeepStrictEqual(result.bias, {
        type: 'locationBias',
        center: { lat: 0, lng: 0 },
        radiusMeters: 1000
      });
    }
  });

  /**
   * Test: TEXTSEARCH should preserve original query with prepositions
   */
  it('should preserve original query structure including prepositions', async () => {
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'he',
      confidence: 0.8,
      reason: 'city_text',
      regionConfidence: 0.9,
      regionReason: 'explicit'
    };

    const request: SearchRequest = {
      query: 'מסעדות איטלקיות בגדרה',
      userLocation: null
    };

    const mockLLMProvider = {
      completeJSON: async () => ({
        data: {
          providerMethod: 'textSearch' as const,
          textQuery: 'מסעדות איטלקיות בגדרה', // Preserves "ב"
          region: 'IL',
          language: 'he',
          bias: null,
          reason: 'original_preserved'
        },
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        },
        model: 'gpt-4o-mini'
      }),
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-req-2',
      llmProvider: mockLLMProvider as any,
      userRegionCode: 'IL',
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'he',
      uiLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Should preserve the preposition "ב"
    assert.ok(result.textQuery.includes('בגדרה'));
    assert.notStrictEqual(result.textQuery, 'מסעדות איטלקיות גדרה'); // Should NOT remove "ב"
    assert.strictEqual(result.bias, undefined); // No bias when no userLocation
  });
});

describe('TEXTSEARCH Mapper - Location Bias Application', () => {
  /**
   * Test: userLocation path - should set locationBias from userLocation
   */
  it('should set locationBias when userLocation is present', async () => {
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'he',
      confidence: 0.9,
      reason: 'textsearch',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      regionCandidate: 'IL'
    };

    const request: SearchRequest = {
      query: 'pizza near me',
      userLocation: {
        lat: 31.7683,
        lng: 35.2137 // Jerusalem
      }
    };

    const mockLLMProvider = {
      completeJSON: async () => ({
        data: {
          providerMethod: 'textSearch' as const,
          textQuery: 'pizza',
          region: 'IL',
          language: 'en',
          reason: 'location_bias_applied'
        },
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-mini'
      }),
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-bias-1',
      llmProvider: mockLLMProvider as any,
      userLocation: request.userLocation,
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'en',
      uiLanguage: 'en',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Assertions
    assert.ok(result.bias, 'Bias should be set');
    assert.strictEqual(result.bias?.type, 'locationBias');
    assert.strictEqual(result.bias?.center.lat, 31.7683);
    assert.strictEqual(result.bias?.center.lng, 35.2137);
    assert.strictEqual(result.bias?.radiusMeters, 20000); // Default 20km
  });

  /**
   * Test: cityText path - should NOT set bias but signal it's planned
   */
  it('should not set bias when only cityText is present (will be geocoded later)', async () => {
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'he',
      confidence: 0.8,
      reason: 'city_text',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      regionCandidate: 'IL',
      cityText: 'תל אביב'
    };

    const request: SearchRequest = {
      query: 'מסעדות בתל אביב',
      userLocation: null // No user location
    };

    const mockLLMProvider = {
      completeJSON: async () => ({
        data: {
          providerMethod: 'textSearch' as const,
          textQuery: 'מסעדות בתל אביב',
          region: 'IL',
          language: 'he',
          reason: 'original_preserved'
        },
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-mini'
      }),
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-bias-2',
      llmProvider: mockLLMProvider as any,
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'he',
      uiLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Assertions
    assert.strictEqual(result.cityText, 'תל אביב', 'cityText should be preserved');
    assert.strictEqual(result.bias, undefined, 'Bias should be undefined (will be geocoded in handler)');
  });

  /**
   * Test: No location anchor - should not set bias
   */
  it('should not set bias when no location anchor is available', async () => {
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'he',
      confidence: 0.9,
      reason: 'textsearch',
      regionConfidence: 0.9,
      regionReason: 'device',
      regionCandidate: 'IL'
    };

    const request: SearchRequest = {
      query: 'best pizza',
      userLocation: null // No user location
    };

    const mockLLMProvider = {
      completeJSON: async () => ({
        data: {
          providerMethod: 'textSearch' as const,
          textQuery: 'best pizza',
          region: 'IL',
          language: 'en',
          reason: 'original_preserved'
        },
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-mini'
      }),
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-bias-3',
      llmProvider: mockLLMProvider as any,
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'en',
      uiLanguage: 'en',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Assertions
    assert.strictEqual(result.bias, undefined, 'Bias should be undefined when no location anchor');
    assert.strictEqual(result.cityText, undefined, 'cityText should not be present');
  });

  /**
   * Test: userLocation takes priority over cityText
   */
  it('should use userLocation when both userLocation and cityText are present', async () => {
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'he',
      confidence: 0.8,
      reason: 'city_text',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      regionCandidate: 'IL',
      cityText: 'חיפה'
    };

    const request: SearchRequest = {
      query: 'מסעדות בחיפה',
      userLocation: {
        lat: 32.7940,
        lng: 34.9896 // Haifa
      }
    };

    const mockLLMProvider = {
      completeJSON: async () => ({
        data: {
          providerMethod: 'textSearch' as const,
          textQuery: 'מסעדות בחיפה',
          region: 'IL',
          language: 'he',
          reason: 'location_bias_applied'
        },
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-mini'
      }),
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-bias-4',
      llmProvider: mockLLMProvider as any,
      userLocation: request.userLocation,
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'he',
      uiLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Assertions
    assert.ok(result.bias, 'Bias should be set from userLocation');
    assert.strictEqual(result.bias?.center.lat, 32.7940);
    assert.strictEqual(result.bias?.center.lng, 34.9896);
    assert.strictEqual(result.cityText, 'חיפה', 'cityText should still be preserved');
  });

  /**
   * Test: Deterministic fallback also applies location bias
   */
  it('should apply location bias in deterministic fallback when LLM fails', async () => {
    const intent: IntentResult = {
      route: 'TEXTSEARCH',
      region: 'IL',
      language: 'en',
      confidence: 0.9,
      reason: 'textsearch',
      regionConfidence: 0.9,
      regionReason: 'device',
      regionCandidate: 'IL'
    };

    const request: SearchRequest = {
      query: 'burger restaurants',
      userLocation: {
        lat: 32.0804,
        lng: 34.7807
      }
    };

    // Mock LLM failure
    const mockLLMProvider = {
      completeJSON: async () => {
        throw new Error('LLM timeout');
      },
      complete: async () => '',
      completeStream: async () => ''
    };

    const context: Route2Context = {
      requestId: 'test-bias-5',
      llmProvider: mockLLMProvider as any,
      userLocation: request.userLocation,
      startTime: Date.now()
    };

    const finalFilters: FinalSharedFilters = {
      regionCode: 'IL',
      providerLanguage: 'en',
      uiLanguage: 'en',
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    };

    const result = await executeTextSearchMapper(intent, request, context, finalFilters);

    // Assertions - fallback should still apply bias
    assert.strictEqual(result.reason, 'deterministic_fallback');
    assert.ok(result.bias, 'Bias should be set even in fallback');
    assert.strictEqual(result.bias?.center.lat, 32.0804);
    assert.strictEqual(result.bias?.center.lng, 34.7807);
  });
});
