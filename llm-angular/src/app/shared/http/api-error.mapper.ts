/**
 * API Error Mapper
 * Converts HttpErrorResponse to normalized ApiErrorView
 * Aligns with backend standardized error format: { error, code, traceId }
 * 
 * Production Guardrails:
 * - Never expose raw upstream errors
 * - Preserve traceId for debugging
 * - Classify retryable vs non-retryable errors
 */

import { HttpErrorResponse } from '@angular/common/http';

/**
 * Normalized error view for UI consumption
 * Backend returns: { error: string, code?: string, traceId?: string }
 */
export interface ApiErrorView {
  message: string;
  code?: string;
  traceId?: string;
  status?: number;
}

/**
 * Map HttpErrorResponse to ApiErrorView (PRODUCTION-SAFE)
 * 
 * @param error - HTTP error from Angular HttpClient
 * @returns Normalized error view safe for UI display
 */
export function mapApiError(error: HttpErrorResponse): ApiErrorView {
  // Network or timeout error (status 0)
  if (error.status === 0) {
    return {
      message: 'Unable to connect to server. Please check your internet connection.',
      code: 'NETWORK_ERROR',
      status: 0
    };
  }
  
  // Parse backend error response
  const errorBody = error.error;
  
  // Backend standardized format: { error, code, traceId }
  if (errorBody && typeof errorBody === 'object') {
    return {
      message: errorBody.error || errorBody.message || 'An error occurred',
      code: errorBody.code,
      traceId: errorBody.traceId,
      status: error.status
    };
  }
  
  // Fallback for non-JSON errors (should not happen with standardized backend)
  return {
    message: 'Request failed. Please try again.',
    code: 'UNKNOWN_ERROR',
    status: error.status
  };
}

/**
 * Format error message for user display
 * Optionally includes traceId for support/debugging
 * 
 * @param error - Normalized error view
 * @returns User-friendly error message with optional traceId
 */
export function formatErrorMessage(error: ApiErrorView): string {
  let message = error.message;
  
  // Append trace ID if present (copy-friendly format)
  if (error.traceId) {
    message += ` (Trace ID: ${error.traceId})`;
  }
  
  return message;
}

/**
 * Determine if error is retryable
 * 
 * Retryable:
 * - Network errors (status 0)
 * - 5xx server errors
 * - 429 rate limits
 * 
 * NOT Retryable:
 * - 4xx client errors (except 429)
 * 
 * @param error - Normalized error view
 * @returns true if error might succeed on retry
 */
export function isRetryableError(error: ApiErrorView): boolean {
  // Network errors are retryable
  if (error.code === 'NETWORK_ERROR' || error.status === 0) {
    return true;
  }
  
  // 429 rate limit is retryable (with backoff)
  if (error.status === 429) {
    return true;
  }
  
  // 5xx server errors are retryable
  if (error.status && error.status >= 500 && error.status < 600) {
    return true;
  }
  
  // Timeout errors (from interceptor)
  if (error.code === 'TIMEOUT') {
    return true;
  }
  
  // All other 4xx client errors are NOT retryable
  return false;
}

/**
 * Log error to console with trace ID (PRODUCTION GUARDRAIL)
 * 
 * Rules:
 * - No secrets logged
 * - No full request bodies
 * - Only log: message, code, traceId, status
 * 
 * @param context - Service or component name for debugging
 * @param error - Normalized error view
 */
export function logApiError(context: string, error: ApiErrorView): void {
  const prefix = `[${context}] API Error`;
  
  if (error.traceId) {
    console.error(prefix, {
      message: error.message,
      code: error.code,
      traceId: error.traceId,
      status: error.status
    });
  } else {
    console.error(prefix, {
      message: error.message,
      code: error.code,
      status: error.status
    });
  }
}
