/**
 * Centralized Error Middleware - Production Safe
 * Prevents leaking raw provider errors and stack traces to clients
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Application Error - Structured error with metadata
 * Use this for all known error cases
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly details?: unknown,
    public readonly exposeMessage: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  code: string;
  traceId: string;
  details?: unknown;
  stack?: string;
}

/**
 * Centralized error handling middleware
 * Must be registered LAST in Express app (after all routes)
 * 
 * Production mode:
 * - No stack traces
 * - No raw upstream messages (unless exposeMessage=true)
 * - Generic error messages
 * 
 * Development mode:
 * - Includes stack traces
 * - Includes details
 * - More verbose errors
 */
export function errorMiddleware(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine if this is a known AppError
  const isAppError = err instanceof AppError;

  // Extract traceId (from req.traceId, response header, or default)
  const traceId = req.traceId || res.getHeader('x-trace-id') as string || 'unknown';

  // Determine status code
  const statusCode = isAppError ? err.statusCode : 500;

  // Determine error code
  const code = isAppError ? err.code : 'INTERNAL_ERROR';

  // Determine error message for client
  let clientMessage: string;
  if (isAppError && err.exposeMessage) {
    // Safe to expose the message
    clientMessage = err.message;
  } else if (isAppError) {
    // AppError but not safe to expose - use generic message
    clientMessage = getGenericMessage(err.statusCode);
  } else {
    // Unknown error - always use generic message in production
    if (isProd) {
      clientMessage = 'Internal server error';
    } else {
      // In dev, show the actual error for debugging
      clientMessage = err.message || 'Internal server error';
    }
  }

  // Log full error internally (with stack trace)
  const logContext = {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code,
      statusCode,
    },
    traceId,
    method: req.method,
    path: req.path,
  };

  if (req.log) {
    // Use request-scoped logger if available (includes traceId automatically)
    if (statusCode >= 500) {
      req.log.error(logContext, 'Request error');
    } else {
      req.log.warn(logContext, 'Request error');
    }
  } else {
    // Fallback to global logger
    if (statusCode >= 500) {
      logger.error(logContext, 'Request error');
    } else {
      logger.warn(logContext, 'Request error');
    }
  }

  // Build response
  const response: ErrorResponse = {
    error: clientMessage,
    code,
    traceId,
  };

  // In development, optionally include details and stack
  if (!isProd) {
    if (isAppError && err.details) {
      response.details = err.details;
    }
    if (err.stack) {
      response.stack = err.stack;
    }
  }

  // Send response
  res.status(statusCode).json(response);
}

/**
 * Get generic error message based on status code
 */
function getGenericMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Invalid request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Validation failed';
    case 429:
      return 'Too many requests';
    case 500:
      return 'Internal server error';
    case 502:
      return 'Upstream service error';
    case 503:
      return 'Service unavailable';
    case 504:
      return 'Gateway timeout';
    default:
      return statusCode >= 500 ? 'Internal server error' : 'Bad request';
  }
}

/**
 * Helper: Create validation error
 */
export function createValidationError(
  message: string,
  details?: unknown
): AppError {
  return new AppError(
    message,
    400,
    'VALIDATION_ERROR',
    details,
    true // Safe to expose validation messages
  );
}

/**
 * Helper: Create upstream provider error
 */
export function createUpstreamError(
  internalMessage: string,
  details?: unknown
): AppError {
  return new AppError(
    internalMessage,
    502,
    'UPSTREAM_ERROR',
    details,
    false // Never expose upstream error details
  );
}

/**
 * Helper: Create internal error
 */
export function createInternalError(
  internalMessage: string,
  details?: unknown
): AppError {
  return new AppError(
    internalMessage,
    500,
    'INTERNAL_ERROR',
    details,
    false // Never expose internal error details
  );
}
