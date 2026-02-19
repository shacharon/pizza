/**
 * Search Security Utilities
 * Handles session validation and IDOR protection for search results
 */

import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { hashSessionId } from '../../utils/security.utils.js';
import { searchJobStore } from '../../services/search/job-store/index.js';

/**
 * Validate ownership of a search job by checking session binding
 * P0 Security: IDOR protection via session binding
 * 
 * @returns Object with validation result and optional error response
 */
export async function validateJobOwnership(
  requestId: string,
  req: Request
): Promise<{ valid: boolean; errorResponse?: { status: number; json: any } }> {
  // P0 Security: Extract ONLY JWT-authenticated session (canonical identity)
  const currentSessionId = (req as AuthenticatedRequest).sessionId || (req as any).ctx?.sessionId;

  // P0 Security: Get full job to check ownership
  const job = await searchJobStore.getJob(requestId);

  if (!job) {
    logger.warn({
      requestId,
      sessionHash: hashSessionId(currentSessionId || undefined),
      operation: 'getResult',
      decision: 'NOT_FOUND',
      reason: 'job_not_found'
    }, '[P0 Security] Job not found');

    return {
      valid: false,
      errorResponse: {
        status: 404,
        json: { code: 'NOT_FOUND', requestId }
      }
    };
  }

  // P0 Security: Validate session ownership
  const ownerSessionId = job.ownerSessionId;

  // Missing current session -> 401 Unauthorized
  if (!currentSessionId) {
    logger.warn({
      requestId,
      sessionHash: hashSessionId(currentSessionId),
      operation: 'getResult',
      decision: 'UNAUTHORIZED',
      reason: 'missing_session_id',
      traceId: (req as any).traceId || 'unknown'
    }, '[P0 Security] Access denied: missing session in request');

    return {
      valid: false,
      errorResponse: {
        status: 401,
        json: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          traceId: (req as any).traceId || 'unknown'
        }
      }
    };
  }

  // P0 CRITICAL: Legacy job without owner -> 404 (secure default, no disclosure)
  if (!ownerSessionId) {
    logger.warn({
      requestId,
      currentSessionHash: hashSessionId(currentSessionId),
      operation: 'getResult',
      decision: 'NOT_FOUND',
      reason: 'legacy_job_no_owner',
      traceId: (req as any).traceId || 'unknown'
    }, '[P0 Security] Access denied: legacy job without owner');

    return {
      valid: false,
      errorResponse: {
        status: 404,
        json: {
          code: 'NOT_FOUND',
          requestId,
          traceId: (req as any).traceId || 'unknown'
        }
      }
    };
  }

  // Session mismatch -> 404 to avoid disclosure
  if (currentSessionId !== ownerSessionId) {
    logger.warn({
      requestId,
      currentSessionHash: hashSessionId(currentSessionId),
      ownerSessionHash: hashSessionId(ownerSessionId),
      operation: 'getResult',
      decision: 'FORBIDDEN',
      reason: 'session_mismatch',
      traceId: (req as any).traceId || 'unknown'
    }, '[P0 Security] Access denied: session mismatch');

    // Return 404 to avoid leaking requestId existence
    return {
      valid: false,
      errorResponse: {
        status: 404,
        json: {
          code: 'NOT_FOUND',
          requestId,
          traceId: (req as any).traceId || 'unknown'
        }
      }
    };
  }

  // Log successful authorization
  logger.info({
    requestId,
    sessionHash: hashSessionId(currentSessionId),
    operation: 'getResult',
    decision: 'AUTHORIZED',
    traceId: (req as any).traceId || 'unknown'
  }, '[P0 Security] Access granted');

  return { valid: true };
}

/**
 * Extract authenticated session ID from request
 * P0 Security: Use ONLY JWT-authenticated session (no client-provided fallbacks)
 */
export function getAuthenticatedSession(req: Request): string | undefined {
  return (req as AuthenticatedRequest).sessionId || (req as any).ctx?.sessionId;
}
