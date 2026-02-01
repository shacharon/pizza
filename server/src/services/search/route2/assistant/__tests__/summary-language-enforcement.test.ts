/**
 * SUMMARY Language Enforcement Tests
 * 
 * Tests that SUMMARY messages are generated in the requestedLanguage
 * regardless of input language (query, restaurant names, etc.)
 * 
 * Scope: Assistant SUMMARY LLM call language compliance
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider } from '../../../../../llm/types.js';
import { generateAssistantMessage } from '../assistant-llm.service.js';
import type { AssistantSummaryContext } from '../assistant.types.js';

describe('SUMMARY Language Enforcement', () => {
  describe('requestedLanguage=ru (Russian)', () => {
    test('should output Russian when requestedLanguage=ru, uiLanguage=en, English restaurant names', async () => {
      // GIVEN: Russian requested, but English context everywhere
      const context: AssistantSummaryContext = {
        type: 'SUMMARY',
        query: 'pizza restaurants', // English query
        language: 'ru', // requestedLanguage = Russian
        resultCount: 5,
        top3Names: ['Pizza Hut', 'Dominos', 'Papa Johns'], // English names
        metadata: {
          openNowCount: 3,
          currentHour: 14,
          radiusKm: 5
        }
      };

      // Mock LLM to return Russian output (as expected)
      const mockLLMProvider: LLMProvider = {
        completeJSON: mock.fn(async () => ({
          data: {
            type: 'SUMMARY',
            message: 'Найдено 5 ресторанов пиццы поблизости. Большинство открыты сейчас.',
            question: null,
            suggestedAction: 'NONE',
            blocksSearch: false,
            language: 'ru',
            outputLanguage: 'ru'
          },
          usage: { promptTokens: 100, completionTokens: 50 },
          model: 'gpt-4o-mini'
        }))
      } as any;

      // WHEN: Generate assistant message
      const result = await generateAssistantMessage(
        context,
        mockLLMProvider,
        'test-req-ru-1'
      );

      // THEN: Output should be in Russian
      assert.strictEqual(result.language, 'ru', 'language should be ru');
      assert.strictEqual(result.outputLanguage, 'ru', 'outputLanguage should be ru');
      
      // Verify message contains Cyrillic characters (Russian script)
      const hasCyrillic = /[\u0400-\u04FF]/.test(result.message);
      assert.ok(hasCyrillic, 'message should contain Cyrillic characters');
      
      // Verify no Latin-only text (should have Russian)
      const latinOnlyPattern = /^[A-Za-z0-9\s.,!?-]+$/;
      assert.ok(!latinOnlyPattern.test(result.message), 'message should not be Latin-only (English)');
    });

    test('should trigger fallback if LLM outputs English instead of Russian', async () => {
      // GIVEN: Russian requested
      const context: AssistantSummaryContext = {
        type: 'SUMMARY',
        query: 'italian restaurants',
        language: 'ru', // requestedLanguage = Russian
        resultCount: 8,
        top3Names: ['Bella Italia', 'Pasta Bar', 'Trattoria']
      };

      // Mock LLM to return WRONG language (English instead of Russian)
      const mockLLMProvider: LLMProvider = {
        completeJSON: mock.fn(async () => ({
          data: {
            type: 'SUMMARY',
            message: 'Found 8 Italian restaurants nearby. Most are highly rated.', // WRONG - English!
            question: null,
            suggestedAction: 'NONE',
            blocksSearch: false,
            language: 'en', // WRONG
            outputLanguage: 'en' // WRONG
          },
          usage: { promptTokens: 100, completionTokens: 50 },
          model: 'gpt-4o-mini'
        }))
      } as any;

      // WHEN: Generate assistant message
      const result = await generateAssistantMessage(
        context,
        mockLLMProvider,
        'test-req-ru-2'
      );

      // THEN: Should trigger fallback to Russian
      assert.strictEqual(result.language, 'ru', 'language should be corrected to ru');
      assert.strictEqual(result.outputLanguage, 'ru', 'outputLanguage should be corrected to ru');
      
      // Verify fallback message is in Russian (Cyrillic)
      const hasCyrillic = /[\u0400-\u04FF]/.test(result.message);
      assert.ok(hasCyrillic, 'fallback message should contain Cyrillic characters');
    });
  });

  describe('requestedLanguage=ar (Arabic)', () => {
    test('should output Arabic when requestedLanguage=ar, uiLanguage=he, mixed input', async () => {
      // GIVEN: Arabic requested, Hebrew UI, mixed input
      const context: AssistantSummaryContext = {
        type: 'SUMMARY',
        query: 'מסעדות סיניות', // Hebrew query
        language: 'ar', // requestedLanguage = Arabic
        resultCount: 10,
        top3Names: ['Beijing Restaurant', 'Golden Dragon', 'Shanghai Express'], // English names
        metadata: {
          openNowCount: 7,
          currentHour: 19
        }
      };

      // Mock LLM to return Arabic output (as expected)
      const mockLLMProvider: LLMProvider = {
        completeJSON: mock.fn(async () => ({
          data: {
            type: 'SUMMARY',
            message: 'تم العثور على 10 مطاعم صينية قريبة. معظمها مفتوح الآن.',
            question: null,
            suggestedAction: 'NONE',
            blocksSearch: false,
            language: 'ar',
            outputLanguage: 'ar'
          },
          usage: { promptTokens: 120, completionTokens: 40 },
          model: 'gpt-4o-mini'
        }))
      } as any;

      // WHEN: Generate assistant message
      const result = await generateAssistantMessage(
        context,
        mockLLMProvider,
        'test-req-ar-1'
      );

      // THEN: Output should be in Arabic
      assert.strictEqual(result.language, 'ar', 'language should be ar');
      assert.strictEqual(result.outputLanguage, 'ar', 'outputLanguage should be ar');
      
      // Verify message contains Arabic script
      const hasArabic = /[\u0600-\u06FF]/.test(result.message);
      assert.ok(hasArabic, 'message should contain Arabic characters');
      
      // Verify no Hebrew characters (should be Arabic only)
      const hasHebrew = /[\u0590-\u05FF]/.test(result.message);
      assert.ok(!hasHebrew, 'message should not contain Hebrew characters');
    });

    test('should trigger fallback if outputLanguage mismatch (outputLanguage=en but requested=ar)', async () => {
      // GIVEN: Arabic requested
      const context: AssistantSummaryContext = {
        type: 'SUMMARY',
        query: 'burger restaurants',
        language: 'ar', // requestedLanguage = Arabic
        resultCount: 6,
        top3Names: ['Five Guys', 'Shake Shack', 'Burger King']
      };

      // Mock LLM to return WRONG outputLanguage field
      const mockLLMProvider: LLMProvider = {
        completeJSON: mock.fn(async () => ({
          data: {
            type: 'SUMMARY',
            message: 'Found 6 burger restaurants nearby.', // English message
            question: null,
            suggestedAction: 'NONE',
            blocksSearch: false,
            language: 'en',
            outputLanguage: 'en' // WRONG - should be 'ar'
          },
          usage: { promptTokens: 100, completionTokens: 45 },
          model: 'gpt-4o-mini'
        }))
      } as any;

      // WHEN: Generate assistant message
      const result = await generateAssistantMessage(
        context,
        mockLLMProvider,
        'test-req-ar-2'
      );

      // THEN: Should trigger outputLanguage validation and use fallback
      assert.strictEqual(result.language, 'ar', 'language should be corrected to ar');
      assert.strictEqual(result.outputLanguage, 'ar', 'outputLanguage should be corrected to ar');
      
      // Verify fallback message is in Arabic
      const hasArabic = /[\u0600-\u06FF]/.test(result.message);
      assert.ok(hasArabic, 'fallback message should contain Arabic characters');
    });
  });

  describe('Prompt includes requestedLanguage emphasis', () => {
    test('should pass requestedLanguage in user prompt (not uiLanguage)', async () => {
      // GIVEN: Russian context
      const context: AssistantSummaryContext = {
        type: 'SUMMARY',
        query: 'sushi',
        language: 'ru',
        resultCount: 3,
        top3Names: ['Sushi Bar', 'Tokyo Roll', 'Sakura']
      };

      let capturedUserPrompt = '';
      
      const mockLLMProvider: LLMProvider = {
        completeJSON: mock.fn(async (messages: any[]) => {
          // Capture user prompt
          capturedUserPrompt = messages.find(m => m.role === 'user')?.content || '';
          
          return {
            data: {
              type: 'SUMMARY',
              message: 'Найдено 3 суши-ресторана.',
              question: null,
              suggestedAction: 'NONE',
              blocksSearch: false,
              language: 'ru',
              outputLanguage: 'ru'
            },
            usage: { promptTokens: 100, completionTokens: 30 },
            model: 'gpt-4o-mini'
          };
        })
      } as any;

      // WHEN: Generate assistant message
      await generateAssistantMessage(
        context,
        mockLLMProvider,
        'test-req-ru-prompt'
      );

      // THEN: User prompt should mention Language (simplified from requestedLanguage)
      assert.ok(capturedUserPrompt.includes('Language: ru'), 
        'User prompt should include Language field');
      assert.ok(capturedUserPrompt.includes('IGNORE the language of restaurant names'),
        'User prompt should emphasize ignoring input language');
      assert.ok(capturedUserPrompt.includes('IGNORE') && capturedUserPrompt.includes('query'),
        'User prompt should emphasize ignoring query language');
      
      // CRITICAL: Verify uiLanguage is NOT in the prompt
      assert.ok(!capturedUserPrompt.includes('uiLanguage'),
        'User prompt should NOT contain uiLanguage field');
      assert.ok(!capturedUserPrompt.includes('UI language'),
        'User prompt should NOT mention UI language');
    });
  });

  describe('Integration: End-to-end language enforcement', () => {
    test('should enforce Russian output even with English-heavy input', async () => {
      // GIVEN: All English input, Russian requested
      const context: AssistantSummaryContext = {
        type: 'SUMMARY',
        query: 'best coffee shops near me', // English
        language: 'ru', // Russian requested
        resultCount: 12,
        top3Names: ['Starbucks', 'Costa Coffee', 'Cafe Nero'], // English
        metadata: {
          openNowCount: 10,
          currentHour: 10,
          radiusKm: 3,
          filtersApplied: ['OPEN_NOW'] // English
        }
      };

      const mockLLMProvider: LLMProvider = {
        completeJSON: mock.fn(async () => ({
          data: {
            type: 'SUMMARY',
            message: 'Найдено 12 кофеен поблизости. 10 из них открыты сейчас.',
            question: null,
            suggestedAction: 'NONE',
            blocksSearch: false,
            language: 'ru',
            outputLanguage: 'ru'
          },
          usage: { promptTokens: 150, completionTokens: 60 },
          model: 'gpt-4o-mini'
        }))
      } as any;

      // WHEN: Generate assistant message
      const result = await generateAssistantMessage(
        context,
        mockLLMProvider,
        'test-req-integration'
      );

      // THEN: Output must be Russian
      assert.strictEqual(result.language, 'ru');
      assert.strictEqual(result.outputLanguage, 'ru');
      assert.ok(/[\u0400-\u04FF]/.test(result.message), 'Should contain Cyrillic');
      assert.strictEqual(result.suggestedAction, 'NONE');
      assert.strictEqual(result.blocksSearch, false);
    });
  });
});
