/**
 * Assistant Publisher Unit Tests
 * Tests for language enforcement on WS publishes
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { publishAssistantMessage } from '../assistant-publisher.js';
import type { WebSocketManager } from '../../../../../infra/websocket/websocket-manager.js';
import type { LangCtx } from '../../language-enforcement.js';

describe('Assistant Publisher - Language Enforcement', () => {
  let mockWsManager: WebSocketManager;
  let publishedMessages: any[];

  beforeEach(() => {
    publishedMessages = [];
    mockWsManager = {
      publishToChannel: (channel: string, requestId: string, sessionId: string | undefined, message: any) => {
        publishedMessages.push({ channel, requestId, sessionId, message });
      }
    } as any;
  });

  describe('assistantLanguage field enforcement', () => {
    it('should fail if any assistant publish is missing assistantLanguage', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'he',
        assistantLanguageConfidence: 0.9,
        uiLanguage: 'he',
        providerLanguage: 'he',
        region: 'IL'
      };

      publishAssistantMessage(
        mockWsManager,
        'req-123',
        'sess-123',
        {
          type: 'GATE_FAIL',
          message: 'Not food related',
          question: null,
          blocksSearch: true
        },
        langCtx,
        'he'
      );

      assert.strictEqual(publishedMessages.length, 1);
      const publishedMsg = publishedMessages[0].message;

      assert.ok(publishedMsg.hasOwnProperty('assistantLanguage'), 'assistantLanguage field must be present');
      assert.strictEqual(publishedMsg.assistantLanguage, 'he');
    });

    it('should set payload.language = assistantLanguage (LANGUAGE CONTRACT)', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'he',
        assistantLanguageConfidence: 0.9,
        uiLanguage: 'en', // Different uiLanguage
        providerLanguage: 'he',
        region: 'IL'
      };

      publishAssistantMessage(
        mockWsManager,
        'req-124',
        'sess-124',
        {
          type: 'GATE_FAIL',
          message: 'Not food related',
          question: null,
          blocksSearch: true
        },
        langCtx,
        'en'
      );

      const publishedMsg = publishedMessages[0].message;

      // Verify envelope fields
      assert.strictEqual(publishedMsg.assistantLanguage, 'he', 'Envelope assistantLanguage should be he');
      assert.strictEqual(publishedMsg.uiLanguage, 'en', 'Envelope uiLanguage should remain en (not overridden)');
      
      // LANGUAGE CONTRACT: payload.language should equal assistantLanguage
      assert.strictEqual(publishedMsg.payload.language, 'he', 'payload.language must equal assistantLanguage');
    });

    it('should use langCtx.assistantLanguage as source of truth', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'fr',
        assistantLanguageConfidence: 0.85,
        uiLanguage: 'en',
        providerLanguage: 'fr',
        region: 'IL'
      };

      publishAssistantMessage(
        mockWsManager,
        'req-456',
        'sess-456',
        {
          type: 'CLARIFY',
          message: 'Clarification needed',
          question: 'What did you mean?',
          blocksSearch: true,
          language: 'en' // Should be overridden by langCtx
        },
        langCtx,
        'en'
      );

      const publishedMsg = publishedMessages[0].message;
      assert.strictEqual(publishedMsg.assistantLanguage, 'fr');
    });

    it('should fall back to en if langCtx is missing', () => {
      publishAssistantMessage(
        mockWsManager,
        'req-789',
        'sess-789',
        {
          type: 'SUMMARY',
          message: 'Summary text',
          question: null,
          blocksSearch: false
        },
        undefined,
        undefined
      );

      const publishedMsg = publishedMessages[0].message;
      assert.strictEqual(publishedMsg.assistantLanguage, 'en');
    });

    it('should use uiLanguageFallback if langCtx is missing', () => {
      publishAssistantMessage(
        mockWsManager,
        'req-999',
        'sess-999',
        {
          type: 'SEARCH_FAILED',
          message: 'Search failed',
          question: null,
          blocksSearch: true
        },
        undefined,
        'he'
      );

      const publishedMsg = publishedMessages[0].message;
      assert.strictEqual(publishedMsg.assistantLanguage, 'he');
    });
  });

  describe('assistantLanguage consistency across events', () => {
    it('should assert assistantLanguage is identical across all assistant events for the same requestId', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'es',
        assistantLanguageConfidence: 0.95,
        uiLanguage: 'es',
        providerLanguage: 'es',
        region: 'IL'
      };

      // Publish multiple assistant messages for same requestId
      publishAssistantMessage(
        mockWsManager,
        'req-consistency',
        'sess-consistency',
        {
          type: 'GATE_FAIL',
          message: 'Gate fail',
          question: null,
          blocksSearch: true
        },
        langCtx,
        'en'
      );

      publishAssistantMessage(
        mockWsManager,
        'req-consistency',
        'sess-consistency',
        {
          type: 'CLARIFY',
          message: 'Clarify',
          question: 'Question?',
          blocksSearch: true
        },
        langCtx,
        'en'
      );

      publishAssistantMessage(
        mockWsManager,
        'req-consistency',
        'sess-consistency',
        {
          type: 'SUMMARY',
          message: 'Summary',
          question: null,
          blocksSearch: false
        },
        langCtx,
        'en'
      );

      // Extract all assistantLanguage values for this requestId
      const languages = publishedMessages
        .filter(m => m.requestId === 'req-consistency')
        .map(m => m.message.assistantLanguage);

      // All should be identical
      assert.strictEqual(languages.length, 3);
      assert.ok(languages.every(lang => lang === 'es'), 'All assistantLanguage values must be identical for same requestId');
    });

    it('should maintain language consistency even with different payload types', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'ru',
        assistantLanguageConfidence: 0.88,
        uiLanguage: 'ru',
        providerLanguage: 'ru',
        region: 'IL'
      };

      const assistantTypes = [
        'GATE_FAIL',
        'CLARIFY',
        'SUMMARY',
        'SEARCH_FAILED',
        'GENERIC_QUERY_NARRATION',
        'NUDGE_REFINE'
      ] as const;

      assistantTypes.forEach(type => {
        publishAssistantMessage(
          mockWsManager,
          'req-types',
          'sess-types',
          {
            type,
            message: `Message for ${type}`,
            question: null,
            blocksSearch: false
          },
          langCtx,
          'en'
        );
      });

      const languages = publishedMessages
        .filter(m => m.requestId === 'req-types')
        .map(m => m.message.assistantLanguage);

      assert.strictEqual(languages.length, 6);
      assert.ok(languages.every(lang => lang === 'ru'), 'All assistantLanguage values must be identical across payload types');
    });
  });

  describe('all supported languages', () => {
    const supportedLanguages: Array<'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'> = [
      'he',
      'en',
      'ar',
      'ru',
      'fr',
      'es'
    ];

    supportedLanguages.forEach(lang => {
      it(`should correctly handle ${lang} as assistantLanguage`, () => {
        const langCtx: LangCtx = {
          assistantLanguage: lang,
          assistantLanguageConfidence: 0.9,
          uiLanguage: lang,
          providerLanguage: lang,
          region: 'IL'
        };

        publishAssistantMessage(
          mockWsManager,
          `req-${lang}`,
          `sess-${lang}`,
          {
            type: 'GATE_FAIL',
            message: 'Test message',
            question: null,
            blocksSearch: true
          },
          langCtx,
          'en'
        );

        const publishedMsg = publishedMessages[publishedMessages.length - 1].message;
        assert.strictEqual(publishedMsg.assistantLanguage, lang);
      });
    });
  });
});
