/**
 * Session Cookie or JWT Authentication Middleware
 * Universal auth middleware that supports both session cookies and Bearer JWT
 * 
 * Priority:
 * 1. Try session cookie first (HttpOnly cookie named "session")
 * 2. Fallback to Bearer JWT (Authorization header)
 * 
 * Security:
 * - Session cookie verified with SESSION_COOKIE_SECRET
 * - Bearer JWT verified with JWT_SECRET
 * - Sets req.userId and req.sessionId for downstream handlers
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';
import { getConfig } from '../config/env.js';
import jwt from 'jsonwebtoken';
import {
  verifySessionCookie,
  extractSessionCookieFromHeader
} from '../lib/session-cookie/session-cookie.service.js';

const config = getConfig();

type JwtClaims = {
  userId?: string;
  sessionId?: string;
  exp?: number;
  iat?: number;
};

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

/**
 * Universal authentication middleware
 * Tries session cookie first, then falls back to Bearer JWT
 */
export function authSessionOrJwt(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const traceId = (req as any).traceId || 'unknown';
  const isSSEPath = req.originalUrl?.includes('/stream/assistant') || req.path.includes('/assistant');

  // DEBUG: SSE-specific logging
  if (isSSEPath) {
    const cookieHeader = req.headers.cookie;
    const hasCookieHeader = Boolean(cookieHeader);
    const hasReqCookies = Boolean((req as any).cookies); // Check if cookie-parser ran
    const sessionToken = extractSessionCookieFromHeader(cookieHeader);
    const hasSessionCookie = Boolean(sessionToken);

    logger.info(
      {
        traceId,
        path: req.path,
        hasCookieHeader,
        hasReqCookies,
        hasSessionCookie,
        cookieHeaderPreview: cookieHeader ? cookieHeader.substring(0, 50) + '...' : 'none',
        event: 'sse_auth_debug'
      },
      '[Auth][SSE] Debug: Cookie extraction attempt'
    );
  }

  // STEP 1: Try session cookie
  const cookieHeader = req.headers.cookie;
  const sessionToken = extractSessionCookieFromHeader(cookieHeader);

  if (sessionToken) {
    const decoded = verifySessionCookie(sessionToken, config.sessionCookieSecret);

    // DEBUG: SSE-specific verification result
    if (isSSEPath) {
      logger.info(
        {
          traceId,
          path: req.path,
          sessionCookieVerifyOk: Boolean(decoded),
          hasSessionId: Boolean(decoded?.sessionId),
          hasUserId: Boolean(decoded?.userId),
          event: 'sse_auth_verify_result'
        },
        '[Auth][SSE] Debug: Cookie verification result'
      );
    }

    if (decoded) {
      // Session cookie valid - set auth context
      const authReq = req as AuthenticatedRequest;
      authReq.sessionId = decoded.sessionId;
      if (decoded.userId) {
        authReq.userId = decoded.userId;
      }

      // Backward compatibility: ctx holds sessionId
      if (!req.ctx) {
        (req as any).ctx = {};
      }
      req.ctx.sessionId = decoded.sessionId;

      logger.debug(
        {
          traceId,
          sessionId: decoded.sessionId,
          userId: decoded.userId || 'none',
          path: req.path,
          event: 'session_cookie_auth_ok'
        },
        '[Auth] Session cookie authenticated'
      );

      next();
      return;
    }

    // Session cookie present but invalid - log and continue to JWT fallback
    logger.debug(
      {
        traceId,
        path: req.path,
        reason: 'invalid_or_expired',
        event: 'session_cookie_auth_failed'
      },
      '[Auth] Session cookie invalid, trying JWT fallback'
    );
  } else if (isSSEPath) {
    // DEBUG: No session token extracted
    logger.info(
      {
        traceId,
        path: req.path,
        hasCookieHeader: Boolean(cookieHeader),
        event: 'sse_auth_no_session_token'
      },
      '[Auth][SSE] Debug: No session token extracted from cookie header'
    );
  }

  // STEP 2: Fallback to Bearer JWT
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(
      {
        traceId,
        path: req.path,
        method: req.method,
        hadCookie: Boolean(sessionToken),
        event: 'auth_failed_no_credentials'
      },
      '[Auth] No valid session cookie or Bearer token'
    );

    res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_AUTH',
      traceId
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      maxAge: '30d',
      clockTolerance: 5
    }) as JwtClaims;

    if (!decoded.sessionId) {
      throw new Error('Token missing sessionId');
    }

    if (!decoded.exp) {
      throw new Error('Token missing expiration (exp)');
    }

    if (!decoded.iat) {
      throw new Error('Token missing issued-at (iat)');
    }

    const authReq = req as AuthenticatedRequest;

    if (decoded.userId) {
      authReq.userId = decoded.userId;
    }

    authReq.sessionId = decoded.sessionId;

    // Backward compatibility: ctx holds sessionId
    if (!req.ctx) {
      (req as any).ctx = {};
    }

    req.ctx.sessionId = decoded.sessionId;

    logger.debug(
      {
        traceId,
        sessionId: decoded.sessionId,
        userId: decoded.userId || 'none',
        path: req.path,
        event: 'jwt_auth_ok'
      },
      '[Auth] Bearer JWT authenticated'
    );

    next();
  } catch (error) {
    logger.warn(
      {
        traceId,
        path: req.path,
        error: error instanceof Error ? error.message : 'unknown',
        event: 'auth_failed_invalid_jwt'
      },
      '[Auth] Both session cookie and JWT verification failed'
    );

    res.status(401).json({
      error: 'Unauthorized',
      code: 'INVALID_TOKEN',
      traceId
    });
  }
}
