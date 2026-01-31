/**
 * Test: LLM-based language detection for assistant messages
 * Ensures short queries in Spanish/Russian get correct language
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Route2Context } from '../types.js';

// Import the helper (will be resolved at runtime)
async function getHelpers() {
  return import('../orchestrator.helpers.js');
}

describe('LLM-based Assistant Language Detection', () => {
  describe('High confidence language detection', () => {
    it('should use Spanish when languageConfidence >= 0.7', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-123',
        startTime: Date.now(),
        traceId: 'trace-123',
        sessionId: 'session-123',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'en' }
        } as any
      };

      // Spanish query with high confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'es', 0.9);

      // Should use uiLanguage since 'es' is not 'he' or 'en'
      assert.strictEqual(language, 'en', 'Spanish should fallback to uiLanguage (en)');
    });

    it('should use Russian when languageConfidence >= 0.7', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-456',
        startTime: Date.now(),
        traceId: 'trace-456',
        sessionId: 'session-456',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // Russian query with high confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'ru', 0.85);

      // Should use uiLanguage since 'ru' is not 'he' or 'en'
      assert.strictEqual(language, 'he', 'Russian should fallback to uiLanguage (he)');
    });

    it('should use Hebrew when languageConfidence >= 0.7', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-789',
        startTime: Date.now(),
        traceId: 'trace-789',
        sessionId: 'session-789',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'en' }
        } as any
      };

      // Hebrew query with high confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'he', 0.95);

      assert.strictEqual(language, 'he', 'Hebrew should use detected language');
    });

    it('should use English when languageConfidence >= 0.7', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-abc',
        startTime: Date.now(),
        traceId: 'trace-abc',
        sessionId: 'session-abc',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // English query with high confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'en', 0.8);

      assert.strictEqual(language, 'en', 'English should use detected language');
    });
  });

  describe('Low confidence language detection', () => {
    it('should fallback to uiLanguage when languageConfidence < 0.7', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-low-1',
        startTime: Date.now(),
        traceId: 'trace-low-1',
        sessionId: 'session-low-1',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // Hebrew query with LOW confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'he', 0.6);

      assert.strictEqual(language, 'he', 'Low confidence should fallback to uiLanguage');
    });

    it('should fallback to uiLanguage when Spanish has low confidence', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-low-2',
        startTime: Date.now(),
        traceId: 'trace-low-2',
        sessionId: 'session-low-2',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'en' }
        } as any
      };

      // Spanish query with LOW confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'es', 0.5);

      assert.strictEqual(language, 'en', 'Low confidence Spanish should fallback to uiLanguage');
    });

    it('should use uiLanguage when no languageConfidence provided', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-no-conf',
        startTime: Date.now(),
        traceId: 'trace-no-conf',
        sessionId: 'session-no-conf',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // No languageConfidence
      const language = resolveAssistantLanguage(ctx, undefined, 'en', undefined);

      assert.strictEqual(language, 'he', 'No confidence should fallback to uiLanguage');
    });
  });

  describe('Edge cases', () => {
    it('should use English fallback when no uiLanguage available', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-no-ui',
        startTime: Date.now(),
        traceId: 'trace-no-ui',
        sessionId: 'session-no-ui',
        llmProvider: {} as any,
        sharedFilters: undefined
      };

      // No uiLanguage available
      const language = resolveAssistantLanguage(ctx, undefined, 'ru', 0.5);

      assert.strictEqual(language, 'en', 'Should fallback to English when no uiLanguage');
    });

    it('should handle "other" language with high confidence', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-other',
        startTime: Date.now(),
        traceId: 'trace-other',
        sessionId: 'session-other',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // "other" language with high confidence
      const language = resolveAssistantLanguage(ctx, undefined, 'other', 0.9);

      assert.strictEqual(language, 'he', '"other" should fallback to uiLanguage even with high confidence');
    });
  });

  describe('Short query scenarios (real-world)', () => {
    it('should handle Spanish short query "restaurante"', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-es-short',
        startTime: Date.now(),
        traceId: 'trace-es-short',
        sessionId: 'session-es-short',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'en' }
        } as any
      };

      // Spanish single word with moderate confidence (0.7)
      const language = resolveAssistantLanguage(ctx, undefined, 'es', 0.7);

      assert.strictEqual(language, 'en', 'Spanish short query should use uiLanguage');
    });

    it('should handle Russian short query "ресторан"', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-ru-short',
        startTime: Date.now(),
        traceId: 'trace-ru-short',
        sessionId: 'session-ru-short',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // Russian single word with moderate confidence (0.75)
      const language = resolveAssistantLanguage(ctx, undefined, 'ru', 0.75);

      assert.strictEqual(language, 'he', 'Russian short query should use uiLanguage');
    });

    it('should handle Hebrew short query "מסעדה" with high confidence', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-he-short',
        startTime: Date.now(),
        traceId: 'trace-he-short',
        sessionId: 'session-he-short',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'en' }
        } as any
      };

      // Hebrew single word with high confidence (0.85)
      const language = resolveAssistantLanguage(ctx, undefined, 'he', 0.85);

      assert.strictEqual(language, 'he', 'Hebrew short query with high confidence should use detected language');
    });

    it('should handle English short query "pizza" with moderate confidence', async () => {
      const { resolveAssistantLanguage } = await getHelpers();

      const ctx: Route2Context = {
        requestId: 'test-en-short',
        startTime: Date.now(),
        traceId: 'trace-en-short',
        sessionId: 'session-en-short',
        llmProvider: {} as any,
        sharedFilters: {
          final: { uiLanguage: 'he' }
        } as any
      };

      // English single word with moderate confidence (0.7)
      const language = resolveAssistantLanguage(ctx, undefined, 'en', 0.7);

      assert.strictEqual(language, 'en', 'English short query with sufficient confidence should use detected language');
    });
  });
});
