/**
 * Session Cookie Auth Controller
 * Handles session cookie issuance
 * 
 * Endpoint:
 * - POST /api/v1/auth/session - Issue session cookie (requires Bearer JWT)
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';
import { authenticateJWT, type AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { signSessionCookie } from '../../lib/session-cookie/session-cookie.service.js';

const router = Router();
const config = getConfig();

/**
 * POST /api/v1/auth/session
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

export default router;
