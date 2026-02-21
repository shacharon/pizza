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
 * optionally calls onTimeout then rejects with TimeoutError
 * 
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operation - Name of operation (for error messages)
 * @param onTimeout - Optional callback when timeout triggers (e.g. () => controller.abort('reason'))
 * @returns Promise that resolves with result or rejects with timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  onTimeout?: () => void
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
    promise.finally(() => clearTimeout(timeoutId));
  });
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





