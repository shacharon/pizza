/**
 * Retry Handler
 * Generic retry-with-backoff utility extracted from openai.provider.ts and enrichment workers
 * 
 * Supports:
 * - Configurable retry predicates (isRetryable)
 * - Array-based backoff schedules (e.g., [0, 1000, 2000])
 * - Retry callbacks for logging/telemetry
 * - Zero-indexed attempt counter (matches existing semantics)
 */

/**
 * Retry configuration
 */
export interface RetryConfig<T> {
  /**
   * Function to execute (will be retried on failure)
   */
  fn: () => Promise<T>;

  /**
   * Predicate to determine if error is retryable
   * Return true to retry, false to fail fast
   */
  isRetryable: (error: any, attempt: number) => boolean;

  /**
   * Maximum number of attempts (total, including initial)
   * Example: maxAttempts=3 means 1 initial + 2 retries
   */
  maxAttempts: number;

  /**
   * Backoff delays in milliseconds (array)
   * backoffMs[attempt] is the delay BEFORE attempt
   * Example: [0, 1000, 2000] means no delay before attempt 0, 1s before attempt 1, 2s before attempt 2
   */
  backoffMs: number[];

  /**
   * Optional callback invoked before each retry
   * Useful for logging retry attempts
   */
  onRetry?: (error: any, attempt: number, nextDelay: number) => void;
}

/**
 * Execute function with retry and exponential backoff
 * 
 * @param config - Retry configuration
 * @returns Promise that resolves with result or rejects after all retries exhausted
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff({
 *   fn: () => fetchData(),
 *   isRetryable: (err) => err.status >= 500,
 *   maxAttempts: 3,
 *   backoffMs: [0, 1000, 2000],
 *   onRetry: (err, attempt, delay) => logger.warn({ attempt, delay })
 * });
 * ```
 */
export async function retryWithBackoff<T>(config: RetryConfig<T>): Promise<T> {
  const { fn, isRetryable, maxAttempts, backoffMs, onRetry } = config;
  let lastErr: any;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Apply backoff delay before this attempt (backoffMs[0] should be 0)
    const delay = backoffMs[attempt] ?? 0;
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;

      // Check if this error is retryable
      if (!isRetryable(e, attempt)) {
        throw e; // Fail fast for non-retryable errors
      }

      // If this was the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw e;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        const nextDelay = backoffMs[attempt + 1] ?? 0;
        onRetry(e, attempt, nextDelay);
      }

      // Continue to next attempt
    }
  }

  // Should never reach here, but TypeScript needs a final throw
  throw lastErr ?? new Error('All retry attempts exhausted');
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
