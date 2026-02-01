/**
 * Post-Constraints Guard Test
 * 
 * Validates the deterministic guard that skips post_constraints LLM
 * when there are no active constraints in base_filters.
 * 
 * Goal: Never run post_constraints when all constraints are null
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { fireParallelTasks } from '../orchestrator.parallel-tasks.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';
import type { LLMProvider } from '../../../../llm/types.js';
import type { SearchRequest } from '../../types/search-request.dto.js';

/**
 * Helper: Create mock context
 */
function createMockContext(requestId: string, llmProvider: LLMProvider): Route2Context {
  return {
    requestId,
    llmProvider,
    startTime: Date.now(),
    timings: {},
    userLocation: { lat: 32.0853, lng: 34.7818 } // Tel Aviv
  } as any;
}

/**
 * Helper: Create mock gate result
 */
function createMockGateResult(foodSignal: 'YES' | 'NO' | 'MAYBE'): Gate2StageOutput {
  return {
    gate: { foodSignal }
  } as any;
}

/**
 * Helper: Create mock intent result
 */
function createMockIntentResult(route: 'NEARBY' | 'TEXTSEARCH', cityText: string | null = null): IntentResult {
  return {
    route,
    cityText,
    confidence: 0.9,
    language: 'en'
  } as any;
}

