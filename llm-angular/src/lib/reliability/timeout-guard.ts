/**
 * Timeout Guard
 * Phase 7: Prevent operations from hanging indefinitely
 * 
 * Wraps promises with timeout protection to ensure
 * system responsiveness even when external APIs are slow
 */

export class TimeoutError extends Error {
  constructor(
    public operation: string,
    public timeoutMs: number
  ) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout
 * 
 * If the promise doesn't resolve within timeoutMs,
 * rejects with TimeoutError
 * 
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operation - Name of operation (for error messages)
 * @returns Promise that resolves with result or rejects with timeout
 * 
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'data_fetch'
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  // Create timeout promise that rejects after delay
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
    
    // Clear timeout if original promise resolves first
    promise.finally(() => clearTimeout(timeoutId));
  });
  
  // Race between original promise and timeout
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Check if error is a timeout error
 */
export function isTimeoutError(error: any): error is TimeoutError {
  return error instanceof TimeoutError || error?.name === 'TimeoutError';
}

/**
 * Sleep utility for backoff/retry logic
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}





