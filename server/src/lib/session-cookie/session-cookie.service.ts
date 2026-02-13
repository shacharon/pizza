/**
 * Session Cookie Service
 * Signs and verifies session cookies with distinct token type
 * 
 * Security:
 * - Uses separate SESSION_COOKIE_SECRET (not JWT_SECRET)
 * - JWT typ="session_cookie" to distinguish from access tokens
 * - Configurable TTL via SESSION_COOKIE_TTL_SECONDS
 */

import jwt from 'jsonwebtoken';
import { logger } from '../logger/structured-logger.js';

export interface SessionCookiePayload {
  userId?: string;
  sessionId: string;
  typ: 'session_cookie';
  iat: number;
  exp: number;
}

export interface SessionCookieOptions {
  secret: string;
  ttlSeconds: number;
}

/**
 * Sign a session cookie token
 */
export function signSessionCookie(
  sessionId: string,
  userId: string | undefined,
  options: SessionCookieOptions
): string {
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    sessionId,
    ...(userId && { userId }),
    typ: 'session_cookie' as const
  };

  return jwt.sign(payload, options.secret, {
    algorithm: 'HS256',
    expiresIn: options.ttlSeconds // Let jwt library add iat and exp
  });
}

/**
 * Verify a session cookie token
 * Returns payload if valid, null if invalid/expired
 */
export function verifySessionCookie(
  token: string,
  secret: string
): SessionCookiePayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: 5 // Allow 5 seconds clock skew
    }) as SessionCookiePayload;

    // Validate required fields
    if (!decoded.sessionId) {
      logger.warn({ reason: 'missing_sessionId' }, '[SessionCookie] Token missing sessionId');
      return null;
    }

    if (!decoded.exp) {
      logger.warn({ reason: 'missing_exp' }, '[SessionCookie] Token missing exp');
      return null;
    }

    if (!decoded.iat) {
      logger.warn({ reason: 'missing_iat' }, '[SessionCookie] Token missing iat');
      return null;
    }

    // Validate typ claim (must be session_cookie)
    if (decoded.typ !== 'session_cookie') {
      logger.warn({ 
        reason: 'invalid_typ', 
        typ: decoded.typ 
      }, '[SessionCookie] Token has invalid typ claim');
      return null;
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug({ reason: 'expired' }, '[SessionCookie] Token expired');
      return null;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.debug({ 
        reason: 'invalid_signature',
        message: error.message 
      }, '[SessionCookie] Token verification failed');
      return null;
    }

    logger.warn({ 
      reason: 'unknown_error',
      error: error instanceof Error ? error.message : 'unknown'
    }, '[SessionCookie] Unexpected verification error');
    
    return null;
  }
}

/**
 * Parse cookie header and extract session cookie
 */
export function extractSessionCookieFromHeader(cookieHeader: string | undefined): string | null {
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
