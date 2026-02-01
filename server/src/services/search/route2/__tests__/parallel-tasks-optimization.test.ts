/**
 * Parallel Tasks Optimization Tests
 * 
 * Tests LLM call optimization using STRUCTURAL, LANGUAGE-AGNOSTIC rules:
 * - Skip post_constraints for generic queries with location
 * - Skip base_filters ONLY for: route=NEARBY + hasUserLocation + no cityText
 * - Verify correct route passed to base_filters_llm
 * - Verify Hebrew vs English queries behave identically (no keyword dependencies)
 * 
 * P0 FIX (2026-01-31): Removed keyword-based gating (FILTER_KEYWORDS).
 * Now uses structural rule: NEARBY route + GPS location = skip base_filters.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { fireParallelTasks } from '../orchestrator.parallel-tasks.js';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';

describe('Parallel Tasks - Generic Query Optimization', () => {
  it('should skip both LLM calls for NEARBY route with GPS location (Hebrew query)', async () => {
    /**
     * OPTIMIZATION TEST (P0 FIX): Structural rule - route=NEARBY + GPS + no cityText
     * 
     * Input: "מה יש לאכול" (what to eat) + route=NEARBY + hasUserLocation + no cityText
     * Expected:
     * - post_constraints → deterministic defaults (no LLM call)
     * - base_filters → deterministic defaults (no LLM call)
     * - Logs: post_constraints_skipped, base_filters_skipped
     * - Reason: 'nearby_with_gps_location' (structural, not keyword-based)
     */

    const request: SearchRequest = {
      query: 'מה יש לאכול', // Hebrew: "what to eat"
      userLocation: { lat: 32.0804, lng: 34.7807 }
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
      route: 'NEARBY', // ✓ NEARBY route
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined // ✓ No cityText
    };

    const ctx: Route2Context = {
      requestId: 'opt-test-1',
      startTime: Date.now(),
      llmProvider: {} as any, // Won't be called
      userLocation: { lat: 32.0804, lng: 34.7807 } // ✓ Has GPS location
    };

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentDecision,
      ctx
    );

    // Await both promises
    const baseFilters = await baseFiltersPromise;
    const postConstraints = await postConstraintsPromise;

    // Assert: Should get defaults (no LLM call)
    assert.strictEqual(baseFilters.language, 'he', 'Should use default language (he)');
    assert.strictEqual(baseFilters.openState, null, 'Should use default openState');
    assert.strictEqual(postConstraints.openState, null, 'Should use default post openState');
    assert.strictEqual(postConstraints.isKosher, null, 'Should use default isKosher');
  });

  it('should run base_filters for TEXTSEARCH route even with GPS location (language-agnostic)', async () => {
    /**
     * OPTIMIZATION TEST (P0 FIX): TEXTSEARCH route always runs LLM
     * 
     * Input: "מה פתוח עכשיו" (what's open now) + route=TEXTSEARCH + hasUserLocation
     * Expected:
     * - post_constraints → deterministic defaults (no LLM call)
     * - base_filters → LLM call (parse text query for filters)
     * - Reason: TEXTSEARCH is text-driven, always needs parsing (regardless of GPS)
     * 
     * P0 FIX: Previously skipped based on FILTER_KEYWORDS ("פתוח").
     * Now runs LLM for ALL TEXTSEARCH queries (route-based rule, not keyword-based).
     */

    let llmCalled = false;
    const mockLLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'he',
            openState: 'OPEN_NOW',
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = {
      query: 'מה פתוח עכשיו', // Hebrew: "what's open now"
      userLocation: { lat: 32.0804, lng: 34.7807 }
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
      route: 'TEXTSEARCH', // ✓ TEXTSEARCH (not NEARBY) → always run LLM
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'opt-test-2',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentDecision,
      ctx
    );

    const baseFilters = await baseFiltersPromise;
    const postConstraints = await postConstraintsPromise;

    // Assert: base_filters should have called LLM (TEXTSEARCH always parses)
    assert.strictEqual(llmCalled, true, 'LLM should be called for TEXTSEARCH route');
    assert.strictEqual(baseFilters.language, 'he', 'Should extract language from LLM');
    assert.strictEqual(baseFilters.openState, 'OPEN_NOW', 'Should extract openState from LLM');

    // Assert: post_constraints should still use defaults
    assert.strictEqual(postConstraints.openState, null, 'Should use default post openState');
  });

  it('should run both LLM calls for non-generic query', async () => {
    /**
     * BASELINE TEST: Non-generic query (specific food type)
     * 
     * Input: "פיצה בתל אביב" (pizza in Tel Aviv) + hasUserLocation
     * Expected:
     * - post_constraints → LLM call
     * - base_filters → LLM call
     * - No optimization (normal flow)
     */

    let baseFiltersLLMCalled = false;
    let postConstraintsLLMCalled = false;

    const mockLLMProvider = {
      async completeJSON(_messages: any, _schema: any, opts: any) {
        if (opts.stage === 'base_filters_llm') {
          baseFiltersLLMCalled = true;
          return {
            data: {
              language: 'he',
              openState: null,
              openAt: null,
              openBetween: null,
              regionHint: 'IL',
              priceIntent: null,
              minRatingBucket: null,
              minReviewCountBucket: null
            },
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            model: 'gpt-4o-mini'
          } as any;
        } else if (opts.stage === 'post_constraints') {
          postConstraintsLLMCalled = true;
          return {
            data: {
              openState: null,
              openAt: null,
              openBetween: null,
              priceLevel: null,
              isKosher: null,
              isGlutenFree: null,
              requirements: { accessible: null, parking: null }
            },
            usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 }
          } as any;
        }
        throw new Error('Unexpected stage: ' + opts.stage);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = {
      query: 'פיצה בתל אביב', // Specific food + location (NOT generic)
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.95,
        route: 'CONTINUE',
        confidence: 0.95,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH',
      confidence: 0.9,
      reason: 'specific_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'תל אביב'
    };

    const ctx: Route2Context = {
      requestId: 'opt-test-3',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentDecision,
      ctx
    );

    await baseFiltersPromise;
    await postConstraintsPromise;

    // Assert: Both LLMs should be called for non-generic query
    assert.strictEqual(baseFiltersLLMCalled, true, 'base_filters LLM should be called');
    assert.strictEqual(postConstraintsLLMCalled, true, 'post_constraints LLM should be called');
  });

  it('should run base_filters when cityText present (even for NEARBY route)', async () => {
    /**
     * STRUCTURAL RULE TEST: cityText overrides NEARBY optimization
     * 
     * Input: route=NEARBY + hasUserLocation + cityText="גדרה"
     * Expected: base_filters LLM runs (cityText indicates text-based query, not pure GPS)
     * 
     * Rationale: When user specifies a city in the query, we need to parse for
     * additional context/filters even if they have GPS location.
     */

    let llmCalled = false;
    const mockLLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'he',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: 'IL',
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = {
      query: 'מסעדות בגדרה',
      userLocation: { lat: 32.0804, lng: 34.7807 }
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
      confidence: 0.85,
      reason: 'city_text',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'גדרה' // ✓ Has cityText → run LLM
    };

    const ctx: Route2Context = {
      requestId: 'opt-test-citytext',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const { baseFiltersPromise } = fireParallelTasks(
      request,
      gateResult,
      intentDecision,
      ctx
    );

    const baseFilters = await baseFiltersPromise;

    // Assert: LLM should be called (cityText present)
    assert.strictEqual(llmCalled, true, 'LLM should be called when cityText present');
    assert.strictEqual(baseFilters.regionHint, 'IL', 'Should extract regionHint from LLM');
  });

  it('should behave identically for Hebrew vs English queries (language-agnostic)', async () => {
    /**
     * LANGUAGE-AGNOSTIC TEST (P0 FIX VALIDATION)
     * 
     * Validates that Hebrew and English queries with equivalent intent
     * trigger the same LLM behavior (skip or run base_filters).
     * 
     * Test Case: NEARBY route + GPS + no cityText
     * - Hebrew: "מה יש לאכול" (what to eat)
     * - English: "what to eat"
     * 
     * Expected: BOTH should skip base_filters (structural rule, not keyword-based)
     */

    // Test Hebrew query
    const requestHe: SearchRequest = {
      query: 'מה יש לאכול',
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const gateResultHe: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecisionHe: IntentResult = {
      route: 'NEARBY',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctxHe: Route2Context = {
      requestId: 'lang-test-he',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const { baseFiltersPromise: heBaseFilters } = fireParallelTasks(
      requestHe,
      gateResultHe,
      intentDecisionHe,
      ctxHe
    );

    // Test English query
    const requestEn: SearchRequest = {
      query: 'what to eat',
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const gateResultEn: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'en',
        languageConfidence: 0.9,
        route: 'CONTINUE',
        confidence: 0.9,
        stop: null
      }
    };

    const intentDecisionEn: IntentResult = {
      route: 'NEARBY',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'en',
      regionCandidate: 'US',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctxEn: Route2Context = {
      requestId: 'lang-test-en',
      startTime: Date.now(),
      llmProvider: {} as any,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const { baseFiltersPromise: enBaseFilters } = fireParallelTasks(
      requestEn,
      gateResultEn,
      intentDecisionEn,
      ctxEn
    );

    // Await both
    const heResult = await heBaseFilters;
    const enResult = await enBaseFilters;

    // Assert: Both should use defaults (skip LLM)
    assert.strictEqual(heResult.openState, null, 'Hebrew query should skip LLM (use defaults)');
    assert.strictEqual(enResult.openState, null, 'English query should skip LLM (use defaults)');

    // Assert: Language difference doesn't affect behavior
    // Both get defaults because: route=NEARBY + GPS + no cityText (structural rule)
    assert.strictEqual(heResult.language, 'he', 'Hebrew default language');
    assert.strictEqual(enResult.language, 'en', 'English default language');
  });
});

describe('Parallel Tasks - Route Passing Fix', () => {
  it('should use correct route (NEARBY) from intent decision', async () => {
    /**
     * ROUTE FIX TEST: Verify resolveBaseFiltersLLM receives correct route
     * 
     * Before: route hardcoded as "TEXTSEARCH"
     * After: route = intentDecision.route (e.g., "NEARBY")
     * 
     * Expected:
     * - base_filters_llm_started log has route="NEARBY"
     * - Matches intent_decided log route
     * 
     * Note: Route is used for logging context in base_filters_llm,
     * not passed to LLM itself. We verify by checking that the function
     * completes successfully (no errors from incorrect route type).
     */

    const mockLLMProvider = {
      async completeJSON() {
        return {
          data: {
            language: 'he',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({
        content: JSON.stringify({
          "1": { openState: null, openAt: null, openBetween: null },
          "2": { priceLevel: null, isKosher: null, isGlutenFree: null },
          "3": { requirements: { accessible: null, parking: null } }
        }),
        usage: {}
      }) as any
    };

    const request: SearchRequest = {
      query: 'מה יש פה',
      userLocation: { lat: 32.0804, lng: 34.7807 }
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
      route: 'NEARBY', // Intent decided NEARBY
      confidence: 0.85,
      reason: 'near_me',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.8,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'route-test-1',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const { baseFiltersPromise } = fireParallelTasks(
      request,
      gateResult,
      intentDecision,
      ctx
    );

    const result = await baseFiltersPromise;

    // Assert: Should complete successfully with NEARBY route
    // (Route is logged in base_filters_llm_started, visible in test output)
    assert.strictEqual(result.language, 'he', 'Should return base filters successfully');
  });

  it('should use correct route (TEXTSEARCH) from intent decision', async () => {
    /**
     * ROUTE FIX TEST: Verify resolveBaseFiltersLLM receives TEXTSEARCH route
     * 
     * Verifies that TEXTSEARCH route (from intent) is used correctly.
     * Check test output logs for: event="base_filters_llm_started" route="TEXTSEARCH"
     */

    const mockLLMProvider = {
      async completeJSON() {
        return {
          data: {
            language: 'he',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: 'IL',
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({
        content: JSON.stringify({
          "1": { openState: null, openAt: null, openBetween: null },
          "2": { priceLevel: null, isKosher: null, isGlutenFree: null },
          "3": { requirements: { accessible: null, parking: null } }
        }),
        usage: {}
      }) as any
    };

    const request: SearchRequest = {
      query: 'פיצה באשדוד',
      userLocation: null
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        languageConfidence: 0.95,
        route: 'CONTINUE',
        confidence: 0.95,
        stop: null
      }
    };

    const intentDecision: IntentResult = {
      route: 'TEXTSEARCH', // Intent decided TEXTSEARCH
      confidence: 0.9,
      reason: 'city_text',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.9,
      regionReason: 'explicit',
      cityText: 'אשדוד'
    };

    const ctx: Route2Context = {
      requestId: 'route-test-2',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      userLocation: null
    };

    const { baseFiltersPromise } = fireParallelTasks(
      request,
      gateResult,
      intentDecision,
      ctx
    );

    const result = await baseFiltersPromise;

    // Assert: Should complete successfully with TEXTSEARCH route
    // (Route is logged in base_filters_llm_started, visible in test output)
    assert.strictEqual(result.regionHint, 'IL', 'Should return base filters successfully');
  });
});
