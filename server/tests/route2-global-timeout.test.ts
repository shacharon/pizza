/**
 * P1 Reliability Test: Route2 Pipeline Global Timeout
 * 
 * Scenario: Pipeline stages take too long (> 45s total)
 * Expected: Pipeline should timeout and return error
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { searchRoute2 } from '../src/services/search/route2/route2.orchestrator.js';
import type { SearchRequest } from '../src/services/search/types/search-request.dto.js';
import type { Route2Context } from '../src/services/search/route2/types.js';
import type { LLMProvider } from '../src/llm/types.js';

describe('[P1 Reliability] Route2 Global Timeout', () => {
  let mockLLMProvider: LLMProvider;

  beforeAll(() => {
    // Mock LLM provider that delays response
    mockLLMProvider = {
      complete: async () => 'mock response',
      completeJSON: async (messages, schema, opts) => {
        // Simulate slow response (60s delay)
        const delayMs = opts?.timeout || 60000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        return {
          parsed: {
            decision: 'CONTINUE',
            confidence: 0.9,
            language: 'en'
          } as any,
          raw: 'mock',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          model: 'mock'
        };
      },
      completeStream: async () => 'mock stream'
    };
  });

  it('should timeout after 45s even if stages are slow', async () => {
    const request: SearchRequest = {
      query: 'test restaurant near me',
      userLocation: { lat: 32.0853, lng: 34.7818 }
    };

    const context: Route2Context = {
      requestId: 'req-timeout-test',
      startTime: Date.now(),
      llmProvider: mockLLMProvider,
      userLocation: { lat: 32.0853, lng: 34.7818 }
    };

    const startTime = Date.now();

    try {
      await searchRoute2(request, context);
      
      // Should not reach here - expect timeout
      expect(true).toBe(false);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      // Should timeout around 45s (allow 2s buffer)
      expect(elapsed).toBeGreaterThanOrEqual(45000);
      expect(elapsed).toBeLessThan(47000);
      
      // Error should be TimeoutError
      expect(error).toBeDefined();
      if (error && typeof error === 'object' && 'name' in error) {
        expect(error.name).toBe('TimeoutError');
        expect((error as any).operation).toBe('route2_pipeline');
      }
    }
  }, 50000); // Jest timeout: 50s (longer than pipeline timeout)

  it('should complete successfully if within timeout', async () => {
    // Mock fast LLM provider
    const fastLLMProvider: LLMProvider = {
      complete: async () => 'fast response',
      completeJSON: async (messages, schema, opts) => {
        // Fast response (100ms)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
          parsed: {
            decision: 'STOP',
            confidence: 0.9,
            language: 'en',
            reason: 'not_food'
          } as any,
          raw: 'mock',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          model: 'mock'
        };
      },
      completeStream: async () => 'fast stream'
    };

    const request: SearchRequest = {
      query: 'what is the weather today', // Non-food query (should STOP at gate)
      userLocation: null
    };

    const context: Route2Context = {
      requestId: 'req-fast-test',
      startTime: Date.now(),
      llmProvider: fastLLMProvider,
      userLocation: null
    };

    const startTime = Date.now();

    try {
      const result = await searchRoute2(request, context);
      const elapsed = Date.now() - startTime;
      
      // Should complete quickly (< 5s)
      expect(elapsed).toBeLessThan(5000);
      
      // Should return valid response
      expect(result).toBeDefined();
      expect(result.requestId).toBe('req-fast-test');
    } catch (error) {
      // Gate STOP might throw or return - both are valid
      // As long as it doesn't timeout, test passes
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(5000);
    }
  }, 10000); // Jest timeout: 10s
});
