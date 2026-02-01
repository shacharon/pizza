/**
 * Base Filters LLM Timeout Regression Test
 * 
 * Validates timeout reliability fix:
 * - Previously: 2000ms timeout caused abort_timeout on slow calls
 * - After fix: 3200ms timeout handles slow calls gracefully
 * 
 * Test simulates LLM call taking ~2100ms and verifies success (no fallback)
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { resolveBaseFiltersLLM } from '../base-filters-llm.js';
import type { LLMProvider } from '../../../../../llm/types.js';
import type { PreGoogleBaseFilters } from '../shared-filters.types.js';

describe('Base Filters LLM - Timeout Reliability', () => {
  it('should succeed with ~2100ms LLM call (no timeout)', async () => {
    /**
     * REGRESSION TEST for base_filters timeout fix
     * 
     * Before: baseFilters timeout = 2000ms → abort_timeout on 2100ms call
     * After:  baseFilters timeout = 3200ms → succeeds on 2100ms call
     * 
     * Validates:
     * - LLM call taking 2100ms completes successfully
     * - No fallback to default filters
     * - Correct filters returned from LLM
     */

    // Mock LLM provider that simulates 2100ms response time
    const mockLLMProvider: LLMProvider = {
      async completeJSON(messages, schema, opts) {
        // Simulate slow LLM call (2100ms)
        await new Promise(resolve => setTimeout(resolve, 2100));

        // Return valid base filters response
        return {
          data: {
            language: 'he',
            openState: 'OPEN_NOW',
            openAt: null,
            openBetween: null,
            regionHint: 'IL',
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
          },
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150
          },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    // Call resolveBaseFiltersLLM with slow mock provider
    const result = await resolveBaseFiltersLLM({
      query: 'מסעדות פתוחות עכשיו',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'timeout-test-1'
    });

    // Assert: Should succeed (no fallback to defaults)
    // NOTE: language is always 'auto' (ignored from LLM, comes from upstream only)
    assert.strictEqual(result.language, 'auto', 'Language always "auto" - comes from upstream only');
    assert.strictEqual(result.openState, 'OPEN_NOW', 'Should return LLM openState (not fallback null)');
    assert.strictEqual(result.regionHint, 'IL', 'Should return LLM regionHint (not fallback null)');

    // Verify we didn't fall back to default filters
    // Success is indicated by non-null openState and regionHint (language is always 'auto')
    assert.notStrictEqual(result.openState, null, 'Should NOT fall back to default openState');
  });

  it('should fall back gracefully on actual timeout (>3200ms)', async () => {
    /**
     * Validates that actual timeouts (>3200ms) still fall back gracefully
     * This ensures we didn't break the fallback mechanism
     */

    // Mock LLM provider that times out (4000ms, exceeds 3200ms limit)
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        await new Promise(resolve => setTimeout(resolve, 4000));
        throw new Error('timeout: Request exceeded 3200ms');
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    // Call resolveBaseFiltersLLM with timeout mock
    const result = await resolveBaseFiltersLLM({
      query: 'test query',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'timeout-test-2'
    });

    // Assert: Should fall back to defaults
    assert.strictEqual(result.language, 'auto', 'Should fall back to default language');
    assert.strictEqual(result.openState, null, 'Should fall back to default openState');
    assert.strictEqual(result.regionHint, null, 'Should fall back to default regionHint');
  });

  it('should succeed with fast LLM call (<1000ms)', async () => {
    /**
     * Validates that fast calls still work (baseline test)
     */

    // Mock LLM provider with fast response (500ms)
    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
          data: {
            language: 'en',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: 'US',
            priceIntent: 'CHEAP',
            minRatingBucket: 'R40',
            minReviewCountBucket: null
          },
          usage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'cheap restaurants',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'timeout-test-3'
    });

    // Assert: Should succeed with correct filters
    // NOTE: language is always 'auto' (ignored from LLM, comes from upstream only)
    assert.strictEqual(result.language, 'auto', 'Language always "auto" - comes from upstream only');
    assert.strictEqual(result.regionHint, 'US');
    assert.strictEqual(result.priceIntent, 'CHEAP');
    assert.strictEqual(result.minRatingBucket, 'R40');
  });
});

describe('Base Filters LLM - Edge Case: ~3100ms (near timeout)', () => {
  it('should succeed with 3100ms call (within 3200ms limit)', async () => {
    /**
     * Edge case: Call takes 3100ms (close to 3200ms limit)
     * Should still succeed
     */

    const mockLLMProvider: LLMProvider = {
      async completeJSON() {
        await new Promise(resolve => setTimeout(resolve, 3100));

        return {
          data: {
            language: 'he',
            openState: 'CLOSED_NOW',
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: 'EXPENSIVE',
            minRatingBucket: 'R45',
            minReviewCountBucket: 'C500'
          },
          usage: { prompt_tokens: 90, completion_tokens: 45, total_tokens: 135 },
          model: 'gpt-4o-mini'
        } as any;
      },
      complete: async () => ({ content: '', usage: {} }) as any
    };

    const result = await resolveBaseFiltersLLM({
      query: 'מסעדות יוקרתיות סגורות',
      route: 'TEXTSEARCH' as any,
      llmProvider: mockLLMProvider,
      requestId: 'timeout-test-4'
    });

    // Assert: Should succeed (no fallback)
    assert.strictEqual(result.openState, 'CLOSED_NOW');
    assert.strictEqual(result.priceIntent, 'EXPENSIVE');
    assert.strictEqual(result.minRatingBucket, 'R45');
    assert.strictEqual(result.minReviewCountBucket, 'C500');
  });
});
