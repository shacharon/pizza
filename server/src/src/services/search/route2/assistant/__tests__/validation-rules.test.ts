/**
 * Validation Rules Tests
 */

import { validateMessageFormat, enforceInvariants, validateAndEnforceCorrectness } from '../validation-rules.js';
import type { AssistantOutput } from '../assistant-llm.service.js';
import type { AssistantContext } from '../fallback-messages.js';

describe('validation-rules', () => {
  describe('validateMessageFormat', () => {
    it('accepts valid 1-sentence message', () => {
      const result = validateMessageFormat('This is a valid message.', null);
      expect(result).toBeNull();
    });

    it('accepts valid 2-sentence message', () => {
      const result = validateMessageFormat('First sentence. Second sentence.', null);
      expect(result).toBeNull();
    });

    it('accepts valid 6-sentence message', () => {
      const result = validateMessageFormat('One. Two. Three. Four. Five. Six.', null);
      expect(result).toBeNull();
    });

    it('rejects message with >6 sentences', () => {
      const result = validateMessageFormat('One. Two. Three. Four. Five. Six. Seven.', null);
      expect(result).not.toBeNull();
      expect(result?.messageError).toContain('Too many sentences');
      expect(result?.messageError).toContain('7');
    });

    it('accepts valid 1-sentence question', () => {
      const result = validateMessageFormat('Message here.', 'What type of food?');
      expect(result).toBeNull();
    });

    it('rejects 2-sentence question', () => {
      const result = validateMessageFormat('Message here.', 'First question? Second question?');
      expect(result).not.toBeNull();
      expect(result?.questionError).toContain('Too many sentences');
    });

    it('rejects question with multiple question marks', () => {
      const result = validateMessageFormat('Message here.', 'What? Why?');
      expect(result).not.toBeNull();
      expect(result?.questionError).toContain('Too many question marks');
    });

    it('handles null question', () => {
      const result = validateMessageFormat('Valid message.', null);
      expect(result).toBeNull();
    });

    it('handles empty strings', () => {
      const result = validateMessageFormat('', null);
      expect(result).toBeNull(); // Empty counts as 1 sentence by default logic
    });
  });

  describe('enforceInvariants', () => {
    const mockRequestId = 'test-req-123';

    describe('CLARIFY context', () => {
      it('enforces blocksSearch=true', () => {
        const output: AssistantOutput = {
          type: 'CLARIFY',
          message: 'Test',
          question: 'Q?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: false // WRONG
        };

        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'en'
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.blocksSearch).toBe(true);
      });

      it('enforces suggestedAction=ASK_LOCATION for MISSING_LOCATION', () => {
        const output: AssistantOutput = {
          type: 'CLARIFY',
          message: 'Test',
          question: 'Q?',
          suggestedAction: 'NONE', // WRONG
          blocksSearch: true
        };

        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'en'
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.suggestedAction).toBe('ASK_LOCATION');
      });

      it('enforces suggestedAction=ASK_FOOD for MISSING_FOOD', () => {
        const output: AssistantOutput = {
          type: 'CLARIFY',
          message: 'Test',
          question: 'Q?',
          suggestedAction: 'RETRY', // WRONG
          blocksSearch: true
        };

        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_FOOD',
          query: 'Tel Aviv',
          language: 'en'
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.suggestedAction).toBe('ASK_FOOD');
      });
    });

    describe('SUMMARY context', () => {
      it('enforces blocksSearch=false', () => {
        const output: AssistantOutput = {
          type: 'SUMMARY',
          message: 'Test',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: true // WRONG
        };

        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza',
          language: 'en',
          resultCount: 10,
          top3Names: ['A', 'B', 'C']
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.blocksSearch).toBe(false);
      });

      it('enforces suggestedAction=NONE', () => {
        const output: AssistantOutput = {
          type: 'SUMMARY',
          message: 'Test',
          question: null,
          suggestedAction: 'RETRY', // WRONG
          blocksSearch: false
        };

        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza',
          language: 'en',
          resultCount: 10,
          top3Names: ['A', 'B', 'C']
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.suggestedAction).toBe('NONE');
      });
    });

    describe('GATE_FAIL context', () => {
      it('enforces blocksSearch=true', () => {
        const output: AssistantOutput = {
          type: 'GATE_FAIL',
          message: 'Test',
          question: null,
          suggestedAction: 'RETRY',
          blocksSearch: false // WRONG
        };

        const context: AssistantContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: 'weather',
          language: 'en'
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.blocksSearch).toBe(true);
      });

      it('enforces suggestedAction=RETRY', () => {
        const output: AssistantOutput = {
          type: 'GATE_FAIL',
          message: 'Test',
          question: null,
          suggestedAction: 'NONE', // WRONG
          blocksSearch: true
        };

        const context: AssistantContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: 'weather',
          language: 'en'
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.suggestedAction).toBe('RETRY');
      });
    });

    describe('GENERIC_QUERY_NARRATION context', () => {
      it('enforces blocksSearch=false', () => {
        const output: AssistantOutput = {
          type: 'GENERIC_QUERY_NARRATION',
          message: 'Test',
          question: 'Q?',
          suggestedAction: 'REFINE',
          blocksSearch: true // WRONG
        };

        const context: AssistantContext = {
          type: 'GENERIC_QUERY_NARRATION',
          query: 'restaurants',
          language: 'en',
          resultCount: 20,
          usedCurrentLocation: true
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.blocksSearch).toBe(false);
      });

      it('enforces suggestedAction=REFINE', () => {
        const output: AssistantOutput = {
          type: 'GENERIC_QUERY_NARRATION',
          message: 'Test',
          question: 'Q?',
          suggestedAction: 'RETRY', // WRONG
          blocksSearch: false
        };

        const context: AssistantContext = {
          type: 'GENERIC_QUERY_NARRATION',
          query: 'restaurants',
          language: 'en',
          resultCount: 20,
          usedCurrentLocation: true
        };

        const result = enforceInvariants(output, context, mockRequestId);

        expect(result.suggestedAction).toBe('REFINE');
      });
    });

    it('does not modify correct output', () => {
      const output: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Test',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const context: AssistantContext = {
        type: 'SUMMARY',
        query: 'pizza',
        language: 'en',
        resultCount: 10,
        top3Names: ['A', 'B', 'C']
      };

      const result = enforceInvariants(output, context, mockRequestId);

      expect(result).toEqual(output);
    });
  });

  describe('validateAndEnforceCorrectness', () => {
    const mockRequestId = 'test-req-456';

    it('accepts valid Hebrew message for he language', () => {
      const output: AssistantOutput = {
        type: 'CLARIFY',
        message: 'שלום עולם',
        question: 'איך אתה?',
        suggestedAction: 'ASK_LOCATION',
        blocksSearch: true
      };

      const context: AssistantContext = {
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        query: 'pizza',
        language: 'he'
      };

      const result = validateAndEnforceCorrectness(output, 'he', context, mockRequestId);

      expect(result.message).toBe('שלום עולם');
    });

    it('rejects English message for he language (uses fallback)', () => {
      const output: AssistantOutput = {
        type: 'CLARIFY',
        message: 'Hello world',
        question: 'How are you?',
        suggestedAction: 'ASK_LOCATION',
        blocksSearch: true
      };

      const context: AssistantContext = {
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        query: 'pizza',
        language: 'he'
      };

      const result = validateAndEnforceCorrectness(output, 'he', context, mockRequestId);

      // Should use Hebrew fallback
      expect(result.message).not.toBe('Hello world');
      expect(/[\u0590-\u05FF]/.test(result.message)).toBe(true);
    });

    it('accepts English message for en language', () => {
      const output: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Found some results.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const context: AssistantContext = {
        type: 'SUMMARY',
        query: 'pizza',
        language: 'en',
        resultCount: 10,
        top3Names: ['A', 'B', 'C']
      };

      const result = validateAndEnforceCorrectness(output, 'en', context, mockRequestId);

      expect(result.message).toBe('Found some results.');
    });

    it('rejects message with too many sentences (uses fallback)', () => {
      const longMessage = 'One. Two. Three. Four. Five. Six. Seven.';
      const output: AssistantOutput = {
        type: 'SUMMARY',
        message: longMessage,
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const context: AssistantContext = {
        type: 'SUMMARY',
        query: 'pizza',
        language: 'en',
        resultCount: 10,
        top3Names: ['A', 'B', 'C']
      };

      const result = validateAndEnforceCorrectness(output, 'en', context, mockRequestId);

      expect(result.message).not.toBe(longMessage);
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('rejects question with multiple question marks (uses fallback)', () => {
      const output: AssistantOutput = {
        type: 'CLARIFY',
        message: 'Valid message.',
        question: 'What? Why?',
        suggestedAction: 'ASK_LOCATION',
        blocksSearch: true
      };

      const context: AssistantContext = {
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        query: 'pizza',
        language: 'en'
      };

      const result = validateAndEnforceCorrectness(output, 'en', context, mockRequestId);

      expect(result.question).not.toBe('What? Why?');
    });

    it('accepts Russian message for ru language', () => {
      const output: AssistantOutput = {
        type: 'GATE_FAIL',
        message: 'Привет мир',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };

      const context: AssistantContext = {
        type: 'GATE_FAIL',
        reason: 'NO_FOOD',
        query: 'weather',
        language: 'ru'
      };

      const result = validateAndEnforceCorrectness(output, 'ru', context, mockRequestId);

      expect(result.message).toBe('Привет мир');
    });

    it('accepts Arabic message for ar language', () => {
      const output: AssistantOutput = {
        type: 'SEARCH_FAILED',
        message: 'مرحبا بالعالم',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };

      const context: AssistantContext = {
        type: 'SEARCH_FAILED',
        reason: 'GOOGLE_TIMEOUT',
        query: 'pizza',
        language: 'ar'
      };

      const result = validateAndEnforceCorrectness(output, 'ar', context, mockRequestId);

      expect(result.message).toBe('مرحبا بالعالم');
    });
  });
});
