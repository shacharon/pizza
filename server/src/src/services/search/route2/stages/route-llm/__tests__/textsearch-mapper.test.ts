/**
 * Unit tests for TEXTSEARCH mapper - Bias cleanup regression tests
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { executeTextSearchMapper } from '../textsearch.mapper.js';
import type { IntentResult } from '../../../types.js';
import type { SearchRequest } from '../../../../types/search-request.dto.js';
import type { Route2Context } from '../../../types.js';

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

    // Execute mapper
    const result = await executeTextSearchMapper(intent, request, context);

    // Assertions
    assert.strictEqual(result.providerMethod, 'textSearch');
    assert.strictEqual(result.textQuery, 'מסעדות איטלקיות בגדרה');
    
    // CRITICAL: bias should be null, NOT a dummy object with {lat:0, lng:0}
    assert.strictEqual(result.bias, null);
    
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

    const result = await executeTextSearchMapper(intent, request, context);

    // Should preserve the preposition "ב"
    assert.ok(result.textQuery.includes('בגדרה'));
    assert.notStrictEqual(result.textQuery, 'מסעדות איטלקיות גדרה'); // Should NOT remove "ב"
    assert.strictEqual(result.bias, null);
  });
});