describe('Post-Constraints Guard - Skip Logic', () => {
  it('should SKIP post_constraints when all base_filters constraints are null', async () => {
    /**
     * Test: base_filters returns all nulls → post_constraints should skip
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        // Track which stage is being called
        if (opts.stage === 'post_constraints') {
          postConstraintsLLMCalled = true;
          throw new Error('post_constraints LLM should not be called when no constraints');
        }

        // base_filters stage - return all nulls
        if (opts.stage === 'base_filters_llm') {
          return {
            data: {
              language: 'auto',
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
        }

        throw new Error(`Unexpected stage: ${opts.stage}`);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'pizza', deviceRegionCode: 'IL' } as any;
    const gateResult = createMockGateResult('YES');
    const intentResult = createMockIntentResult('TEXTSEARCH', 'Tel Aviv'); // Add cityText to bypass generic optimization
    const ctx = createMockContext('guard-test-1', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    // Await both promises
    const baseFilters = await baseFiltersPromise;
    const postConstraints = await postConstraintsPromise;

    // Assert: post_constraints LLM was NOT called
    assert.strictEqual(postConstraintsLLMCalled, false, 'post_constraints LLM should not be called');

    // Assert: Returns default post_constraints
    assert.strictEqual(postConstraints.openState, null);
    assert.strictEqual(postConstraints.priceLevel, null);
    assert.strictEqual(postConstraints.isKosher, null);
    assert.strictEqual(postConstraints.isGlutenFree, null);

    // Verify base_filters had all nulls
    assert.strictEqual(baseFilters.openState, null);
    assert.strictEqual(baseFilters.priceIntent, null);
    assert.strictEqual(baseFilters.minRatingBucket, null);
    assert.strictEqual(baseFilters.minReviewCountBucket, null);
  });

  it('should RUN post_constraints when openState is active', async () => {
    /**
     * Test: base_filters returns openState="OPEN_NOW" → post_constraints should run
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        if (opts.stage === 'post_constraints') {
          postConstraintsLLMCalled = true;
          return {
            data: {
              openState: 'OPEN_NOW',
              openAt: null,
              openBetween: null,
              priceLevel: null,
              isKosher: null,
              isGlutenFree: null,
              requirements: { accessible: null, parking: null }
            },
            usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
            model: 'gpt-4o-mini'
          } as any;
        }

        if (opts.stage === 'base_filters_llm') {
          return {
            data: {
              language: 'auto',
              openState: 'OPEN_NOW', // Active constraint
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
        }

        throw new Error(`Unexpected stage: ${opts.stage}`);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'pizza open now', deviceRegionCode: 'IL' } as any;
    const gateResult = createMockGateResult('YES');
    const intentResult = createMockIntentResult('TEXTSEARCH', 'Tel Aviv'); // Add cityText to bypass generic optimization
    const ctx = createMockContext('guard-test-2', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    await baseFiltersPromise;
    await postConstraintsPromise;

    // Assert: post_constraints LLM WAS called
    assert.strictEqual(postConstraintsLLMCalled, true, 'post_constraints LLM should be called when openState is active');
  });

  it('should RUN post_constraints when priceIntent is active', async () => {
    /**
     * Test: base_filters returns priceIntent="CHEAP" → post_constraints should run
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        if (opts.stage === 'post_constraints') {
          postConstraintsLLMCalled = true;
          return {
            data: {
              openState: null,
              openAt: null,
              openBetween: null,
              priceLevel: 1, // CHEAP
              isKosher: null,
              isGlutenFree: null,
              requirements: { accessible: null, parking: null }
            },
            usage: { prompt_tokens: 110, completion_tokens: 55, total_tokens: 165 },
            model: 'gpt-4o-mini'
          } as any;
        }

        if (opts.stage === 'base_filters_llm') {
          return {
            data: {
              language: 'auto',
              openState: null,
              openAt: null,
              openBetween: null,
              regionHint: null,
              priceIntent: 'CHEAP', // Active constraint
              minRatingBucket: null,
              minReviewCountBucket: null
            },
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            model: 'gpt-4o-mini'
          } as any;
        }

        throw new Error(`Unexpected stage: ${opts.stage}`);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'cheap pizza', deviceRegionCode: 'IL' } as any;
    const gateResult = createMockGateResult('YES');
    const intentResult = createMockIntentResult('TEXTSEARCH', 'Tel Aviv'); // Add cityText to bypass generic optimization
    const ctx = createMockContext('guard-test-3', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    await baseFiltersPromise;
    await postConstraintsPromise;

    // Assert: post_constraints LLM WAS called
    assert.strictEqual(postConstraintsLLMCalled, true, 'post_constraints LLM should be called when priceIntent is active');
  });

  it('should RUN post_constraints when minRatingBucket is active', async () => {
    /**
     * Test: base_filters returns minRatingBucket="R40" → post_constraints should run
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        if (opts.stage === 'post_constraints') {
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
            usage: { prompt_tokens: 115, completion_tokens: 58, total_tokens: 173 },
            model: 'gpt-4o-mini'
          } as any;
        }

        if (opts.stage === 'base_filters_llm') {
          return {
            data: {
              language: 'auto',
              openState: null,
              openAt: null,
              openBetween: null,
              regionHint: null,
              priceIntent: null,
              minRatingBucket: 'R40', // Active constraint
              minReviewCountBucket: null
            },
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            model: 'gpt-4o-mini'
          } as any;
        }

        throw new Error(`Unexpected stage: ${opts.stage}`);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'high rated sushi', deviceRegionCode: 'IL' } as any;
    const gateResult = createMockGateResult('YES');
    const intentResult = createMockIntentResult('TEXTSEARCH', 'Tel Aviv'); // Add cityText to bypass generic optimization
    const ctx = createMockContext('guard-test-4', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    await baseFiltersPromise;
    await postConstraintsPromise;

    // Assert: post_constraints LLM WAS called
    assert.strictEqual(postConstraintsLLMCalled, true, 'post_constraints LLM should be called when minRatingBucket is active');
  });

  it('should RUN post_constraints when minReviewCountBucket is active', async () => {
    /**
     * Test: base_filters returns minReviewCountBucket="C100" → post_constraints should run
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        if (opts.stage === 'post_constraints') {
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
            usage: { prompt_tokens: 118, completion_tokens: 59, total_tokens: 177 },
            model: 'gpt-4o-mini'
          } as any;
        }

        if (opts.stage === 'base_filters_llm') {
          return {
            data: {
              language: 'auto',
              openState: null,
              openAt: null,
              openBetween: null,
              regionHint: null,
              priceIntent: null,
              minRatingBucket: null,
              minReviewCountBucket: 'C100' // Active constraint
            },
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            model: 'gpt-4o-mini'
          } as any;
        }

        throw new Error(`Unexpected stage: ${opts.stage}`);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'restaurants with many reviews', deviceRegionCode: 'IL' } as any; // "reviews" triggers base_filters
    const gateResult = createMockGateResult('YES');
    const intentResult = createMockIntentResult('TEXTSEARCH', 'Tel Aviv'); // Add cityText to bypass generic optimization
    const ctx = createMockContext('guard-test-5', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    await baseFiltersPromise;
    await postConstraintsPromise;

    // Assert: post_constraints LLM WAS called
    assert.strictEqual(postConstraintsLLMCalled, true, 'post_constraints LLM should be called when minReviewCountBucket is active');
  });

  it('should RUN post_constraints when multiple constraints are active', async () => {
    /**
     * Test: base_filters returns multiple active constraints → post_constraints should run
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        if (opts.stage === 'post_constraints') {
          postConstraintsLLMCalled = true;
          return {
            data: {
              openState: 'OPEN_NOW',
              openAt: null,
              openBetween: null,
              priceLevel: 1,
              isKosher: null,
              isGlutenFree: null,
              requirements: { accessible: null, parking: null }
            },
            usage: { prompt_tokens: 125, completion_tokens: 63, total_tokens: 188 },
            model: 'gpt-4o-mini'
          } as any;
        }

        if (opts.stage === 'base_filters_llm') {
          return {
            data: {
              language: 'auto',
              openState: 'OPEN_NOW', // Active
              openAt: null,
              openBetween: null,
              regionHint: null,
              priceIntent: 'CHEAP', // Active
              minRatingBucket: 'R40', // Active
              minReviewCountBucket: null
            },
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            model: 'gpt-4o-mini'
          } as any;
        }

        throw new Error(`Unexpected stage: ${opts.stage}`);
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'cheap pizza open now with good rating', deviceRegionCode: 'IL' } as any;
    const gateResult = createMockGateResult('YES');
    const intentResult = createMockIntentResult('TEXTSEARCH', 'Tel Aviv'); // Add cityText to bypass generic optimization
    const ctx = createMockContext('guard-test-6', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    await baseFiltersPromise;
    await postConstraintsPromise;

    // Assert: post_constraints LLM WAS called
    assert.strictEqual(postConstraintsLLMCalled, true, 'post_constraints LLM should be called when multiple constraints are active');
  });

  it('should SKIP post_constraints for generic query with location (existing optimization)', async () => {
    /**
     * Test: Generic food query with location → skip via existing optimization path
     */

    let postConstraintsLLMCalled = false;

    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts: any) {
        if (opts.stage === 'post_constraints') {
          postConstraintsLLMCalled = true;
          throw new Error('post_constraints should be skipped for generic query with location');
        }

        // base_filters is also skipped for NEARBY + GPS
        throw new Error('base_filters should also be skipped');
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const request: SearchRequest = { query: 'hamburger', deviceRegionCode: 'IL' } as any;
    const gateResult = createMockGateResult('YES'); // Generic food query
    const intentResult = createMockIntentResult('NEARBY', null); // NEARBY + no cityText
    const ctx = createMockContext('guard-test-7', mockLLMProvider);

    const { baseFiltersPromise, postConstraintsPromise } = fireParallelTasks(
      request,
      gateResult,
      intentResult,
      ctx
    );

    await baseFiltersPromise;
    const postConstraints = await postConstraintsPromise;

    // Assert: post_constraints LLM was NOT called
    assert.strictEqual(postConstraintsLLMCalled, false, 'post_constraints should be skipped for generic query');

    // Assert: Returns defaults
    assert.strictEqual(postConstraints.openState, null);
    assert.strictEqual(postConstraints.priceLevel, null);
  });
});
