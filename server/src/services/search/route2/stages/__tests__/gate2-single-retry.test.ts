/**
 * Gate2 Single-Layer Retry Test
 * Validates that Gate2 does NOT implement double-retry (Route2 + LLM client)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGate2Stage } from '../gate2.stage.js';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context } from '../../types.js';

describe('Gate2 Single-Layer Retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT retry at Route2 level when LLM client retries are exhausted', async () => {
    const mockRequest: SearchRequest = {
      query: 'pizza near me',
      uiLanguage: 'en'
    };

    const mockContext: Route2Context = {
      requestId: 'req-test-123',
      sessionId: 'sess-test',
      startTime: Date.now(),
      traceId: 'trace-test',
      timings: {}
    };

    // Mock LLM provider that always times out
    const mockLLMProvider: any = {
      completeJSON: vi.fn().mockRejectedValue(
        new Error('Timeout after 3 attempts') // LLM client already exhausted retries
      )
    };

    // Execute gate2 with mocked failing provider
    const result = await executeGate2Stage(mockRequest, mockContext, mockLLMProvider);

    // ASSERTION: completeJSON should be called EXACTLY ONCE
    // No second call means Route2 does NOT implement additional retry
    expect(mockLLMProvider.completeJSON).toHaveBeenCalledTimes(1);

    // Result should be error fallback (STOP route with low confidence)
    expect(result.gate).toBeDefined();
    expect(result.gate.foodSignal).toBe('NO');
    expect(result.gate.confidence).toBe(0.1);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe('GATE_TIMEOUT');
  });

  it('should use LLM result on first attempt success (no retry needed)', async () => {
    const mockRequest: SearchRequest = {
      query: 'sushi restaurants',
      uiLanguage: 'en'
    };

    const mockContext: Route2Context = {
      requestId: 'req-test-456',
      sessionId: 'sess-test',
      startTime: Date.now(),
      traceId: 'trace-test',
      timings: {}
    };

    // Mock LLM provider that succeeds on first try
    const mockLLMProvider: any = {
      completeJSON: vi.fn().mockResolvedValue({
        data: {
          foodSignal: 'YES',
          confidence: 0.95,
          assistantLanguage: 'en',
          assistantLanguageConfidence: 0.9,
          stop: null
        },
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'gpt-4o-mini'
      })
    };

    // Execute gate2
    const result = await executeGate2Stage(mockRequest, mockContext, mockLLMProvider);

    // ASSERTION: completeJSON should be called EXACTLY ONCE (success on first try)
    expect(mockLLMProvider.completeJSON).toHaveBeenCalledTimes(1);

    // Result should be successful
    expect(result.gate).toBeDefined();
    expect(result.gate.foodSignal).toBe('YES');
    expect(result.gate.confidence).toBe(0.95);
    expect(result.error).toBeUndefined();
  });

  it('should let LLM client handle all retries (Gate2 receives final result)', async () => {
    const mockRequest: SearchRequest = {
      query: 'italian food',
      uiLanguage: 'en'
    };

    const mockContext: Route2Context = {
      requestId: 'req-test-789',
      sessionId: 'sess-test',
      startTime: Date.now(),
      traceId: 'trace-test',
      timings: {}
    };

    // Mock LLM provider that succeeds after internal retries
    // (LLM client handles retries internally, Gate2 only sees final result)
    let attemptCount = 0;
    const mockLLMProvider: any = {
      completeJSON: vi.fn().mockImplementation(async () => {
        attemptCount++;
        // Simulate LLM client internal retry logic (not visible to Gate2)
        // Gate2 only makes ONE call, LLM client retries internally
        return {
          data: {
            foodSignal: 'YES',
            confidence: 0.9,
            assistantLanguage: 'en',
            assistantLanguageConfidence: 0.85,
            stop: null
          },
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'gpt-4o-mini',
          // LLM client metadata (if retries happened internally)
          _internalRetries: 2 // This would be internal to LLM client, not exposed
        };
      })
    };

    // Execute gate2
    const result = await executeGate2Stage(mockRequest, mockContext, mockLLMProvider);

    // CRITICAL ASSERTION: Gate2 calls completeJSON EXACTLY ONCE
    // All retries are handled by LLM client internally
    expect(mockLLMProvider.completeJSON).toHaveBeenCalledTimes(1);
    expect(attemptCount).toBe(1); // Gate2 makes single call

    // Result should be successful
    expect(result.gate.foodSignal).toBe('YES');
    expect(result.error).toBeUndefined();
  });
});
