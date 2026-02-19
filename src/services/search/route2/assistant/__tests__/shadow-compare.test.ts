/**
 * Shadow Compare Tests
 */

import { compareShadowOutputs } from '../shadow-compare.js';
import type { AssistantOutput } from '../assistant-llm.service.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

// Mock logger
jest.mock('../../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('shadow-compare', () => {
  const mockRequestId = 'test-req-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('compareShadowOutputs', () => {
    it('logs nothing when outputs match exactly', () => {
      const output: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Found some great results.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      compareShadowOutputs(output, output, mockRequestId, 'test-experiment');

      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_matched'
        }),
        expect.any(String)
      );
    });

    it('detects language divergence', () => {
      const controlOutput: AssistantOutput = {
        type: 'CLARIFY',
        message: 'Hello world',
        question: 'What food?',
        suggestedAction: 'ASK_FOOD',
        blocksSearch: true
      };

      const experimentOutput: AssistantOutput = {
        type: 'CLARIFY',
        message: 'שלום עולם',
        question: 'איזה אוכל?',
        suggestedAction: 'ASK_FOOD',
        blocksSearch: true
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'lang-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('language')
          ])
        }),
        expect.any(String)
      );
    });

    it('detects hasQuestion divergence', () => {
      const controlOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Found results.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const experimentOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Found results.',
        question: 'Want more details?',
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'question-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('hasQuestion')
          ])
        }),
        expect.any(String)
      );
    });

    it('detects message length bucket divergence', () => {
      const controlOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Short.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const experimentOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'This is a much longer message that exceeds the short bucket threshold and falls into medium or long category.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'length-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('messageLengthBucket')
          ])
        }),
        expect.any(String)
      );
    });

    it('detects type divergence', () => {
      const controlOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Test',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const experimentOutput: AssistantOutput = {
        type: 'CLARIFY',
        message: 'Test',
        question: 'What?',
        suggestedAction: 'ASK_FOOD',
        blocksSearch: true
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'type-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('type')
          ])
        }),
        expect.any(String)
      );
    });

    it('detects suggestedAction divergence', () => {
      const controlOutput: AssistantOutput = {
        type: 'SEARCH_FAILED',
        message: 'Error occurred',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };

      const experimentOutput: AssistantOutput = {
        type: 'SEARCH_FAILED',
        message: 'Error occurred',
        question: null,
        suggestedAction: 'EXPAND_RADIUS',
        blocksSearch: true
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'action-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('suggestedAction')
          ])
        }),
        expect.any(String)
      );
    });

    it('detects blocksSearch divergence', () => {
      const controlOutput: AssistantOutput = {
        type: 'GENERIC_QUERY_NARRATION',
        message: 'Test',
        question: 'Q?',
        suggestedAction: 'REFINE',
        blocksSearch: false
      };

      const experimentOutput: AssistantOutput = {
        type: 'GENERIC_QUERY_NARRATION',
        message: 'Test',
        question: 'Q?',
        suggestedAction: 'REFINE',
        blocksSearch: true
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'blocks-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('blocksSearch')
          ])
        }),
        expect.any(String)
      );
    });

    it('detects multiple divergences', () => {
      const controlOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Short English text.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const experimentOutput: AssistantOutput = {
        type: 'CLARIFY',
        message: 'שלום עולם - this is a much longer message in Hebrew that exceeds the threshold',
        question: 'איזה אוכל?',
        suggestedAction: 'ASK_FOOD',
        blocksSearch: true
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'multi-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'assistant_shadow_diverged',
          divergences: expect.arrayContaining([
            expect.stringContaining('language'),
            expect.stringContaining('hasQuestion'),
            expect.stringContaining('messageLengthBucket'),
            expect.stringContaining('type'),
            expect.stringContaining('suggestedAction'),
            expect.stringContaining('blocksSearch')
          ])
        }),
        expect.any(String)
      );
    });

    it('includes experiment name in logs', () => {
      const output: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Test',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      compareShadowOutputs(output, output, mockRequestId, 'my-experiment-v2');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          experimentName: 'my-experiment-v2'
        }),
        expect.any(String)
      );
    });

    it('includes message previews in divergence logs', () => {
      const controlOutput: AssistantOutput = {
        type: 'SUMMARY',
        message: 'Control message that is different',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      const experimentOutput: AssistantOutput = {
        type: 'CLARIFY',
        message: 'Experiment message that is different',
        question: 'Q?',
        suggestedAction: 'ASK_FOOD',
        blocksSearch: true
      };

      compareShadowOutputs(controlOutput, experimentOutput, mockRequestId, 'preview-test');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          controlMessagePreview: expect.stringContaining('Control message'),
          experimentMessagePreview: expect.stringContaining('Experiment message')
        }),
        expect.any(String)
      );
    });
  });
});
