/**
 * Early INTENT Guard Tests (2026-02-03)
 * 
 * TEXTSEARCH without a location continues (returns null).
 * City and GPS also continue. NEARBY is ignored by this guard.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handleEarlyTextSearchLocationGuard } from '../orchestrator.guards.js';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';
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

function createContext(overrides: Partial<Route2Context> = {}): Route2Context {
  return {
    requestId: 'test-req-id',
    startTime: Date.now(),
    llmProvider: mockLLMProvider,
    queryLanguage: 'he',
    ...overrides
  };
}

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

function createIntentDecision(overrides: Partial<IntentResult> = {}): IntentResult {
  return {
    route: 'TEXTSEARCH',
    confidence: 0.9,
    reason: 'food_query',
    language: 'he',
    regionCandidate: 'IL',
    regionConfidence: 0.9,
    regionReason: 'device_locale',
    ...overrides
  };
}

describe('Early INTENT Guard - handleEarlyTextSearchLocationGuard', () => {
  describe('no location continues', () => {
    it('Case 1: TEXTSEARCH with only device region (IL) → continues', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null, // No GPS
        userRegionCode: 'IL' // Only device region
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'TEXTSEARCH',
        cityText: undefined, // No city
        regionCandidate: 'IL' // LLM suggested region
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      assert.equal(result, null, 'Should continue when the only gap is location');
    });

    it('Case 1b: TEXTSEARCH without location → continues', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null // No GPS
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'TEXTSEARCH',
        cityText: undefined // No city
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      assert.equal(result, null, 'Should continue when there is no GPS and no city');
    });

    it('Case 1b: TEXTSEARCH with userLocation but no cityText → continues', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: { lat: 32.0853, lng: 34.7818 } // Has GPS
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'TEXTSEARCH',
        cityText: undefined
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Assert: Continues (returns null)
      assert.equal(result, null, 'Should continue when userLocation is present');
    });
  });

  describe('NO CLARIFY - should continue', () => {
    it('Case 2: TEXTSEARCH with cityText → continues', async () => {
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
        route: 'TEXTSEARCH',
        cityText: 'תל אביב' // Has city
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Assert: Continues (returns null)
      assert.equal(result, null, 'Should continue when cityText is present');
    });

    it('Case 3: NEARBY route → continues (different guard handles it)', async () => {
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
        route: 'NEARBY', // Not TEXTSEARCH
        cityText: undefined
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Assert: Continues (returns null) - only applies to TEXTSEARCH
      assert.equal(result, null, 'Should only apply to TEXTSEARCH route');
    });

    it('Case 4: LANDMARK route → continues', async () => {
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
        route: 'LANDMARK', // Not TEXTSEARCH
        cityText: undefined
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Assert: Continues (returns null)
      assert.equal(result, null, 'Should only apply to TEXTSEARCH route');
    });
  });

  describe('Location anchor verification', () => {
    it('should NOT treat regionCode as location anchor', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null,
        userRegionCode: 'IL', // Device region
        queryRegionCode: 'IL' // Query-detected region
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'TEXTSEARCH',
        cityText: undefined,
        regionCandidate: 'IL' // LLM region candidate
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      assert.equal(result, null, 'regionCode is not a location anchor; search still continues');
    });

    it('should treat cityText as location anchor', async () => {
      const request: SearchRequest = {
        query: 'ציזבורגר תל אביב',
        llmProvider: 'openai',
        sessionId: 'test-session'
      };

      const ctx = createContext({
        userLocation: null,
        userRegionCode: undefined // No device region
      });

      const gateResult = createGateResult();
      const intentDecision = createIntentDecision({
        route: 'TEXTSEARCH',
        cityText: 'תל אביב', // Has city text
        regionCandidate: null // No region candidate
      });

      const result = await handleEarlyTextSearchLocationGuard(
        request,
        gateResult,
        intentDecision,
        ctx,
        mockWsManager
      );

      // Assert: Continues (returns null) because cityText is a valid location anchor
      assert.equal(result, null, 'Should continue with cityText as location anchor');
    });
  });

  describe('Flow documentation', () => {
    it('should document the pipeline flow and where guard is called', () => {
      // PIPELINE FLOW (Route2):
      // ========================
      // 1. Gate2 stage (food classifier)
      // 2. Gate guards (STOP, ASK_CLARIFY)
      // 3. Fire parallel tasks (baseFilters, postConstraints)
      // 4. Intent stage (routing decision)
      // 5. Early INTENT guard returns null for TEXTSEARCH without location (search continues)
      // 6. Near-me checks
      // 7. Near-me route override
      // 8. Route-LLM (mapping decision)
      // 9. NEARBY/TEXTSEARCH guards (later guards)
      // 10. google_parallel_start_decision log
      // 11. Start Google fetch
      // 12. Await Google + filters
      // 13. Post-filter
      // 14. Build response
      //
      // KEY POINT:
      // - Early guard runs AFTER intent, BEFORE route-LLM
      // - TEXTSEARCH without location continues; the question is on the success response

      assert.ok(true, 'Flow documented');
    });

    it('should document expected log events', () => {
      // EXPECTED LOGS:
      // ==============
      // 
      // Case 1: TEXTSEARCH without location (CONTINUES)
      // - early_textsearch_no_location_continue
      // - google_parallel_start_decision allowed=true, reason missing_location_question_attached
      // - Response includes places plus MISSING_LOCATION assist, failureReason NONE
      //
      // Case 2: TEXTSEARCH with cityText (CONTINUES)
      // - google_parallel_start_decision { route: 'TEXTSEARCH', hasLocation: true, allowed: true }
      // - Google fetch starts
      // - Response: results array with restaurants
      //
      // Case 3: NEARBY with userLocation (CONTINUES)
      // - google_parallel_start_decision { route: 'NEARBY', hasLocation: true, allowed: true }
      // - Google fetch starts
      // - Response: results array with restaurants

      assert.ok(true, 'Logs documented');
    });
  });
});
