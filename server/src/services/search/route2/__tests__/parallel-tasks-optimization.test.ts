/**
 * Parallel Tasks Optimization Tests
 * 
 * Tests LLM call optimization for generic queries with location:
 * - Skip post_constraints for generic queries with location
 * - Skip base_filters for generic queries without filter keywords
 * - Verify correct route passed to base_filters_llm
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { fireParallelTasks } from '../orchestrator.parallel-tasks.js';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';

describe('Parallel Tasks - Generic Query Optimization', () => {
  it('should skip both LLM calls for generic query with location (no filter keywords)', async () => {
    /**
     * OPTIMIZATION TEST: Generic query + location + no filter keywords
     * 
     * Input: "מה יש לאכול" (what to eat) + hasUserLocation
     * Expected:
     * - post_constraints → deterministic defaults (no LLM call)
     * - base_filters → deterministic defaults (no LLM call)
     * - Logs: post_constraints_skipped, base_filters_skipped
     */

    const request: SearchRequest = {
      query: 'מה יש לאכול', // Generic, no filter keywords
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        route: 'CONTINUE',
        confidence: 0.9
      }
    };

    const intentDecision: IntentResult = {
      route: 'NEARBY',
      confidence: 0.8,
      reason: 'generic_food',
      language: 'he',
      regionCandidate: 'IL',
      regionConfidence: 0.7,
      regionReason: 'device',
      cityText: undefined
    };

    const ctx: Route2Context = {
      requestId: 'opt-test-1',
      startTime: Date.now(),
      llmProvider: {} as any, // Won't be called
      userLocation: { lat: 32.0804, lng: 34.7807 }
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

  it('should run base_filters for generic query with filter keywords ("פתוח")', async () => {
    /**
     * OPTIMIZATION TEST: Generic query + location + filter keyword "פתוח"
     * 
     * Input: "מה פתוח עכשיו" (what's open now) + hasUserLocation
     * Expected:
     * - post_constraints → deterministic defaults (no LLM call)
     * - base_filters → LLM call (extract openState=OPEN_NOW)
     * - Logs: post_constraints_skipped, base_filters_llm_started
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
      query: 'מה פתוח עכשיו', // Generic BUT has "פתוח" filter keyword
      userLocation: { lat: 32.0804, lng: 34.7807 }
    };

    const gateResult: Gate2StageOutput = {
      gate: {
        foodSignal: 'YES',
        language: 'he',
        route: 'CONTINUE',
        confidence: 0.9
      }
    };

    const intentDecision: IntentResult = {
      route: 'NEARBY',
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

    // Assert: base_filters should have called LLM and extracted openState
    assert.strictEqual(llmCalled, true, 'LLM should be called for filter keyword');
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
        route: 'CONTINUE',
        confidence: 0.95
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
        route: 'CONTINUE',
        confidence: 0.9
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
        route: 'CONTINUE',
        confidence: 0.95
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
