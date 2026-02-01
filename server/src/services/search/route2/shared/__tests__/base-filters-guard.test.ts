/**
 * Base Filters Guard Test
 * 
 * Validates the deterministic guard that skips base_filters_llm
 * when there are no constraints to infer.
 * 
 * Goal: Avoid unnecessary LLM calls for generic queries
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { resolveBaseFiltersLLM } from '../base-filters-llm.js';
import type { LLMProvider } from '../../../../../llm/types.js';

describe('Base Filters Guard - Skip Logic', () => {
  it('should SKIP LLM for generic query without constraints', async () => {
    /**
     * Query: "pizza" (no time, price, rating, or region constraints)
     * Expected: Skip LLM, return defaults
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        throw new Error('LLM should not be called for generic query');
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'pizza',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-1'
    });

    // Assert: LLM was NOT called
    assert.strictEqual(llmCalled, false, 'LLM should not be called for generic query');

    // Assert: Returns default filters
    assert.strictEqual(result.language, 'auto');
    assert.strictEqual(result.openState, null);
    assert.strictEqual(result.openAt, null);
    assert.strictEqual(result.openBetween, null);
    assert.strictEqual(result.regionHint, null);
    assert.strictEqual(result.priceIntent, null);
    assert.strictEqual(result.minRatingBucket, null);
    assert.strictEqual(result.minReviewCountBucket, null);
  });

  it('should SKIP LLM for generic Hebrew query', async () => {
    /**
     * Query: "המבורגר" (just food, no constraints)
     * Expected: Skip LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        throw new Error('LLM should not be called');
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'המבורגר',
      route: 'NEARBY' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-2'
    });

    assert.strictEqual(llmCalled, false);
    assert.strictEqual(result.openState, null);
  });

  it('should RUN LLM for query with time constraint (Hebrew)', async () => {
    /**
     * Query: "פיצה פתוח עכשיו" (has "open now" constraint)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
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

    const result = await resolveBaseFiltersLLM({
      query: 'פיצה פתוח עכשיו',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-3'
    });

    // Assert: LLM WAS called
    assert.strictEqual(llmCalled, true, 'LLM should be called for time-constrained query');
    assert.strictEqual(result.openState, 'OPEN_NOW');
  });

  it('should RUN LLM for query with time constraint (English)', async () => {
    /**
     * Query: "pizza open now" (has time constraint)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'en',
            openState: 'OPEN_NOW',
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'pizza open now',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-4'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.openState, 'OPEN_NOW');
  });

  it('should RUN LLM for query with price constraint (Hebrew)', async () => {
    /**
     * Query: "המבורגר זול" (has price constraint)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'he',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: 'CHEAP',
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 90, completion_tokens: 45, total_tokens: 135 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'המבורגר זול',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-5'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.priceIntent, 'CHEAP');
  });

  it('should RUN LLM for query with price constraint (English)', async () => {
    /**
     * Query: "cheap pizza" (has price constraint)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'en',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: 'CHEAP',
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 85, completion_tokens: 42, total_tokens: 127 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'cheap pizza',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-6'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.priceIntent, 'CHEAP');
  });

  it('should RUN LLM for query with rating constraint (Hebrew)', async () => {
    /**
     * Query: "פיצה עם דירוג גבוה" (has rating constraint)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'he',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: null,
            minRatingBucket: 'R40',
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 95, completion_tokens: 48, total_tokens: 143 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'פיצה עם דירוג גבוה',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-7'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.minRatingBucket, 'R40');
  });

  it('should RUN LLM for query with rating constraint (English)', async () => {
    /**
     * Query: "best rated sushi" (has rating constraint)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'en',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: null,
            minRatingBucket: 'R45',
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 88, completion_tokens: 44, total_tokens: 132 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'best rated sushi',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-8'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.minRatingBucket, 'R45');
  });

  it('should RUN LLM for query with region constraint', async () => {
    /**
     * Query: "pizza in Italy" (has explicit region)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'en',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: 'IT',
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 92, completion_tokens: 46, total_tokens: 138 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'pizza in Italy',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-9'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.regionHint, 'IT');
  });

  it('should RUN LLM for query with multiple constraints', async () => {
    /**
     * Query: "cheap pizza open now" (has both price and time constraints)
     * Expected: Run LLM
     */

    let llmCalled = false;
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        llmCalled = true;
        return {
          data: {
            language: 'en',
            openState: 'OPEN_NOW',
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: 'CHEAP',
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 98, completion_tokens: 49, total_tokens: 147 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'cheap pizza open now',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'guard-test-10'
    });

    assert.strictEqual(llmCalled, true);
    assert.strictEqual(result.openState, 'OPEN_NOW');
    assert.strictEqual(result.priceIntent, 'CHEAP');
  });
});
