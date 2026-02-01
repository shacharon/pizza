/**
 * Gate Stop Language Lock Tests
 * 
 * Validates that Gate2 STOP/CLARIFY paths lock assistantLanguage to Gate2 output
 * WITHOUT applying threshold logic or fallback to English.
 * 
 * Fixes: Issue #1 - Lock assistantLanguage to Gate2 output on stop (no resolver/fallback)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { lockAssistantLanguageToGate2 } from '../orchestrator.helpers.js';
import { handleGateStop, handleGateClarify } from '../orchestrator.guards.js';
import { Route2Context, Gate2StageOutput } from '../types.js';
import { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';

describe('Gate Stop Language Lock', () => {
  describe('lockAssistantLanguageToGate2', () => {
    it('should lock to ar when Gate2 returns ar', () => {
      const result = lockAssistantLanguageToGate2('ar', 'ب مني 🇸🇦');
      expect(result).toBe('ar');
    });

    it('should lock to he when Gate2 returns he', () => {
      const result = lockAssistantLanguageToGate2('he', 'מסעדות בתל אביב');
      expect(result).toBe('he');
    });

    it('should lock to ru when Gate2 returns ru', () => {
      const result = lockAssistantLanguageToGate2('ru', 'ресторан');
      expect(result).toBe('ru');
    });

    it('should lock to en when Gate2 returns en', () => {
      const result = lockAssistantLanguageToGate2('en', 'pizza near me');
      expect(result).toBe('en');
    });

    it('should lock to fr when Gate2 returns fr', () => {
      const result = lockAssistantLanguageToGate2('fr', 'restaurant français');
      expect(result).toBe('fr');
    });

    it('should lock to es when Gate2 returns es', () => {
      const result = lockAssistantLanguageToGate2('es', 'restaurante español');
      expect(result).toBe('es');
    });

    it('should use deterministic Hebrew detection when Gate2 returns "other"', () => {
      const result = lockAssistantLanguageToGate2('other', 'מסעדות איטלקיות');
      expect(result).toBe('he');
    });

    it('should fallback to en when Gate2 returns "other" and no Hebrew detected', () => {
      const result = lockAssistantLanguageToGate2('other', 'привет мир');
      expect(result).toBe('en');
    });

    it('should fallback to en when Gate2 returns "other" and no query provided', () => {
      const result = lockAssistantLanguageToGate2('other');
      expect(result).toBe('en');
    });

    it('should NEVER return "other" (always resolves to supported language)', () => {
      const supportedLanguages = ['he', 'en', 'ar', 'ru', 'fr', 'es'];
      
      const testCases = [
        ['he', 'מסעדות'],
        ['en', 'pizza'],
        ['ar', 'ب مني'],
        ['ru', 'ресторан'],
        ['fr', 'restaurant'],
        ['es', 'restaurante'],
        ['other', undefined]
      ];

      for (const testCase of testCases) {
        const result = lockAssistantLanguageToGate2(testCase[0], testCase[1]);
        expect(supportedLanguages.includes(result)).toBe(true);
      }
    });
  });

  describe('handleGateStop - Language Enforcement', () => {
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

    it('should lock to ar for Arabic query with low confidence (no fallback to en)', async () => {
      const gateResult: Gate2StageOutput = {
        gate: {
          foodSignal: 'UNCERTAIN',
          language: 'ar',
          languageConfidence: 0.5, // Below 0.7 threshold
          route: 'STOP',
          confidence: 0.5,
          stop: {
            type: 'GATE_FAIL',
            reason: 'NO_FOOD',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'يرجى تحديد نوع الطعام',
            question: 'ما نوع الطعام الذي تبحث عنه؟'
          }
        }
      };

      const ctx: Route2Context = {
        requestId: 'test-req-ar',
        startTime: Date.now(),
        llmProvider: 'openai',
        query: 'ب مني 🇸🇦'
      };

      const result = await handleGateStop(
        { query: 'ب مني 🇸🇦', sessionId: 'test-session' } as any,
        gateResult,
        ctx,
        mockWsManager
      );

      expect(result).toBeTruthy();
      expect(ctx.langCtx?.assistantLanguage).toBe('ar');
      expect(publishedMessages.length).toBe(1);
      expect(publishedMessages[0].message.payload.language).toBe('ar');
      expect(publishedMessages[0].message.payload.message).toBe('يرجى تحديد نوع الطعام');
    });

    it('should lock to he for Hebrew query with low confidence', async () => {
      const gateResult: Gate2StageOutput = {
        gate: {
          foodSignal: 'UNCERTAIN',
          language: 'he',
          languageConfidence: 0.6, // Below 0.7 threshold
          route: 'STOP',
          confidence: 0.6,
          stop: {
            type: 'GATE_FAIL',
            reason: 'NO_FOOD',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'אנא ציין סוג אוכל',
            question: 'איזה סוג אוכל אתה מחפש?'
          }
        }
      };

      const ctx: Route2Context = {
        requestId: 'test-req-he',
        startTime: Date.now(),
        llmProvider: 'openai',
        query: 'מה יש לאכול'
      };

      const result = await handleGateStop(
        { query: 'מה יש לאכול', sessionId: 'test-session' } as any,
        gateResult,
        ctx,
        mockWsManager
      );

      expect(result).toBeTruthy();
      expect(ctx.langCtx?.assistantLanguage).toBe('he');
      expect(publishedMessages.length).toBe(1);
      expect(publishedMessages[0].message.payload.language).toBe('he');
      expect(publishedMessages[0].message.payload.message).toBe('אנא ציין סוג אוכל');
    });

    it('should NOT call resolveAssistantLanguage (no fallback to en)', async () => {
      const gateResult: Gate2StageOutput = {
        gate: {
          foodSignal: 'UNCERTAIN',
          language: 'ar',
          languageConfidence: 0.4, // Very low confidence
          route: 'STOP',
          confidence: 0.4,
          stop: {
            type: 'GATE_FAIL',
            reason: 'NO_FOOD',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'يرجى تحديد نوع الطعام',
            question: 'ما نوع الطعام الذي تبحث عنه؟'
          }
        }
      };

      const ctx: Route2Context = {
        requestId: 'test-req-no-fallback',
        startTime: Date.now(),
        llmProvider: 'openai',
        query: 'ب مني'
      };

      await handleGateStop(
        { query: 'ب مني', sessionId: 'test-session' } as any,
        gateResult,
        ctx,
        mockWsManager
      );

      expect(ctx.langCtx?.assistantLanguage).toBe('ar');
      expect(ctx.langCtx?.assistantLanguage).not.toBe('en');
    });
  });

  describe('handleGateClarify - Language Enforcement', () => {
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

    it('should lock to ar for Arabic query with low confidence (CLARIFY path)', async () => {
      const gateResult: Gate2StageOutput = {
        gate: {
          foodSignal: 'UNCERTAIN',
          language: 'ar',
          languageConfidence: 0.5, // Below 0.7 threshold
          route: 'ASK_CLARIFY',
          confidence: 0.5,
          stop: {
            type: 'CLARIFY',
            reason: 'UNCERTAIN_DOMAIN',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'هل تبحث عن مطعم أم شيء آخر؟',
            question: 'يرجى توضيح ما تبحث عنه'
          }
        }
      };

      const ctx: Route2Context = {
        requestId: 'test-req-clarify-ar',
        startTime: Date.now(),
        llmProvider: 'openai',
        query: 'ب مني 🇸🇦'
      };

      const result = await handleGateClarify(
        { query: 'ب مني 🇸🇦', sessionId: 'test-session' } as any,
        gateResult,
        ctx,
        mockWsManager
      );

      expect(result).toBeTruthy();
      expect(ctx.langCtx?.assistantLanguage).toBe('ar');
      expect(publishedMessages.length).toBe(1);
      expect(publishedMessages[0].message.payload.language).toBe('ar');
      expect(publishedMessages[0].message.payload.type).toBe('CLARIFY');
    });

    it('should lock to he for Hebrew query with low confidence (CLARIFY path)', async () => {
      const gateResult: Gate2StageOutput = {
        gate: {
          foodSignal: 'UNCERTAIN',
          language: 'he',
          languageConfidence: 0.55, // Below 0.7 threshold
          route: 'ASK_CLARIFY',
          confidence: 0.55,
          stop: {
            type: 'CLARIFY',
            reason: 'UNCERTAIN_DOMAIN',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'האם אתה מחפש מסעדה או משהו אחר?',
            question: 'אנא הבהר מה אתה מחפש'
          }
        }
      };

      const ctx: Route2Context = {
        requestId: 'test-req-clarify-he',
        startTime: Date.now(),
        llmProvider: 'openai',
        query: 'מה לאכול'
      };

      const result = await handleGateClarify(
        { query: 'מה לאכול', sessionId: 'test-session' } as any,
        gateResult,
        ctx,
        mockWsManager
      );

      expect(result).toBeTruthy();
      expect(ctx.langCtx?.assistantLanguage).toBe('he');
      expect(publishedMessages.length).toBe(1);
      expect(publishedMessages[0].message.payload.language).toBe('he');
    });
  });

  describe('Regression: Prevent fallback to English on low confidence', () => {
    it('should NOT fallback to en when ar confidence < 0.7', () => {
      const result = lockAssistantLanguageToGate2('ar', 'ب مني');
      expect(result).toBe('ar');
      expect(result).not.toBe('en');
    });

    it('should NOT fallback to en when he confidence < 0.7', () => {
      const result = lockAssistantLanguageToGate2('he', 'מה לאכול');
      expect(result).toBe('he');
      expect(result).not.toBe('en');
    });

    it('should NOT fallback to en when ru confidence < 0.7', () => {
      const result = lockAssistantLanguageToGate2('ru', 'ресторан');
      expect(result).toBe('ru');
      expect(result).not.toBe('en');
    });
  });
});
