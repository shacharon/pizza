/**
 * Integration tests for Assistant Tightening with Invariant Enforcement
 * 
 * Tests deterministic enforcement of:
 * 1. Type-specific invariants (blocksSearch, suggestedAction)
 * 2. Strict validation (language, message/question format)
 * 3. Deterministic fallback on LLM error/timeout
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('Assistant Tightening - Invariant Enforcement', () => {
  let mockLLMProvider: any;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMProvider = {
      completeJSON: jest.fn(),
      complete: jest.fn()
    };

    mockContext = {
      requestId: 'test-req-123',
      sessionId: 'test-session-456',
      llmProvider: mockLLMProvider,
      userRegionCode: 'IL',
      traceId: 'test-trace',
      startTime: Date.now(),
      sharedFilters: {
        final: {
          uiLanguage: 'he' as const
        }
      }
    };
  });

  describe('CLARIFY Invariants', () => {
    it('should enforce blocksSearch=true for CLARIFY even if LLM says false', async () => {
      // LLM incorrectly returns blocksSearch=false
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?',
          question: 'באיזה עיר?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: false // WRONG - should be enforced to true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // CRITICAL: blocksSearch must be enforced to true
      expect(result.blocksSearch).toBe(true);
      expect(result.type).toBe('CLARIFY');
    });

    it('should enforce suggestedAction=ASK_LOCATION for CLARIFY+MISSING_LOCATION', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?',
          question: 'באיזה עיר?',
          suggestedAction: 'RETRY', // WRONG - should be ASK_LOCATION
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // CRITICAL: suggestedAction must be enforced to ASK_LOCATION
      expect(result.suggestedAction).toBe('ASK_LOCATION');
      expect(result.blocksSearch).toBe(true);
    });

    it('should enforce suggestedAction=ASK_FOOD for CLARIFY+MISSING_FOOD', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איזה אוכל את/ה מחפש/ת?',
          question: 'מה תרצו לאכול?',
          suggestedAction: 'RETRY', // WRONG - should be ASK_FOOD
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_FOOD' as const,
        query: 'מסעדות בתל אביב',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // CRITICAL: suggestedAction must be enforced to ASK_FOOD
      expect(result.suggestedAction).toBe('ASK_FOOD');
      expect(result.blocksSearch).toBe(true);
    });
  });

  describe('SUMMARY Invariants', () => {
    it('should enforce blocksSearch=false for SUMMARY even if LLM says true', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'SUMMARY',
          message: 'מצאתי 5 מסעדות שמתאימות לחיפוש שלך.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: true // WRONG - should be false for SUMMARY
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'SUMMARY' as const,
        query: 'פיצה בתל אביב',
        language: 'he' as const,
        resultCount: 5,
        top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // CRITICAL: blocksSearch must be enforced to false
      expect(result.blocksSearch).toBe(false);
      expect(result.type).toBe('SUMMARY');
    });

    it('should enforce suggestedAction=NONE for SUMMARY', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'SUMMARY',
          message: 'מצאתי 3 מסעדות.',
          question: null,
          suggestedAction: 'EXPAND_RADIUS', // WRONG - should be NONE
          blocksSearch: false
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'SUMMARY' as const,
        query: 'סושי בחיפה',
        language: 'he' as const,
        resultCount: 3,
        top3Names: ['Sushi 1', 'Sushi 2', 'Sushi 3']
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // CRITICAL: suggestedAction must be enforced to NONE
      expect(result.suggestedAction).toBe('NONE');
      expect(result.blocksSearch).toBe(false);
    });
  });

  describe('GATE_FAIL Invariants', () => {
    it('should enforce blocksSearch=true for GATE_FAIL', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'GATE_FAIL',
          message: 'זה לא נראה כמו חיפוש אוכל.',
          question: null,
          suggestedAction: 'RETRY',
          blocksSearch: false // WRONG - should be true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'GATE_FAIL' as const,
        reason: 'NO_FOOD' as const,
        query: 'מכונית',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // CRITICAL: blocksSearch must be enforced to true
      expect(result.blocksSearch).toBe(true);
      expect(result.type).toBe('GATE_FAIL');
    });
  });

  describe('Language Enforcement', () => {
    it('should detect and fix Hebrew query with English response', async () => {
      // LLM returns English instead of Hebrew
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'Where do you want to search?', // WRONG language
          question: 'Which city?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should use Hebrew fallback
      expect(result.message).toContain('מיקום');
      expect(result.message).not.toContain('Where');
      expect(result.question).toContain('עיר');
    });

    it('should detect and fix English query with Hebrew response', async () => {
      mockContext.sharedFilters.final.uiLanguage = 'en';

      // LLM returns Hebrew instead of English
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?', // WRONG language
          question: 'באיזה עיר?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'restaurants near me',
        language: 'en' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should use English fallback
      expect(result.message).toContain('location');
      expect(result.message).not.toContain('איפה');
      expect(result.question).toContain('city');
    });
  });

  describe('Format Validation', () => {
    it('should reject message with >2 sentences and use fallback', async () => {
      // LLM returns message with 3 sentences
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'זה משפט ראשון. זה משפט שני. זה משפט שלישי.', // 3 sentences - INVALID
          question: 'באיזה עיר?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should use deterministic fallback (1-2 sentences)
      const sentenceCount = (result.message.match(/\.\s|\.$/g) || []).length;
      expect(sentenceCount).toBeLessThanOrEqual(2);
    });

    it('should reject question with >1 sentence and use fallback', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?',
          question: 'באיזה עיר? ומה האזור?', // 2 sentences - INVALID
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should use deterministic fallback (1 sentence)
      expect(result.question).toBeTruthy();
      const questionSentences = (result.question!.match(/\?\s|\?$/g) || []).length;
      expect(questionSentences).toBeLessThanOrEqual(1);
    });

    it('should reject question with >1 question mark and use fallback', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?',
          question: 'באיזה עיר?? ומה האזור??', // Multiple ? marks - INVALID
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should use deterministic fallback (max 1 ?)
      const questionMarks = (result.question || '').match(/\?/g);
      expect(questionMarks).toBeTruthy();
      expect(questionMarks!.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Deterministic Fallback on LLM Error', () => {
    it('should use deterministic fallback on LLM timeout', async () => {
      // LLM times out
      mockLLMProvider.completeJSON.mockRejectedValue(new Error('Request aborted due to timeout'));

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should return deterministic fallback (not throw)
      expect(result.type).toBe('CLARIFY');
      expect(result.message).toContain('מיקום');
      expect(result.blocksSearch).toBe(true);
      expect(result.suggestedAction).toBe('ASK_LOCATION');
    });

    it('should use deterministic fallback on LLM error', async () => {
      // LLM fails
      mockLLMProvider.completeJSON.mockRejectedValue(new Error('OpenAI API error'));

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      const assistantContext = {
        type: 'SUMMARY' as const,
        query: 'פיצה בתל אביב',
        language: 'he' as const,
        resultCount: 5,
        top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
      };

      const result = await generateAssistantMessage(
        assistantContext,
        mockLLMProvider,
        'test-req-123'
      );

      // Should return deterministic fallback (not throw)
      expect(result.type).toBe('SUMMARY');
      expect(result.message).toContain('מצאתי');
      expect(result.blocksSearch).toBe(false);
      expect(result.suggestedAction).toBe('NONE');
    });
  });

  describe('Fallback Correctness', () => {
    it('should ensure fallback messages have correct invariants', async () => {
      mockLLMProvider.completeJSON.mockRejectedValue(new Error('LLM failed'));

      const { generateAssistantMessage } = await import(
        '../src/services/search/route2/assistant/assistant-llm.service.js'
      );

      // Test all types
      const clarifyContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'לידי',
        language: 'he' as const
      };

      const clarifyResult = await generateAssistantMessage(
        clarifyContext,
        mockLLMProvider,
        'test-req-123'
      );

      expect(clarifyResult.blocksSearch).toBe(true);
      expect(clarifyResult.suggestedAction).toBe('ASK_LOCATION');

      // Reset mock
      mockLLMProvider.completeJSON.mockRejectedValue(new Error('LLM failed'));

      const gateFailContext = {
        type: 'GATE_FAIL' as const,
        reason: 'NO_FOOD' as const,
        query: 'מכונית',
        language: 'he' as const
      };

      const gateFailResult = await generateAssistantMessage(
        gateFailContext,
        mockLLMProvider,
        'test-req-456'
      );

      expect(gateFailResult.blocksSearch).toBe(true);
      expect(gateFailResult.suggestedAction).toBe('RETRY');
    });
  });
});
