/**
 * Integration tests for Assistant Language Enforcement
 * 
 * Tests that assistant response language always matches query language
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('Assistant Language Enforcement', () => {
  let mockWsManager: any;
  let mockContext: any;
  let mockLLMProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWsManager = {
      publishToChannel: jest.fn()
    };

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
        },
        preGoogle: {
          language: 'he' as const
        }
      }
    };
  });

  describe('Language Resolution Priority', () => {
    it('should prioritize sharedFilters.final.uiLanguage', async () => {
      mockContext.sharedFilters.final.uiLanguage = 'en';
      mockContext.sharedFilters.preGoogle.language = 'he';

      const { resolveAssistantLanguage } = await import(
        '../src/services/search/route2/orchestrator.helpers.js'
      );

      const result = resolveAssistantLanguage(mockContext, undefined, 'he');

      // Should use final.uiLanguage (en) even though preGoogle is he
      expect(result).toBe('en');
    });

    it('should fallback to sharedFilters.preGoogle.language', async () => {
      mockContext.sharedFilters.final = undefined;
      mockContext.sharedFilters.preGoogle.language = 'en';

      const { resolveAssistantLanguage } = await import(
        '../src/services/search/route2/orchestrator.helpers.js'
      );

      const result = resolveAssistantLanguage(mockContext, undefined, 'he');

      // Should use preGoogle.language (en)
      expect(result).toBe('en');
    });

    it('should fallback to detectedLanguage', async () => {
      mockContext.sharedFilters = undefined;

      const { resolveAssistantLanguage } = await import(
        '../src/services/search/route2/orchestrator.helpers.js'
      );

      const result = resolveAssistantLanguage(mockContext, undefined, 'en');

      // Should use detectedLanguage
      expect(result).toBe('en');
    });

    it('should fallback to region for IL', async () => {
      mockContext.sharedFilters = undefined;
      mockContext.regionCodeFinal = 'IL';

      const { resolveAssistantLanguage } = await import(
        '../src/services/search/route2/orchestrator.helpers.js'
      );

      const result = resolveAssistantLanguage(mockContext, undefined, undefined);

      // Should use region-based fallback (IL → he)
      expect(result).toBe('he');
    });

    it('should final fallback to "he"', async () => {
      mockContext.sharedFilters = undefined;
      mockContext.regionCodeFinal = 'OTHER';

      const { resolveAssistantLanguage } = await import(
        '../src/services/search/route2/orchestrator.helpers.js'
      );

      const result = resolveAssistantLanguage(mockContext, undefined, undefined);

      // Should use final fallback
      expect(result).toBe('he');
    });
  });

  describe('Hebrew Query → Hebrew Response', () => {
    it('should generate Hebrew CLARIFY message for Hebrew query', async () => {
      // Mock LLM to return Hebrew message
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש מסעדות?',
          question: 'באיזה עיר או אזור?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      // Assert Hebrew content
      expect(publishedMessage.payload.message).toContain('איפה');
      expect(publishedMessage.payload.question).toContain('עיר');
      expect(publishedMessage.payload.type).toBe('CLARIFY');
    });

    it('should generate Hebrew GATE_FAIL message for Hebrew query', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'GATE_FAIL',
          message: 'זה לא נראה כמו חיפוש אוכל. נסה למשל: "פיצה בתל אביב".',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'GATE_FAIL' as const,
        reason: 'NO_FOOD' as const,
        query: 'מכונית',
        language: 'he' as const
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      expect(publishedMessage.payload.message).toContain('אוכל');
      expect(publishedMessage.payload.message).toContain('פיצה');
    });

    it('should generate Hebrew SUMMARY message for Hebrew query', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'SUMMARY',
          message: 'מצאתי 3 מסעדות שמתאימות לחיפוש שלך.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'SUMMARY' as const,
        query: 'פיצה בתל אביב',
        language: 'he' as const,
        resultCount: 3,
        top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      expect(publishedMessage.payload.message).toContain('מצאתי');
      expect(publishedMessage.payload.message).toContain('מסעדות');
    });
  });

  describe('English Query → English Response', () => {
    beforeEach(() => {
      // Set context to English
      mockContext.sharedFilters.final.uiLanguage = 'en';
      mockContext.sharedFilters.preGoogle.language = 'en';
    });

    it('should generate English CLARIFY message for English query', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'Where do you want to search for restaurants?',
          question: 'Which city or area?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'restaurants near me',
        language: 'en' as const
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      expect(publishedMessage.payload.message).toContain('Where');
      expect(publishedMessage.payload.question).toContain('city');
      expect(publishedMessage.payload.type).toBe('CLARIFY');
    });

    it('should generate English SUMMARY message for English query', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'SUMMARY',
          message: 'Found 5 restaurants matching your search.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'SUMMARY' as const,
        query: 'pizza in Tel Aviv',
        language: 'en' as const,
        resultCount: 5,
        top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      expect(publishedMessage.payload.message).toContain('Found');
      expect(publishedMessage.payload.message).toContain('restaurants');
    });
  });

  describe('Language Mismatch Detection and Fallback', () => {
    it('should detect Hebrew query with English response and use fallback', async () => {
      // LLM incorrectly returns English for Hebrew query
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'Where do you want to search?', // Wrong language!
          question: 'Which city?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const // Requested Hebrew
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      // Should use Hebrew fallback, not English LLM output
      expect(publishedMessage.payload.message).not.toContain('Where');
      expect(publishedMessage.payload.message).toContain('מיקום');
      expect(publishedMessage.payload.type).toBe('CLARIFY');
    });

    it('should detect English query with Hebrew response and use fallback', async () => {
      mockContext.sharedFilters.final.uiLanguage = 'en';

      // LLM incorrectly returns Hebrew for English query
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?', // Wrong language!
          question: 'באיזה עיר?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'restaurants near me',
        language: 'en' as const // Requested English
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      // Should use English fallback, not Hebrew LLM output
      expect(publishedMessage.payload.message).not.toContain('איפה');
      expect(publishedMessage.payload.message).toContain('location');
      expect(publishedMessage.payload.type).toBe('CLARIFY');
    });

    it('should handle mixed language in question field', async () => {
      // LLM returns correct message but wrong language question
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'איפה אתה רוצה לחפש?', // Correct (Hebrew)
          question: 'Which city?', // Wrong (English)
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'מסעדות לידי',
        language: 'he' as const
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      // Should replace both fields with Hebrew fallback
      expect(publishedMessage.payload.message).toContain('מיקום');
      expect(publishedMessage.payload.question).not.toContain('Which');
      expect(publishedMessage.payload.question).toContain('עיר');
    });
  });

  describe('Deterministic Fallback Messages', () => {
    it('should provide correct Hebrew fallback for CLARIFY MISSING_LOCATION', async () => {
      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'Wrong language',
          question: 'Wrong',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'לידי',
        language: 'he' as const
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      expect(publishedMessage.payload.message).toBe('כדי לחפש מסעדות לידך אני צריך את המיקום שלך.');
      expect(publishedMessage.payload.question).toBe('אפשר לאשר מיקום או לכתוב עיר/אזור?');
    });

    it('should provide correct English fallback for CLARIFY MISSING_LOCATION', async () => {
      mockContext.sharedFilters.final.uiLanguage = 'en';

      mockLLMProvider.completeJSON.mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'שגוי',
          question: 'שגוי',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      });

      const { generateAndPublishAssistant } = await import(
        '../src/services/search/route2/assistant/assistant-integration.js'
      );

      const assistantContext = {
        type: 'CLARIFY' as const,
        reason: 'MISSING_LOCATION' as const,
        query: 'near me',
        language: 'en' as const
      };

      await generateAndPublishAssistant(
        mockContext,
        'test-req-123',
        'test-session-456',
        assistantContext,
        'fallback',
        mockWsManager
      );

      const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

      expect(publishedMessage.payload.message).toBe('To search for restaurants near you, I need your location.');
      expect(publishedMessage.payload.question).toBe('Can you enable location or enter a city/area?');
    });
  });
});
