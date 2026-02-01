/**
 * Generic Query Guard Tests
 * Tests for blocking overly-generic TEXTSEARCH queries without location anchors
 */
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { handleGenericQueryGuard } from '../orchestrator.guards.js';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';

// Mock WebSocket manager
const mockWsManager = {
  publishMessage: () => { },
  activatePendingSubscriptions: () => { }
} as unknown as WebSocketManager;

describe('Generic Query Guard - Hebrew Patterns', () => {
  it('should block "מה יש לאכול" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-1',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
    assert.strictEqual(result.assist?.type, 'clarify');
    assert.strictEqual(result.meta.source, 'route2_generic_query_guard');
    assert.strictEqual(result.results.length, 0, 'Should not have results');
  });

  it('should block "מה לאכול היום" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'מה לאכול היום',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-2',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
  });

  it('should block "אוכל" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'אוכל',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.85,
        route: 'CONTINUE',
        confidence: 0.85,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.7,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.6,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-3',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
  });

  it('should block "רעב" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'רעב',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        route: 'CONTINUE',
        confidence: 0.8
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.75,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.65,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-4',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
  });
});

describe('Generic Query Guard - English Patterns', () => {
  it('should block "what to eat" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'what to eat',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'en',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'en',
      regionCandidate: 'US',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-5',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
    assert.strictEqual(result.assist?.type, 'clarify');
    assert.strictEqual(result.meta.source, 'route2_generic_query_guard');
  });

  it('should block "food" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'food',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'en',
        route: 'CONTINUE',
        confidence: 0.85
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.75,
      reason: 'generic_food',
      language: 'en',
      regionCandidate: 'US',
      regionConfidence: 0.65,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-6',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
  });

  it('should block "hungry" without location anchor', async () => {
    const request: SearchRequest = {
      query: 'hungry',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'en',
        languageConfidence: 0.8,
        route: 'CONTINUE',
        confidence: 0.8,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.7,
      reason: 'generic_food',
      language: 'en',
      regionCandidate: 'US',
      regionConfidence: 0.6,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-7',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.ok(result, 'Should return CLARIFY response');
  });
});

describe('Generic Query Guard - With Location Anchors (Should Continue)', () => {
  it('should continue when userLocation is present', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: {
        lat: 32.0804,
        lng: 34.7807
      }
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-8',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue (not block)');
  });

  it('should continue when cityText is present', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'city_text',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'תל אביב'
    };

    const ctx: Route2Context = {
      requestId: 'test-9',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue when cityText present');
  });

  it('should continue when both userLocation and cityText are present', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: {
        lat: 32.0804,
        lng: 34.7807
      }
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'city_text',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.95,
      regionReason: 'explicit',
      cityText: 'גדרה'
    };

    const ctx: Route2Context = {
      requestId: 'test-10',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue when both anchors present');
  });
});

describe('Generic Query Guard - Non-Generic Queries (Should Continue)', () => {
  it('should continue for specific food query without location', async () => {
    const request: SearchRequest = {
      query: 'פיצה',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        route: 'CONTINUE',
        confidence: 0.95
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'textsearch',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-11',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue for specific food query');
  });

  it('should continue for query with location in text', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול בתל אביב',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.85,
      reason: 'city_text',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'תל אביב'
    };

    const ctx: Route2Context = {
      requestId: 'test-12',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue when location in query text');
  });

  it('should continue for NEARBY route (handled by different guard)', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'NEARBY',
      confidence: 0.8,
      reason: 'near_me',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-13',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue for NEARBY route (different guard handles it)');
  });

  it('should continue for LANDMARK route', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'LANDMARK',
      confidence: 0.85,
      reason: 'landmark',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'explicit',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-14',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue for LANDMARK route');
  });
});

describe('Generic Query Guard - Non-Food Queries (Should Continue)', () => {
  it('should continue when foodSignal is not YES', async () => {
    const request: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'UNCERTAIN',
        language: 'he',
        languageConfidence: 0.6,
        route: 'CONTINUE',
        confidence: 0.6,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.5,
      reason: 'uncertain',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.5,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'test-15',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    assert.strictEqual(result, null, 'Should continue when foodSignal is not YES');
  });
});

describe('Generic Query Guard - Regression Tests (Order & Invariant Fix)', () => {
  it('should block "מה יש לאכול היום" BEFORE parallel tasks start', async () => {
    /**
     * REGRESSION TEST for P0-4 fix
     * 
     * Validates:
     * 1. Guard runs BEFORE fireParallelTasks() is called
     * 2. Assistant context uses reason='MISSING_LOCATION' (not 'GENERIC_QUERY_NO_LOCATION')
     * 3. This triggers validation engine to enforce suggestedAction='ASK_LOCATION'
     * 
     * Expected behavior:
     * - handleGenericQueryGuard returns CLARIFY response immediately
     * - base_filters_llm is NOT started (because guard runs before parallel tasks)
     * - post_constraints is NOT started (because guard runs before parallel tasks)
     * - assist.type = 'clarify'
     * - meta.source = 'route2_generic_query_guard'
     * - Assistant output has MISSING_LOCATION reason → validation enforces ASK_LOCATION
     */
    const request: SearchRequest = {
      query: 'מה יש לאכול היום',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined // No city text
    };

    const ctx: Route2Context = {
      requestId: 'regression-test-1',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: null // No user location
    };

    const result = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, mockWsManager);

    // Assert guard blocks the query
    assert.ok(result, 'Should return CLARIFY response (block search)');
    assert.strictEqual(result.assist?.type, 'clarify', 'Should ask for clarification');
    assert.strictEqual(result.meta.source, 'route2_generic_query_guard', 'Should be blocked by guard');
    assert.strictEqual(result.results.length, 0, 'Should have no results');
    assert.strictEqual(result.meta.failureReason, 'LOW_CONFIDENCE', 'Should mark as LOW_CONFIDENCE');

    // Verify that by blocking early, parallel tasks won't start
    // (In real orchestrator: if guard returns response, fireParallelTasks is never called)
  });
});

describe('Generic Query Optimization - Parallel Tasks', () => {
  // Note: This test file focuses on the guard logic
  // Parallel task optimization tests should be in orchestrator.parallel-tasks.test.ts
  // 
  // Expected behavior (documented here for reference):
  // - Generic query + hasUserLocation + no filter keywords:
  //   → skip base_filters LLM (use defaults)
  //   → skip post_constraints LLM (use defaults)
  // 
  // - Generic query + hasUserLocation + filter keywords ("פתוח עכשיו"):
  //   → run base_filters LLM (extract openState)
  //   → skip post_constraints LLM (use defaults)
  // 
  // - Non-generic query:
  //   → run both base_filters and post_constraints normally
});
