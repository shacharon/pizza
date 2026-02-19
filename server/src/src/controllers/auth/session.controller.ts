/**
 * Session Controller
 * Handles session cookie issuance and authentication verification
 *
 * Endpoints:
 * - POST /session - Issue session cookie (protected, requires Bearer JWT)
 * - GET /whoami - Verify authentication and identify auth source (protected)
 */

import { Router, type Request, type Response } from 'express';

import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';
import { authenticateJWT, type AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { authSessionOrJwt } from '../../middleware/auth-session-or-jwt.middleware.js';
import { signSessionCookie } from '../../lib/session-cookie/session-cookie.service.js';

const router = Router();
const config = getConfig();

/**
 * POST /session
 * Issue session cookie
 * 
 * Security:
 * - Protected endpoint (requires Bearer JWT)
 * - Issues HttpOnly cookie with session token
 * - Cookie signed with SESSION_COOKIE_SECRET (separate from JWT_SECRET)
 * - Cookie typ="session_cookie" to distinguish from access tokens
 * 
 * Headers:
 * - Authorization: Bearer <JWT> (required)
 * 
 * Response:
 * - Sets session cookie via Set-Cookie header
 * - Returns JSON: { ok: true, sessionId, expiresAt }
 */
router.post('/session', authenticateJWT, async (req: Request, res: Response) => {
  const traceId = (req as any).traceId || 'unknown';
  const authReq = req as AuthenticatedRequest;

  try {
    // Extract sessionId and userId from JWT (set by authenticateJWT middleware)
    const sessionId = authReq.sessionId;
    const userId = authReq.userId;

    if (!sessionId) {
      logger.warn(
        {
          traceId,
          reason: 'missing_sessionId'
        },
        '[SessionCookie] JWT missing sessionId claim'
      );

      return res.status(400).json({
        error: 'Invalid token',
        code: 'MISSING_SESSION_ID',
        traceId
      });
    }

    // Sign session cookie token
    const sessionToken = signSessionCookie(sessionId, userId, {
      secret: config.sessionCookieSecret,
      ttlSeconds: config.sessionCookieTtlSeconds
    });

    const expiresAt = new Date(Date.now() + config.sessionCookieTtlSeconds * 1000);

    // Build cookie attributes
    const cookieAttributes: string[] = [
      `session=${sessionToken}`,
      'HttpOnly', // Prevent JavaScript access
      'Path=/',
      `Max-Age=${config.sessionCookieTtlSeconds}`
    ];

    // Add Secure flag in production
    if (config.env === 'production' || config.env === 'staging') {
      cookieAttributes.push('Secure');
    }

    // Add SameSite attribute (configurable)
    cookieAttributes.push(`SameSite=${config.cookieSameSite}`);

    // Add Domain attribute if configured
    if (config.cookieDomain) {
      cookieAttributes.push(`Domain=${config.cookieDomain}`);
    }

    // Set cookie via Set-Cookie header
    res.setHeader('Set-Cookie', cookieAttributes.join('; '));

    logger.info(
      {
        traceId,
        sessionId,
        userId: userId || 'none',
        expiresAt: expiresAt.toISOString(),
        ttlSeconds: config.sessionCookieTtlSeconds,
        event: 'session_cookie_issued'
      },
      '[SessionCookie] Session cookie issued'
    );

    return res.status(200).json({
      ok: true,
      sessionId,
      expiresAt: expiresAt.toISOString(),
      traceId
    });
  } catch (error) {
    logger.error(
      {
        traceId,
        error: error instanceof Error ? error.message : 'unknown',
        stack: error instanceof Error ? error.stack : undefined,
        event: 'session_cookie_issuance_failed'
      },
      '[SessionCookie] Failed to issue session cookie'
    );

    return res.status(500).json({
      error: 'Internal server error',
      code: 'SESSION_COOKIE_FAILED',
      traceId
    });
  }
});

/**
 * GET /whoami
 * Debug endpoint to verify authentication and identify auth source
 * 
 * Security:
 * - Protected endpoint (requires session cookie OR Bearer JWT)
 * - Uses authSessionOrJwt middleware to detect auth source
 * 
 * Response:
 * - authenticated: true
 * - userId: User ID from token (if present)
 * - sessionId: Session ID from token
 * - authSource: "cookie" | "bearer"
 * - hasCookieHeader: boolean
 * - hasBearerHeader: boolean
 * - timestamp: Current server timestamp
 */
router.get('/whoami', authSessionOrJwt, (req: Request, res: Response) => {
  const traceId = (req as any).traceId || 'unknown';
  const authReq = req as AuthenticatedRequest;

  // Determine auth source by checking which headers are present
  // Middleware uses cookie first (if valid), then falls back to Bearer JWT
  const hasCookie = Boolean(req.headers.cookie?.includes('session='));
  const hasBearerToken = Boolean(req.headers.authorization?.startsWith('Bearer '));
  
  // If both present, cookie was used (middleware precedence)
  // If only one present, that one was used
  let authSource: 'cookie' | 'bearer' = hasCookie ? 'cookie' : 'bearer';

  const response = {
    authenticated: true,
    userId: authReq.userId || null,
    sessionId: authReq.sessionId || null,
    authSource,
    hasCookieHeader: hasCookie,
    hasBearerHeader: hasBearerToken,
    timestamp: new Date().toISOString(),
    traceId
  };

  logger.debug(
    {
      traceId,
      sessionId: authReq.sessionId,
      userId: authReq.userId || 'none',
      authSource,
      event: 'whoami_accessed'
    },
    '[WhoAmI] Auth context retrieved'
  );

  return res.status(200).json(response);
});

export default router;
