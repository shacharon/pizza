/**
 * Unit tests for orchestrator.helpers
 * Focus: resolveAssistantLanguage priority chain
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveAssistantLanguage, toAssistantLanguage } from '../orchestrator.helpers.js';
import type { Route2Context, FinalSharedFilters } from '../types.js';
import type { LLMProvider } from '../../../llm/types.js';

// Helper to create minimal valid FinalSharedFilters for tests
function createFinalFilters(uiLanguage: 'he' | 'en', providerLanguage: 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru' = 'en'): FinalSharedFilters {
  return {
    uiLanguage,
    providerLanguage,
    openState: null,
    openAt: null,
    openBetween: null,
    regionCode: 'IL',
    disclaimers: { hours: true, dietary: true }
  };
}

// Minimal mock LLMProvider for tests (function doesn't use it)
const mockLLMProvider = {} as LLMProvider;

describe('toAssistantLanguage', () => {
  it('should map supported languages correctly', () => {
    assert.strictEqual(toAssistantLanguage('he'), 'he');
    assert.strictEqual(toAssistantLanguage('HE'), 'he');
    assert.strictEqual(toAssistantLanguage('en'), 'en');
    assert.strictEqual(toAssistantLanguage('ar'), 'ar');
    assert.strictEqual(toAssistantLanguage('ru'), 'ru');
    assert.strictEqual(toAssistantLanguage('fr'), 'fr');
    assert.strictEqual(toAssistantLanguage('es'), 'es');
  });

  it('should map unsupported languages to other', () => {
    assert.strictEqual(toAssistantLanguage('zh'), 'other');
    assert.strictEqual(toAssistantLanguage('ja'), 'other');
    assert.strictEqual(toAssistantLanguage('de'), 'other');
  });

  it('should handle invalid inputs', () => {
    assert.strictEqual(toAssistantLanguage(null), 'en');
    assert.strictEqual(toAssistantLanguage(undefined), 'en');
    assert.strictEqual(toAssistantLanguage(123), 'en');
    assert.strictEqual(toAssistantLanguage(''), 'en');
  });
});

describe('resolveAssistantLanguage - Priority Chain', () => {
  /**
   * BUG FIX TEST: Arabic query with English UI should resolve to Arabic
   * Given: queryLanguageDetected="ar", uiLanguage="en", intent.language="ar"
   * Expected: chosen="ar", source="intent"
   */
  it('should prioritize intent language over uiLanguage (Arabic query, English UI)', () => {
    const ctx: Route2Context = {
      requestId: 'test-ar-intent',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'ar', // Query detected as Arabic
      sharedFilters: {
        final: {
          uiLanguage: 'en', // User prefers English UI
          providerLanguage: 'ar',
          openState: null,
          openAt: null,
          openBetween: null,
          regionCode: 'IL',
          disclaimers: { hours: true, dietary: true }
        }
      }
    };

    const result = resolveAssistantLanguage(ctx, undefined, 'ar'); // intent.language = 'ar'
    
    assert.strictEqual(result, 'ar', 'Should choose Arabic from intent');
    // Source should be 'intent', not 'uiLanguage'
  });

  /**
   * Priority 1: Intent language (detectedLanguage param)
   */
  it('should use intent language when available', () => {
    const ctx: Route2Context = {
      requestId: 'test-1',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'en',
      sharedFilters: {
        final: createFinalFilters('en')
      }
    };

    const result = resolveAssistantLanguage(ctx, undefined, 'he'); // intent says Hebrew
    assert.strictEqual(result, 'he');
  });

  /**
   * Priority 2: Query language detection (when intent not available)
   */
  it('should use queryLanguage when intent is missing', () => {
    const ctx: Route2Context = {
      requestId: 'test-2',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'ar', // Query detected as Arabic
      sharedFilters: {
        final: createFinalFilters('en', 'ar') // UI is English, provider is Arabic
      }
    };

    const result = resolveAssistantLanguage(ctx, undefined, undefined); // No intent language
    assert.strictEqual(result, 'ar', 'Should use queryLanguage (ar) over uiLanguage (en)');
  });

  /**
   * Priority 3: UI language (FALLBACK when intent and query detection unavailable)
   * Note: baseFilters.language was removed from priority chain - intent.language is single source of truth
   */
  it('should use uiLanguage as fallback when query language is unknown', () => {
    const ctx: Route2Context = {
      requestId: 'test-3',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'unknown', // Can't detect query language
      sharedFilters: {
        final: createFinalFilters('he')
      }
    };

    const result = resolveAssistantLanguage(ctx, undefined, undefined);
    assert.strictEqual(result, 'he', 'Should fallback to uiLanguage when query unknown');
  });

  /**
   * Priority 4: Final fallback - English (when all else fails)
   */
  it('should fallback to English when no language available', () => {
    const ctx: Route2Context = {
      requestId: 'test-4',
      startTime: Date.now(),
      llmProvider: mockLLMProvider
      // No queryLanguage, no filters
    };

    const result = resolveAssistantLanguage(ctx, undefined, undefined);
    assert.strictEqual(result, 'en', 'Should fallback to English');
  });

  /**
   * Skip 'other' languages in priority chain
   */
  it('should skip "other" languages and continue priority chain', () => {
    const ctx: Route2Context = {
      requestId: 'test-6',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'ar', // Query is Arabic
      sharedFilters: {
        final: createFinalFilters('en', 'ar')
      }
    };

    // Intent language is 'other' (unsupported), should skip to queryLanguage
    const result = resolveAssistantLanguage(ctx, undefined, 'other');
    assert.strictEqual(result, 'ar', 'Should skip "other" and use queryLanguage');
  });

  /**
   * Real-world scenario: Hebrew query with English UI
   */
  it('should handle Hebrew query with English UI correctly', () => {
    const ctx: Route2Context = {
      requestId: 'test-hebrew',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'he',
      sharedFilters: {
        final: createFinalFilters('en', 'he')
      }
    };

    const result = resolveAssistantLanguage(ctx, undefined, 'he'); // intent.language = 'he'
    assert.strictEqual(result, 'he', 'Hebrew query should get Hebrew assistant');
  });

  /**
   * Real-world scenario: Russian query with Hebrew UI
   */
  it('should handle Russian query with Hebrew UI correctly', () => {
    const ctx: Route2Context = {
      requestId: 'test-russian',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      queryLanguage: 'ru',
      sharedFilters: {
        final: createFinalFilters('he', 'ru')
      }
    };

    const result = resolveAssistantLanguage(ctx, undefined, 'ru');
    assert.strictEqual(result, 'ru', 'Russian query should get Russian assistant');
  });
});
