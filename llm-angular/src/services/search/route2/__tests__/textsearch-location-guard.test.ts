/**
 * Text Search Location Guard Tests
 * 
 * Verifies that text search queries without location anchors trigger CLARIFY
 * instead of making country-wide Google searches.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handleTextSearchMissingLocationGuard } from '../orchestrator.guards.js';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';
import type { TextSearchMapping } from '../stages/route-llm/schemas.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import type { LLMProvider } from '../../../../llm/types.js';

// Mock LLM provider
const mockLLMProvider: LLMProvider = {
  name: 'mock',
  call: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } })
} as any;

// Mock WebSocket manager
const mockWsManager = {
  broadcast: mock.fn(),
  send: mock.fn()
} as any as WebSocketManager;

// Helper to create minimal valid context
function createContext(overrides: Partial<Route2Context> = {}): Route2Context {
  return {
    requestId: 'test-req-id',
    startTime: Date.now(),
    llmProvider: mockLLMProvider,
    queryLanguage: 'he',
    ...overrides
  };
}

// Helper to create minimal gate result
function createGateResult(overrides: Partial<Gate2StageOutput> = {}): Gate2StageOutput {
  return {
    gate: {
      foodSignal: 'YES',
      language: 'he',
      route: 'CONTINUE',
      confidence: 0.9
    },
    ...overrides
  };
}

// Helper to create minimal intent decision
function createIntentDecision(overrides: Partial<IntentResult> = {}): IntentResult {
  return {
    route: 'TEXTSEARCH',
    confidence: 0.9,
    reason: 'explicit_food_query',
    language: 'he',
    regionCandidate: 'IL',
    regionConfidence: 0.9,
    regionReason: 'device_locale',
    ...overrides
  };
}

describe('handleTextSearchMissingLocationGuard', () => {
  describe('CLARIFY triggers', () => {
    it('A) should trigger CLARIFY for textSearch with no location anchors', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: undefined
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר',
        region: 'IL',
        language: 'he',
        reason: 'food_query_no_location',
        bias: undefined,
        cityText: undefined
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should return CLARIFY response
      assert.notEqual(result, null, 'Guard should trigger CLARIFY');
      assert.equal(result?.assist.type, 'clarify');
      assert.equal(result?.meta.source, 'route2_textsearch_location_clarify');
      assert.equal(result?.meta.failureReason, 'LOCATION_REQUIRED');
      assert.equal(result?.results.length, 0);
    });
  });

  describe('NO CLARIFY - should continue', () => {
    it('B) should continue for textSearch with cityText', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר תל אביב',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: 'תל אביב'
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר תל אביב',
        region: 'IL',
        language: 'he',
        reason: 'food_query_with_city',
        cityText: 'תל אביב'
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (return null)
      assert.equal(result, null, 'Guard should not trigger when cityText is present');
    });

    it('C) should continue for near-me query without GPS (separate guard handles it)', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר לידי',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: undefined
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר',
        region: 'IL',
        language: 'he',
        reason: 'near_me_query',
        bias: undefined,
        cityText: undefined
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (return null) - near-me guard will handle this
      assert.equal(result, null, 'Guard should not trigger for near-me patterns');
    });

    it('D) should continue when userLocation is present', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: {
          lat: 32.0853,
          lng: 34.7818
        }
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: undefined
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר',
        region: 'IL',
        language: 'he',
        reason: 'food_query_with_gps',
        bias: undefined,
        cityText: undefined
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (return null)
      assert.equal(result, null, 'Guard should not trigger when userLocation is present');
    });

    it('should continue when locationBias is already prepared', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: undefined
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר',
        region: 'IL',
        language: 'he',
        reason: 'food_query_with_bias',
        bias: {
          type: 'locationBias',
          center: { lat: 32.0853, lng: 34.7818 },
          radiusMeters: 20000
        }
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (return null)
      assert.equal(result, null, 'Guard should not trigger when bias is present');
    });

    it('should continue for nearbySearch method', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: {
          lat: 32.0853,
          lng: 34.7818
        }
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision();

      const mapping = {
        providerMethod: 'nearbySearch' as const,
        location: { lat: 32.0853, lng: 34.7818 },
        radiusMeters: 5000,
        keyword: 'ציזבורגר',
        region: 'IL',
        language: 'he' as const,
        reason: 'nearby_query'
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (return null) - only applies to textSearch
      assert.equal(result, null, 'Guard should only apply to textSearch method');
    });

    it('should continue for landmarkPlan method', async () => {
      const request: SearchRequest = {
        query: 'פיצה ליד הכנסת',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'LANDMARK'
      });

      const mapping = {
        providerMethod: 'landmarkPlan' as const,
        geocodeQuery: 'הכנסת, ירושלים',
        afterGeocode: 'nearbySearch' as const,
        radiusMeters: 5000,
        keyword: 'פיצה',
        region: 'IL',
        language: 'he' as const,
        reason: 'landmark_query'
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (return null) - only applies to textSearch
      assert.equal(result, null, 'Guard should only apply to textSearch method');
    });
  });

  describe('Edge cases', () => {
    it('should trigger CLARIFY when cityText is empty string', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: '' // Empty string should be treated as no city
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר',
        region: 'IL',
        language: 'he',
        reason: 'food_query_no_location',
        cityText: '' // Empty string
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should trigger CLARIFY (empty string is falsy)
      assert.notEqual(result, null, 'Guard should trigger for empty cityText');
      assert.equal(result?.assist.type, 'clarify');
    });

    it('should continue when cityText is in intentDecision but not in mapping', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר תל אביב',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        cityText: 'תל אביב'
      });

      const mapping: TextSearchMapping = {
        providerMethod: 'textSearch',
        textQuery: 'מסעדות ציזבורגר תל אביב',
        region: 'IL',
        language: 'he',
        reason: 'food_query_with_city',
        cityText: undefined // Not in mapping, but in intentDecision
      };

      const result = await handleTextSearchMissingLocationGuard(
        request,
        gateResult,
        intentDecision,
        mapping,
        ctx,
        mockWsManager
      );

      // Should continue (cityText from intentDecision is checked)
      assert.equal(result, null, 'Guard should check cityText from both mapping and intentDecision');
    });
  });
});
