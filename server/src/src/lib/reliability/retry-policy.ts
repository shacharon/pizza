/**
 * Retry Policy
 * Phase 7: Automatic retry with exponential backoff
 * 
 * Implements retry logic for transient failures
 * with configurable attempts and backoff
 */

import { sleep } from './timeout-guard.js';

export class RetryExhaustedError extends Error {
  constructor(
    public operation: string,
    public attempts: number,
    public lastError?: Error
  ) {
    super(
      `${operation} failed after ${attempts} attempts. Last error: ${lastError?.message || 'unknown'}`
    );
    this.name = 'RetryExhaustedError';
    
    // Preserve original error stack if available
    if (lastError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${lastError.stack}`;
    }
  }
}

export interface RetryOptions {
  attempts: number;
  backoffMs: number;
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Execute function with retry logic
 * 
 * Retries on failure with exponential backoff
 * Gives up after configured attempts
 * 
 * @param fn - Function to execute (must return Promise)
 * @param config - Retry configuration (attempts, backoff)
 * @param operation - Name of operation (for error messages)
 * @returns Promise that resolves with result or rejects after all retries
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => apiCall(),
 *   { attempts: 3, backoffMs: 1000 },
 *   'api_call'
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryOptions,
  operation: string
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= config.attempts; attempt++) {
    try {
      // Attempt operation
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry this error
      if (config.shouldRetry && !config.shouldRetry(lastError)) {
        throw lastError;
      }
      
      // If this was the last attempt, throw retry exhausted error
      if (attempt >= config.attempts) {
        throw new RetryExhaustedError(operation, config.attempts, lastError);
      }
      
      // Wait before retrying (exponential backoff)
      const backoff = config.backoffMs * attempt;
      await sleep(backoff);
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw new RetryExhaustedError(operation, config.attempts, lastError);
}

/**
 * Check if error is a retry exhausted error
 */
export function isRetryExhaustedError(error: any): error is RetryExhaustedError {
  return error instanceof RetryExhaustedError || error?.name === 'RetryExhaustedError';
}

/**
 * Default retry predicate - retry on most errors
 * Skip retry for certain error types (auth, validation, etc.)
 */
export function defaultShouldRetry(error: Error): boolean {
  // Don't retry auth errors
  if (error.message.includes('auth') || error.message.includes('unauthorized')) {
    return false;
  }
  
  // Don't retry validation errors
  if (error.message.includes('invalid') || error.message.includes('validation')) {
    return false;
  }
  
  // Retry everything else (network errors, timeouts, etc.)
  return true;
}





