/**
 * Session Cookie Authentication Middleware (Cookie-Only)
 * 
 * Server-authoritative session validation with Redis lookup
 * NO JWT fallback - cookie-only
 * 
 * Flow:
 * 1. Extract session cookie
 * 2. Lookup in Redis
 * 3. If not found → 401
 * 4. If found → attach req.sessionId and req.userId
 * 5. Touch session (extend TTL)
 * 6. Continue
 * 
 * Usage:
 * router.get('/endpoint', authenticateSession, handler);
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';
import { getSessionStore, RedisUnavailableError } from '../lib/session/redis-session.store.js';

/**
 * Extract session cookie from Cookie header
 * Cookie format: "session=<value>; other=value"
 */
function extractSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies from header (format: "name1=value1; name2=value2")
  const cookies = cookieHeader.split(';').map(c => c.trim());

  for (const cookie of cookies) {
    const [name, value] = cookie.split('=');
    if (name === 'session' && value) {
      return value;
    }
  }

  return null;
}

/**
 * Authenticated request interface
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId: string;
}

/**
 * Session-only authentication middleware
 * Requires valid session cookie backed by Redis
 * 
 * NO JWT fallback - use this for pure server-authoritative auth
 */
export async function authenticateSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const traceId = (req as any).traceId || 'unknown';
  const cookieHeader = req.headers.cookie;

  // STEP 1: Extract session cookie
  const sessionId = extractSessionCookie(cookieHeader);

  if (!sessionId) {
    logger.warn({
      event: 'auth_session_missing_cookie',
      traceId,
      path: req.path,
      method: req.method,
      hasCookieHeader: Boolean(cookieHeader)
    }, '[AuthSession] No session cookie');

    res.status(401).json({
      error: 'Unauthorized',
      code: 'SESSION_REQUIRED',
      message: 'Valid session cookie required',
      traceId
    });
    return;
  }

  // STEP 2: Lookup session in Redis
  const sessionStore = getSessionStore();
  
  if (!sessionStore.isAvailable()) {
    logger.error({
      event: 'auth_session_redis_unavailable',
      traceId,
      path: req.path
    }, '[AuthSession] Redis not available');

    res.status(503).json({
      error: 'Service Unavailable',
      code: 'SESSION_STORE_UNAVAILABLE',
      message: 'Session validation temporarily unavailable',
      traceId
    });
    return;
  }

  try {
    const session = await sessionStore.getSession(sessionId);

    if (!session) {
      logger.warn({
        event: 'auth_session_invalid',
        traceId,
        sessionId: sessionId.substring(0, 12) + '...',
        path: req.path
      }, '[AuthSession] Session not found or expired');

      res.status(401).json({
        error: 'Unauthorized',
        code: 'SESSION_INVALID',
        message: 'Session expired or invalid',
        traceId
      });
      return;
    }

    // STEP 3: Attach session context to request
    const authReq = req as AuthenticatedRequest;
    authReq.sessionId = session.sessionId;
    
    if (session.userId) {
      authReq.userId = session.userId;
    }

    // Backward compatibility: ctx holds sessionId
    if (!req.ctx) {
      (req as any).ctx = {};
    }
    req.ctx.sessionId = session.sessionId;

    logger.debug({
      event: 'auth_session_validated',
      traceId,
      sessionId: session.sessionId.substring(0, 12) + '...',
      hasUserId: Boolean(session.userId),
      path: req.path,
      ageSeconds: Math.floor((Date.now() - session.createdAt) / 1000)
    }, '[AuthSession] Session validated');

    // STEP 4: Touch session (extend TTL) - async, non-blocking
    sessionStore.touchSession(session.sessionId).catch(error => {
      logger.warn({
        event: 'auth_session_touch_failed',
        traceId,
        sessionId: session.sessionId.substring(0, 12) + '...',
        error: error instanceof Error ? error.message : 'unknown'
      }, '[AuthSession] Failed to touch session (non-critical)');
    });

    // STEP 5: Continue to next middleware/handler
    next();

  } catch (error) {
    // Handle Redis unavailability separately (503, not 401)
    if (error instanceof RedisUnavailableError) {
      logger.error({
        event: 'redis_unavailable',
        traceId,
        route: req.path,
        sessionId: sessionId.substring(0, 12) + '...',
        error: error.message,
        originalError: error.originalError?.message
      }, '[AuthSession] Redis unavailable during session lookup');

      res.status(503).json({
        ok: false,
        error: 'REDIS_UNAVAILABLE',
        message: 'Session service temporarily unavailable',
        traceId
      });
      return;
    }

    // Other unexpected errors (500)
    logger.error({
      event: 'auth_session_error',
      traceId,
      sessionId: sessionId.substring(0, 12) + '...',
      error: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined
    }, '[AuthSession] Session validation error');

    res.status(500).json({
      error: 'Internal Server Error',
      code: 'SESSION_VALIDATION_FAILED',
      traceId
    });
  }
}
