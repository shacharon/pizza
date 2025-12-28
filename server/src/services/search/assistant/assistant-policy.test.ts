/**
 * Assistant Policy Unit Tests
 * Tests for the decision logic: when to use Template vs Cache vs LLM
 */

import { describe, it, expect } from '@jest/globals';
import { AssistantPolicy } from './assistant-policy.js';
import type { TruthState } from '../types/truth-state.types.js';

describe('AssistantPolicy', () => {
  describe('decide()', () => {
    describe('RECOVERY mode', () => {
      it('should always use LLM for RECOVERY mode', () => {
        const truthState: Partial<TruthState> = {
          mode: 'RECOVERY',
          confidence: 0.9,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('LLM');
        expect(decision.reason).toBe('RECOVERY_mode_requires_llm');
        expect(decision.skipLLM).toBe(false);
      });

      it('should use LLM for RECOVERY even with no results', () => {
        const truthState: Partial<TruthState> = {
          mode: 'RECOVERY',
          confidence: 0.3,
          results: [],
          failureReason: 'NO_RESULTS',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('LLM');
        expect(decision.skipLLM).toBe(false);
      });
    });

    describe('CLARIFY mode', () => {
      it('should always use LLM for CLARIFY mode', () => {
        const truthState: Partial<TruthState> = {
          mode: 'CLARIFY',
          confidence: 0.4,
          results: [],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('LLM');
        expect(decision.reason).toBe('CLARIFY_mode_requires_llm');
        expect(decision.skipLLM).toBe(false);
      });

      it('should use LLM for CLARIFY with results', () => {
        const truthState: Partial<TruthState> = {
          mode: 'CLARIFY',
          confidence: 0.9,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('LLM');
        expect(decision.skipLLM).toBe(false);
      });
    });

    describe('NORMAL mode - Template strategy', () => {
      it('should use TEMPLATE for high-confidence NORMAL with results', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.85,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('TEMPLATE');
        expect(decision.reason).toBe('high_confidence_normal');
        expect(decision.skipLLM).toBe(true);
      });

      it('should use TEMPLATE when confidence is exactly 0.8', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.8,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('TEMPLATE');
        expect(decision.skipLLM).toBe(true);
      });

      it('should use TEMPLATE with multiple results', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.95,
          results: [
            { placeId: 'test1', name: 'Test 1' } as any,
            { placeId: 'test2', name: 'Test 2' } as any,
            { placeId: 'test3', name: 'Test 3' } as any,
          ],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('TEMPLATE');
        expect(decision.skipLLM).toBe(true);
      });
    });

    describe('NORMAL mode - CACHE strategy', () => {
      it('should use CACHE for NORMAL with confidence < 0.8', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.7,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('CACHE');
        expect(decision.reason).toBe('normal_mode_cacheable');
        expect(decision.skipLLM).toBe(false);
      });

      it('should use CACHE for NORMAL with no results', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.9,
          results: [],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('CACHE');
        expect(decision.skipLLM).toBe(false);
      });

      it('should use CACHE for NORMAL with failure reason', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.85,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'API_ERROR',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('CACHE');
        expect(decision.skipLLM).toBe(false);
      });

      it('should use CACHE for edge case: confidence 0.79', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0.79,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('CACHE');
        expect(decision.skipLLM).toBe(false);
      });

      it('should use CACHE for undefined confidence (default 0)', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: undefined,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('CACHE');
        expect(decision.skipLLM).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle zero confidence', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 0,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('CACHE');
        expect(decision.skipLLM).toBe(false);
      });

      it('should handle perfect confidence (1.0)', () => {
        const truthState: Partial<TruthState> = {
          mode: 'NORMAL',
          confidence: 1.0,
          results: [{ placeId: 'test1', name: 'Test' } as any],
          failureReason: 'NONE',
        };

        const decision = AssistantPolicy.decide(truthState as TruthState);

        expect(decision.strategy).toBe('TEMPLATE');
        expect(decision.skipLLM).toBe(true);
      });
    });
  });

  describe('getCacheTTL()', () => {
    it('should return 30 minutes for NORMAL mode', () => {
      const ttl = AssistantPolicy.getCacheTTL('NORMAL');
      expect(ttl).toBe(1800000); // 30 * 60 * 1000
    });

    it('should return 10 minutes for RECOVERY mode', () => {
      const ttl = AssistantPolicy.getCacheTTL('RECOVERY');
      expect(ttl).toBe(600000); // 10 * 60 * 1000
    });

    it('should return 10 minutes for CLARIFY mode', () => {
      const ttl = AssistantPolicy.getCacheTTL('CLARIFY');
      expect(ttl).toBe(600000); // 10 * 60 * 1000
    });
  });
});

