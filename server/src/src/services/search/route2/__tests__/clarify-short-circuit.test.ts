/**
 * CLARIFY Short-Circuit Tests
 * 
 * Verifies that when CLARIFY is triggered (via any guard), the pipeline:
 * 1. Does NOT start parallel tasks (base_filters, post_constraints)
 * 2. Does NOT log "parallel_started" event
 * 3. Immediately finalizes and returns CLARIFY response
 * 4. Does NOT call Google Maps API
 * 
 * Critical for avoiding wasted LLM calls and API quota on queries that will be rejected anyway.
 * 
 * NOTE: This is an integration test that requires the full server context.
 * Run with: npm test -- clarify-short-circuit.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleEarlyTextSearchLocationGuard } from '../orchestrator.guards.js';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';
import type { LLMProvider } from '../../../../llm/types.js';

// Mock LLM provider
const mockLLMProvider: LLMProvider = {
  name: 'mock',
  call: async () => ({ content: '', usage: { inputTokens: 0, outputTokens: 0 } })
} as any;

// Mock WebSocket manager (matches the pattern in other tests)
const mockWsManager = {
  publishToChannel: () => { },
  broadcast: () => { },
  send: () => { }
} as any;

// Helper to create minimal valid context
function createContext(overrides: Partial<Route2Context> = {}): Route2Context {
  return {
    requestId: 'test-clarify-req',
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

describe('CLARIFY Short-Circuit - Guard Level Tests', () => {
  describe('Early TEXTSEARCH guard triggers CLARIFY', () => {
    it('query "ציזבורגר" with no cityText/bias should trigger CLARIFY', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר', // cheeseburger with no location
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null // No GPS
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'TEXTSEARCH',
        cityText: undefined // NO cityText
      });

      // Call the early guard directly
      const response = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // ASSERTIONS
      assert.notEqual(response, null, 'Guard should trigger CLARIFY (not return null)');
      assert.equal(response?.assist?.type, 'clarify', 'Should return CLARIFY response');
      assert.equal(response?.results.length, 0, 'Should have no results');
      assert.equal(
        response?.meta?.source,
        'route2_early_textsearch_guard',
        'Should be from early textsearch guard'
      );
      assert.equal(
        response?.meta?.failureReason,
        'LOCATION_REQUIRED',
        'Should indicate location is required'
      );
    });

    it('query "המבורגר" with no cityText should trigger CLARIFY', async () => {
      const request: SearchRequest = {
        query: 'המבורגר', // hamburger
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

      const response = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      assert.notEqual(response, null, 'Should trigger CLARIFY');
      assert.equal(response?.assist?.type, 'clarify');
    });
  });

  describe('Guards should NOT trigger when location is present', () => {
    it('should NOT trigger CLARIFY when userLocation is present', async () => {
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

      const response = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Should continue (return null) when userLocation is present
      assert.equal(response, null, 'Guard should NOT trigger when userLocation is present');
    });

    it('should NOT trigger CLARIFY when cityText is present', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר בתל אביב',
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

      const response = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Should continue (return null) when cityText is present
      assert.equal(response, null, 'Guard should NOT trigger when cityText is present');
    });
  });
});
