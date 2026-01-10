/**
 * Phase 1: SearchCore Tests
 * Verifies that searchCore() returns core data without assistant
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SearchOrchestrator } from '../src/services/search/orchestrator/search.orchestrator.js';
import type { SearchRequest } from '../src/services/search/types/search-request.dto.js';
import type { SearchContext } from '../src/services/search/types/search.types.js';

describe('SearchOrchestrator - Phase 1 (searchCore)', () => {
  it('should have searchCore method', () => {
    // This test verifies the method exists and has correct signature
    const mockIntentService: any = { parse: async () => ({ intent: {}, confidence: 0.8 }) };
    const mockGeoResolver: any = { resolve: async () => ({ coords: { lat: 0, lng: 0 }, displayName: 'test', source: 'user' }) };
    const mockPlacesProvider: any = { search: async () => [], getName: () => 'mock' };
    const mockRankingService: any = { rank: () => [] };
    const mockSuggestionService: any = { generate: () => [] };
    const mockSessionService: any = { getOrCreate: async () => ({ id: 'test', context: {} }), update: async () => {} };

    const orchestrator = new SearchOrchestrator(
      mockIntentService,
      mockGeoResolver,
      mockPlacesProvider,
      mockRankingService,
      mockSuggestionService,
      mockSessionService,
      null
    );

    assert.strictEqual(typeof orchestrator.searchCore, 'function', 'searchCore should be a function');
  });

  it('should return CoreSearchResult without assist field', async () => {
    // Mock services with minimal implementation
    const mockIntentService: any = {
      parse: async () => ({
        intent: {
          query: 'test',
          searchMode: 'textsearch' as const,
          filters: {},
          language: 'en',
          languageContext: { uiLanguage: 'en', requestLanguage: 'en', googleLanguage: 'en' }
        },
        confidence: 0.85
      })
    };

    const mockGeoResolver: any = {
      resolve: async () => ({
        coords: { lat: 32.0, lng: 34.7 },
        displayName: 'Tel Aviv',
        source: 'user' as const
      })
    };

    const mockPlacesProvider: any = {
      search: async () => [],
      getName: () => 'mock' as const
    };

    const mockRankingService: any = {
      rank: () => []
    };

    const mockSuggestionService: any = {
      generate: () => []
    };

    const mockSessionService: any = {
      getOrCreate: async () => ({
        id: 'test-session',
        context: {}
      }),
      update: async () => {},
      get: async () => null,
      destroy: async () => {}
    };

    const orchestrator = new SearchOrchestrator(
      mockIntentService,
      mockGeoResolver,
      mockPlacesProvider,
      mockRankingService,
      mockSuggestionService,
      mockSessionService,
      null // No LLM
    );

    const request: SearchRequest = {
      query: 'pizza',
      sessionId: 'test-session'
    };

    const ctx: SearchContext = {
      requestId: 'test-req-123',
      traceId: 'test-trace',
      startTime: Date.now(),
      timings: {
        intentMs: 0,
        geocodeMs: 0,
        providerMs: 0,
        rankingMs: 0,
        assistantMs: 0,
        totalMs: 0
      }
    };

    const result = await orchestrator.searchCore(request, ctx);

    // Verify CoreSearchResult structure
    assert.ok(result.requestId, 'Should have requestId');
    assert.ok(result.sessionId, 'Should have sessionId');
    assert.ok(result.query, 'Should have query');
    assert.ok(result.results, 'Should have results array');
    assert.ok(result.chips, 'Should have chips array');
    assert.ok(result.meta, 'Should have meta');
    
    // Verify NO assist field (this is key for Phase 1)
    assert.strictEqual((result as any).assist, undefined, 'CoreSearchResult should NOT have assist field');
    assert.strictEqual((result as any).proposedActions, undefined, 'CoreSearchResult should NOT have proposedActions field');

    // Verify meta has core timings
    assert.ok(result.meta.timings, 'Meta should have timings');
    assert.strictEqual(typeof result.meta.timings.intentMs, 'number', 'Should have intentMs timing');
    assert.strictEqual(typeof result.meta.timings.providerMs, 'number', 'Should have providerMs timing');
  });

  it('should log search_started and search_core_completed events', async () => {
    // This is a smoke test to verify logging structure
    // Full logging verification would require log capture, which is beyond Phase 1 scope
    
    const mockIntentService: any = {
      parse: async () => ({
        intent: {
          query: 'test',
          searchMode: 'textsearch' as const,
          filters: {},
          language: 'en',
          languageContext: { uiLanguage: 'en', requestLanguage: 'en', googleLanguage: 'en' }
        },
        confidence: 0.8
      })
    };

    const mockGeoResolver: any = {
      resolve: async () => ({ coords: { lat: 0, lng: 0 }, displayName: 'test', source: 'user' as const })
    };

    const mockPlacesProvider: any = {
      search: async () => [],
      getName: () => 'mock' as const
    };

    const mockRankingService: any = { rank: () => [] };
    const mockSuggestionService: any = { generate: () => [] };
    const mockSessionService: any = {
      getOrCreate: async () => ({ id: 'test', context: {} }),
      update: async () => {}
    };

    const orchestrator = new SearchOrchestrator(
      mockIntentService,
      mockGeoResolver,
      mockPlacesProvider,
      mockRankingService,
      mockSuggestionService,
      mockSessionService,
      null
    );

    const request: SearchRequest = { query: 'test' };
    const ctx: SearchContext = {
      requestId: 'test-123',
      startTime: Date.now(),
      timings: {
        intentMs: 0,
        geocodeMs: 0,
        providerMs: 0,
        rankingMs: 0,
        assistantMs: 0,
        totalMs: 0
      }
    };

    // Should not throw
    const result = await orchestrator.searchCore(request, ctx);
    
    assert.ok(result, 'Should return a result');
  });
});
