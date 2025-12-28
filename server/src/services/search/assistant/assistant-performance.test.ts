/**
 * Assistant Performance Integration Tests
 * Tests to validate the Performance Policy: Template/Cache/LLM strategy
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AssistantNarrationService } from './assistant-narration.service.js';
import type { TruthState } from '../types/truth-state.types.js';
import type { AssistantContext } from '../types/truth-state.types.js';
import type { LLMProvider } from '../../../types/llm.types.js';
import { caches } from '../../../lib/cache/cache-manager.js';

// Mock LLM Provider
const createMockLLM = (): LLMProvider => ({
  completeJSON: jest.fn(async () => ({
    message: 'LLM generated message',
    primaryActionId: 'test-action',
    secondaryActionIds: [],
  })),
  complete: jest.fn(async () => 'LLM response'),
});

describe('Assistant Performance Integration Tests', () => {
  let service: AssistantNarrationService;
  let mockLLM: LLMProvider;

  beforeEach(() => {
    mockLLM = createMockLLM();
    service = new AssistantNarrationService(mockLLM);
    
    // Clear cache before each test
    caches.assistantNarration.clear();
  });

  describe('Template Strategy (0ms, no LLM)', () => {
    it('should use template for high-confidence NORMAL and skip LLM', async () => {
      const context: AssistantContext = {
        mode: 'NORMAL',
        language: 'en',
        resultsCount: 5,
        failureReason: 'NONE',
        canonical: { category: 'pizza', locationText: 'Tel Aviv' },
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'NORMAL',
        confidence: 0.9,
        results: [
          { placeId: 'test1', name: 'Pizza Place 1' } as any,
          { placeId: 'test2', name: 'Pizza Place 2' } as any,
          { placeId: 'test3', name: 'Pizza Place 3' } as any,
        ],
        failureReason: 'NONE',
        intent: { canonical: { category: 'pizza', locationText: 'Tel Aviv' }, filters: {} } as any,
        language: 'en',
      };

      const startTime = Date.now();
      const result = await service.generateFast(context, truthState as TruthState);
      const duration = Date.now() - startTime;

      // Assertions
      expect(result.usedTemplate).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(result.message).toContain('3'); // Should mention result count
      expect(duration).toBeLessThan(50); // Should be < 50ms
      expect(mockLLM.completeJSON).not.toHaveBeenCalled(); // LLM should NOT be called
    });

    it('should generate template in Hebrew', async () => {
      const context: AssistantContext = {
        mode: 'NORMAL',
        language: 'he',
        resultsCount: 10,
        failureReason: 'NONE',
        canonical: { category: 'סושי', locationText: 'תל אביב' },
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'NORMAL',
        confidence: 0.85,
        results: Array(10).fill({ placeId: 'test', name: 'Test' } as any),
        failureReason: 'NONE',
        intent: { canonical: { category: 'סושי', locationText: 'תל אביב' }, filters: {} } as any,
        language: 'he',
      };

      const result = await service.generateFast(context, truthState as TruthState);

      expect(result.usedTemplate).toBe(true);
      expect(result.message).toContain('10');
      expect(mockLLM.completeJSON).not.toHaveBeenCalled();
    });
  });

  describe('Cache Strategy (< 10ms)', () => {
    it('should cache LLM result and return cached on second call', async () => {
      const context: AssistantContext = {
        mode: 'NORMAL',
        language: 'en',
        resultsCount: 3,
        failureReason: 'NONE',
        canonical: { category: 'burger', locationText: 'Jerusalem' },
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'NORMAL',
        confidence: 0.7, // Below 0.8 → CACHE strategy
        results: [
          { placeId: 'test1', name: 'Burger 1' } as any,
          { placeId: 'test2', name: 'Burger 2' } as any,
        ],
        failureReason: 'NONE',
        intent: { canonical: { category: 'burger', locationText: 'Jerusalem' }, filters: {} } as any,
        language: 'en',
      };

      // First call: should hit LLM and cache result
      const firstResult = await service.generateFast(context, truthState as TruthState);
      
      expect(firstResult.usedTemplate).toBe(false);
      expect(firstResult.fromCache).toBe(false);
      expect(mockLLM.completeJSON).toHaveBeenCalledTimes(1);

      // Second call: should return from cache
      const startTime = Date.now();
      const secondResult = await service.generateFast(context, truthState as TruthState);
      const duration = Date.now() - startTime;

      expect(secondResult.fromCache).toBe(true);
      expect(secondResult.usedTemplate).toBe(false);
      expect(duration).toBeLessThan(10); // Should be < 10ms
      expect(mockLLM.completeJSON).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should generate different cache keys for different queries', async () => {
      const baseContext: AssistantContext = {
        mode: 'NORMAL',
        language: 'en',
        resultsCount: 2,
        failureReason: 'NONE',
        chipAllowlist: [],
      };

      const baseTruthState: Partial<TruthState> = {
        mode: 'NORMAL',
        confidence: 0.7,
        results: [{ placeId: 'test1', name: 'Test' } as any],
        failureReason: 'NONE',
        intent: { canonical: {}, filters: {} } as any,
        language: 'en',
      };

      // Query 1: Pizza in Tel Aviv
      const context1 = { ...baseContext, canonical: { category: 'pizza', locationText: 'Tel Aviv' } };
      const truthState1 = {
        ...baseTruthState,
        intent: { canonical: { category: 'pizza', locationText: 'Tel Aviv' }, filters: {} } as any,
      };
      await service.generateFast(context1, truthState1 as TruthState);

      // Query 2: Sushi in Haifa (different query)
      const context2 = { ...baseContext, canonical: { category: 'sushi', locationText: 'Haifa' } };
      const truthState2 = {
        ...baseTruthState,
        intent: { canonical: { category: 'sushi', locationText: 'Haifa' }, filters: {} } as any,
      };
      await service.generateFast(context2, truthState2 as TruthState);

      // Both should call LLM (different cache keys)
      expect(mockLLM.completeJSON).toHaveBeenCalledTimes(2);
    });
  });

  describe('LLM Strategy (RECOVERY and CLARIFY)', () => {
    it('should always use LLM for RECOVERY mode', async () => {
      const context: AssistantContext = {
        mode: 'RECOVERY',
        language: 'en',
        resultsCount: 0,
        failureReason: 'NO_RESULTS',
        canonical: {},
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'RECOVERY',
        confidence: 0.9, // Even with high confidence
        results: [],
        failureReason: 'NO_RESULTS',
        intent: { canonical: {}, filters: {} } as any,
        language: 'en',
      };

      const result = await service.generateFast(context, truthState as TruthState);

      expect(result.usedTemplate).toBe(false);
      expect(mockLLM.completeJSON).toHaveBeenCalledTimes(1);
    });

    it('should always use LLM for CLARIFY mode', async () => {
      const context: AssistantContext = {
        mode: 'CLARIFY',
        language: 'he',
        resultsCount: 0,
        failureReason: 'NONE',
        canonical: {},
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'CLARIFY',
        confidence: 0.4,
        results: [],
        failureReason: 'NONE',
        intent: { canonical: {}, filters: {} } as any,
        language: 'he',
      };

      const result = await service.generateFast(context, truthState as TruthState);

      expect(result.usedTemplate).toBe(false);
      expect(mockLLM.completeJSON).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance Targets', () => {
    it('should complete template generation in < 50ms', async () => {
      const context: AssistantContext = {
        mode: 'NORMAL',
        language: 'en',
        resultsCount: 5,
        failureReason: 'NONE',
        canonical: { category: 'italian', locationText: 'Haifa' },
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'NORMAL',
        confidence: 0.9,
        results: Array(5).fill({ placeId: 'test', name: 'Test' } as any),
        failureReason: 'NONE',
        intent: { canonical: { category: 'italian', locationText: 'Haifa' }, filters: {} } as any,
        language: 'en',
      };

      const startTime = Date.now();
      await service.generateFast(context, truthState as TruthState);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should complete cache hit in < 10ms', async () => {
      const context: AssistantContext = {
        mode: 'NORMAL',
        language: 'en',
        resultsCount: 3,
        failureReason: 'NONE',
        canonical: { category: 'thai', locationText: 'Netanya' },
        chipAllowlist: [],
      };

      const truthState: Partial<TruthState> = {
        mode: 'NORMAL',
        confidence: 0.75,
        results: Array(3).fill({ placeId: 'test', name: 'Test' } as any),
        failureReason: 'NONE',
        intent: { canonical: { category: 'thai', locationText: 'Netanya' }, filters: {} } as any,
        language: 'en',
      };

      // Populate cache
      await service.generateFast(context, truthState as TruthState);

      // Measure cache hit
      const startTime = Date.now();
      await service.generateFast(context, truthState as TruthState);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10);
    });
  });
});

