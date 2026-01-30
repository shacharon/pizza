/**
 * Retry Handler
 * Manages retry logic with backoff for LLM operations
 */

import { logger } from '../lib/logger/structured-logger.js';

/**
 * Error categorization result
 */
export interface ErrorCategory {
  type: 'abort_timeout' | 'transport_error' | 'parse_error' | 'unknown';
  isRetriable: boolean;
  reason: string;
  statusCode?: number | undefined;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxAttempts: number;
  backoffMs: number[];
}

/**
 * RetryHandler
 * Handles retry logic with exponential backoff
 */
export class RetryHandler {
  constructor(private config: RetryConfig) {}

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: (attempt: number) => Promise<T>,
    opts?: {
      traceId?: string | undefined;
      onError?: ((attempt: number, error: any, category: ErrorCategory) => void) | undefined;
    }
  ): Promise<T> {
    const { maxAttempts, backoffMs } = this.config;
    let lastErr: any;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Apply backoff before retry (skip on first attempt)
      const backoff = backoffMs[attempt] ?? 0;
      if (attempt > 0 && backoff > 0) {
        await this.sleep(backoff);
      }

      try {
        return await fn(attempt);
      } catch (e: any) {
        lastErr = e;
        const category = this.categorizeError(e);

        // Notify callback
        if (opts?.onError) {
          opts.onError(attempt, e, category);
        }

        // Non-retriable errors: fail fast
        if (!category.isRetriable) {
          logger.error({
            status: category.statusCode,
            traceId: opts?.traceId,
            errorType: category.type
          }, '[LLM] Non-retriable error, failing fast');
          throw e;
        }

        // Abort/timeout errors: retriable with backoff
        if (category.type === 'abort_timeout') {
          logger.warn({
            attempt: attempt + 1,
            maxAttempts,
            traceId: opts?.traceId,
            errorType: category.type
          }, '[LLM] Timeout, will retry with backoff');
          
          // Continue to retry (last attempt check below)
        }

        // Parse errors with Structured Outputs: fail fast
        if (category.type === 'parse_error') {
          logger.error({
            traceId: opts?.traceId,
            errorType: category.type
          }, '[LLM] Structured Outputs parse error - failing fast (schema mismatch should not occur)');
          throw e;
        }

        // Retriable transport errors: log and continue
        logger.warn({
          attempt: attempt + 1,
          maxAttempts,
          status: category.statusCode,
          traceId: opts?.traceId
        }, '[LLM] Retriable transport error');

        // Last attempt exhausted
        if (attempt === maxAttempts - 1) {
          logger.error({
            attempts: attempt + 1,
            traceId: opts?.traceId
          }, '[LLM] All retry attempts exhausted');
          throw e;
        }
      }
    }

    throw lastErr ?? new Error('LLM failed after all attempts');
  }

  /**
   * Categorize error for retry decision
   */
  categorizeError(e: any): ErrorCategory {
    const status = e?.status ?? e?.code ?? e?.name;

    // Abort/Timeout errors (retriable for gate2/intent with retry logic)
    const isAbortError = e?.name === 'AbortError' ||
      e?.message?.includes('aborted') ||
      e?.message?.includes('timeout');

    if (isAbortError) {
      return {
        type: 'abort_timeout',
        isRetriable: true,  // FIXED: Retriable to match current gate2/intent behavior
        reason: 'Request aborted or timeout'
      };
    }

    // Transport errors (retriable)
    const isTransportError = status === 429 ||
      (typeof status === 'number' && status >= 500);

    if (isTransportError) {
      return {
        type: 'transport_error',
        isRetriable: true,
        reason: `HTTP ${status}`,
        statusCode: typeof status === 'number' ? status : undefined
      };
    }

    // Parse errors (non-retriable with Structured Outputs)
    const isParseError = e?.name === 'ZodError' ||
      e?.name === 'SyntaxError' ||
      e?.message?.includes('JSON') ||
      e?.message?.includes('parsed content');

    if (isParseError) {
      return {
        type: 'parse_error',
        isRetriable: false,
        reason: e?.message || 'Parse failed'
      };
    }

    // Unknown errors (non-retriable)
    return {
      type: 'unknown',
      isRetriable: false,
      reason: e?.message || 'unknown'
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }
}
