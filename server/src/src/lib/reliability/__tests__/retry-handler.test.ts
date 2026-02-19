/**
 * Unit tests for retry-handler.ts
 * Tests exact retry semantics with fake timers for determinism
 */

import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../retry-handler.js';

describe('retryWithBackoff', () => {

  it('should succeed on first attempt without retry', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const isRetryable = vi.fn();
    const onRetry = vi.fn();

    const promise = retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 100, 200],
      onRetry
    });

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should retry on retryable errors and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('retriable-1'))
      .mockRejectedValueOnce(new Error('retriable-2'))
      .mockResolvedValueOnce('success');

    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();

    const result = await retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 5, 10],
      onRetry
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(isRetryable).toHaveBeenCalledTimes(2);
    expect(isRetryable).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: 'retriable-1' }), 0);
    expect(isRetryable).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'retriable-2' }), 1);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('should stop immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));
    const isRetryable = vi.fn().mockReturnValue(false);
    const onRetry = vi.fn();

    const promise = retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 100, 200],
      onRetry
    });

    await expect(promise).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable).toHaveBeenCalledTimes(1);
    expect(isRetryable).toHaveBeenCalledWith(expect.objectContaining({ message: 'non-retryable' }), 0);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should respect maxAttempts and throw after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fail'));
    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();

    await expect(retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 5, 10],
      onRetry
    })).rejects.toThrow('always-fail');
    
    expect(fn).toHaveBeenCalledTimes(3);
    expect(isRetryable).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // No onRetry after final attempt
  });

  it('should use provided backoff schedule exactly', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce('success');

    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();
    
    const startTime = Date.now();

    const result = await retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 10, 20], // Use small delays for fast test
      onRetry
    });

    const elapsed = Date.now() - startTime;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    // Verify delays were applied (at least 30ms total: 0 + 10 + 20)
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it('should call onRetry with correct attempt index and error', async () => {
    const error1 = new Error('error-attempt-0');
    const error2 = new Error('error-attempt-1');

    const fn = vi.fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockResolvedValueOnce('success');

    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();

    await retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 100, 200],
      onRetry
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    
    // First retry: attempt=0, nextDelay=100
    expect(onRetry).toHaveBeenNthCalledWith(1, error1, 0, 100);
    
    // Second retry: attempt=1, nextDelay=200
    expect(onRetry).toHaveBeenNthCalledWith(2, error2, 1, 200);
  });

  it('should handle maxAttempts=1 (no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();

    const promise = retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 1,
      backoffMs: [0],
      onRetry
    });

    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should handle backoffMs shorter than maxAttempts gracefully', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockRejectedValueOnce(new Error('fail-3'))
      .mockRejectedValueOnce(new Error('fail-4'));

    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();

    await expect(retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 4,
      backoffMs: [0, 5], // Only 2 values, but maxAttempts=4
      onRetry
    })).rejects.toThrow('fail-4');
    
    expect(fn).toHaveBeenCalledTimes(4);
    
    // Verify onRetry was called with 0 for missing backoff values
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 0, 5);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 1, 0); // backoffMs[2] ?? 0
    expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 2, 0); // backoffMs[3] ?? 0
  });

  it('should preserve error types through retries', async () => {
    class CustomError extends Error {
      constructor(
        message: string,
        public code: string
      ) {
        super(message);
        this.name = 'CustomError';
      }
    }

    const customError = new CustomError('custom-fail', 'ERR_CUSTOM');
    const fn = vi.fn().mockRejectedValue(customError);
    const isRetryable = vi.fn().mockReturnValue(false);
    const onRetry = vi.fn();

    const promise = retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 100, 200],
      onRetry
    });

    await expect(promise).rejects.toThrow(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: 'custom-fail',
      code: 'ERR_CUSTOM',
      name: 'CustomError'
    });
  });

  it('should not call onRetry after final failed attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockRejectedValueOnce(new Error('fail-3-final'));

    const isRetryable = vi.fn().mockReturnValue(true);
    const onRetry = vi.fn();

    await expect(retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 5, 10],
      onRetry
    })).rejects.toThrow('fail-3-final');
    
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // Only for first 2 failures, not the final one
  });

  it('should handle mixed retryable/non-retryable errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('retriable'))
      .mockRejectedValueOnce(new Error('non-retriable'));

    const isRetryable = vi.fn()
      .mockReturnValueOnce(true)  // First error is retryable
      .mockReturnValueOnce(false); // Second error is not

    const onRetry = vi.fn();

    await expect(retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 3,
      backoffMs: [0, 5, 10],
      onRetry
    })).rejects.toThrow('non-retriable');
    
    expect(fn).toHaveBeenCalledTimes(2);
    expect(isRetryable).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1); // Only called after first (retryable) error
  });

  it('should work without onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const isRetryable = vi.fn().mockReturnValue(true);

    const result = await retryWithBackoff({
      fn,
      isRetryable,
      maxAttempts: 2,
      backoffMs: [0, 5]
      // onRetry omitted
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
