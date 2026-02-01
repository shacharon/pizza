/**
 * Assistant Message Mapper Tests
 * Tests for pure WS message transformation functions
 */

import {
  isValidLLMType,
  extractAssistantMessage,
  generateMessageId,
  extractMessageText,
  doesMessageBlockSearch
} from './assistant-message.mapper';
import type { RawAssistantPayload } from './assistant-message.mapper';

describe('Assistant Message Mapper', () => {
  describe('isValidLLMType', () => {
    it('should return true for CLARIFY', () => {
      expect(isValidLLMType('CLARIFY')).toBe(true);
    });

    it('should return true for SUMMARY', () => {
      expect(isValidLLMType('SUMMARY')).toBe(true);
    });

    it('should return true for GATE_FAIL', () => {
      expect(isValidLLMType('GATE_FAIL')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isValidLLMType('INVALID')).toBe(false);
      expect(isValidLLMType('PROGRESS')).toBe(false);
      expect(isValidLLMType('WS_STATUS')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidLLMType(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidLLMType('')).toBe(false);
    });
  });

  describe('extractAssistantMessage', () => {
    it('should extract valid SUMMARY message', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-123',
        payload: {
          type: 'SUMMARY',
          message: 'Found 10 Italian restaurants'
        }
      };

      const result = extractAssistantMessage(rawMessage, 'req-123');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('SUMMARY');
      expect(result?.message).toBe('Found 10 Italian restaurants');
      expect(result?.requestId).toBe('req-123');
      expect(result?.blocksSearch).toBe(false);
      expect(result?.question).toBeNull();
    });

    it('should extract CLARIFY message with question', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-456',
        payload: {
          type: 'CLARIFY',
          question: 'Do you want Italian or Chinese?',
          blocksSearch: true
        }
      };

      const result = extractAssistantMessage(rawMessage, 'req-456');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('CLARIFY');
      expect(result?.message).toBe('Do you want Italian or Chinese?');
      expect(result?.question).toBe('Do you want Italian or Chinese?');
      expect(result?.blocksSearch).toBe(true);
    });

    it('should extract GATE_FAIL message', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-789',
        payload: {
          type: 'GATE_FAIL',
          message: 'Query not food-related'
        }
      };

      const result = extractAssistantMessage(rawMessage, 'req-789');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('GATE_FAIL');
      expect(result?.message).toBe('Query not food-related');
    });

    it('should return null for missing payload', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-123'
      };

      const result = extractAssistantMessage(rawMessage, 'req-123');
      expect(result).toBeNull();
    });

    it('should return null for invalid type', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-123',
        payload: {
          type: 'INVALID_TYPE',
          message: 'Some message'
        }
      };

      const result = extractAssistantMessage(rawMessage, 'req-123');
      expect(result).toBeNull();
    });

    it('should return null for empty message', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-123',
        payload: {
          type: 'SUMMARY',
          message: ''
        }
      };

      const result = extractAssistantMessage(rawMessage, 'req-123');
      expect(result).toBeNull();
    });

    it('should generate stable ID', () => {
      const rawMessage = {
        type: 'assistant',
        requestId: 'req-123',
        payload: {
          type: 'SUMMARY',
          message: 'Test message'
        }
      };

      const result = extractAssistantMessage(rawMessage, 'req-123');
      expect(result?.id).toMatch(/^req-123-SUMMARY-\d+$/);
    });

    describe('Language Resolution', () => {
      it('should use envelope.assistantLanguage (priority 1)', () => {
        const rawMessage = {
          type: 'assistant',
          requestId: 'req-123',
          assistantLanguage: 'ru',
          payload: {
            type: 'SUMMARY',
            message: 'Test message',
            language: 'en' // Should be ignored
          }
        };

        const result = extractAssistantMessage(rawMessage, 'req-123', 'he');
        expect(result?.language).toBe('ru'); // envelope.assistantLanguage wins
      });

      it('should use payload.language if envelope.assistantLanguage missing (priority 2)', () => {
        const rawMessage = {
          type: 'assistant',
          requestId: 'req-123',
          payload: {
            type: 'SUMMARY',
            message: 'Test message',
            language: 'ar'
          }
        };

        const result = extractAssistantMessage(rawMessage, 'req-123', 'he');
        expect(result?.language).toBe('ar'); // payload.language is fallback
      });

      it('should use uiLanguageFallback if both envelope and payload missing (priority 3)', () => {
        const rawMessage = {
          type: 'assistant',
          requestId: 'req-123',
          payload: {
            type: 'SUMMARY',
            message: 'Test message'
          }
        };

        const result = extractAssistantMessage(rawMessage, 'req-123', 'he');
        expect(result?.language).toBe('he'); // uiLanguageFallback
      });

      it('should use "en" hard fallback if all sources missing (priority 4)', () => {
        const rawMessage = {
          type: 'assistant',
          requestId: 'req-123',
          payload: {
            type: 'SUMMARY',
            message: 'Test message'
          }
        };

        const result = extractAssistantMessage(rawMessage, 'req-123');
        expect(result?.language).toBe('en'); // hard fallback
      });

      it('should handle all supported languages', () => {
        const languages: Array<'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'> = ['he', 'en', 'ar', 'ru', 'fr', 'es'];
        
        for (const lang of languages) {
          const rawMessage = {
            type: 'assistant',
            requestId: 'req-123',
            assistantLanguage: lang,
            payload: {
              type: 'SUMMARY',
              message: 'Test message'
            }
          };

          const result = extractAssistantMessage(rawMessage, 'req-123');
          expect(result?.language).toBe(lang);
        }
      });
    });
  });

  describe('generateMessageId', () => {
    it('should generate ID with all components', () => {
      const id = generateMessageId('req-123', 'SUMMARY', 1234567890);
      expect(id).toBe('req-123-SUMMARY-1234567890');
    });

    it('should be deterministic for same inputs', () => {
      const id1 = generateMessageId('req-456', 'CLARIFY', 9876543210);
      const id2 = generateMessageId('req-456', 'CLARIFY', 9876543210);
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different timestamps', () => {
      const id1 = generateMessageId('req-123', 'SUMMARY', 1000);
      const id2 = generateMessageId('req-123', 'SUMMARY', 2000);
      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different types', () => {
      const id1 = generateMessageId('req-123', 'SUMMARY', 1000);
      const id2 = generateMessageId('req-123', 'CLARIFY', 1000);
      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different requestIds', () => {
      const id1 = generateMessageId('req-123', 'SUMMARY', 1000);
      const id2 = generateMessageId('req-456', 'SUMMARY', 1000);
      expect(id1).not.toBe(id2);
    });
  });

  describe('extractMessageText', () => {
    it('should extract from message field', () => {
      const payload: RawAssistantPayload = {
        type: 'SUMMARY',
        message: 'Primary message text'
      };
      expect(extractMessageText(payload)).toBe('Primary message text');
    });

    it('should fallback to question field', () => {
      const payload: RawAssistantPayload = {
        type: 'CLARIFY',
        question: 'What do you prefer?'
      };
      expect(extractMessageText(payload)).toBe('What do you prefer?');
    });

    it('should prioritize message over question', () => {
      const payload: RawAssistantPayload = {
        type: 'CLARIFY',
        message: 'Main text',
        question: 'Question text'
      };
      expect(extractMessageText(payload)).toBe('Main text');
    });

    it('should return empty string if both missing', () => {
      const payload: RawAssistantPayload = {
        type: 'SUMMARY'
      };
      expect(extractMessageText(payload)).toBe('');
    });
  });

  describe('doesMessageBlockSearch', () => {
    it('should return true when blocksSearch is true', () => {
      const payload: RawAssistantPayload = {
        type: 'CLARIFY',
        message: 'Clarification needed',
        blocksSearch: true
      };
      expect(doesMessageBlockSearch(payload)).toBe(true);
    });

    it('should return false when blocksSearch is false', () => {
      const payload: RawAssistantPayload = {
        type: 'SUMMARY',
        message: 'Results found',
        blocksSearch: false
      };
      expect(doesMessageBlockSearch(payload)).toBe(false);
    });

    it('should return false when blocksSearch is missing', () => {
      const payload: RawAssistantPayload = {
        type: 'SUMMARY',
        message: 'Results found'
      };
      expect(doesMessageBlockSearch(payload)).toBe(false);
    });

    it('should return false when blocksSearch is undefined', () => {
      const payload: RawAssistantPayload = {
        type: 'SUMMARY',
        message: 'Results found',
        blocksSearch: undefined
      };
      expect(doesMessageBlockSearch(payload)).toBe(false);
    });
  });
});
