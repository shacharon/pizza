/**
 * Bootstrap Controller
 * Issues HttpOnly session cookie without requiring JWT
 *
 * Endpoint: POST /api/v1/auth/bootstrap
 * - Public endpoint (no auth required)
 * - Sets HttpOnly session cookie
 * - Returns: { ok: true, sessionId, traceId }
 *
 * Use case: Cookie-only auth mode (no JWT in frontend)
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../lib/logger/structured-logger.js';
import { randomUUID } from 'crypto';
import { signSessionCookie } from '../../lib/session-cookie/session-cookie.service.js';
import { getConfig } from '../../config/env.js';
const router = Router();

interface BootstrapResponse {
  ok: boolean;
  sessionId: string;
  traceId: string;
}

/**
 * POST /bootstrap
 * Issues HttpOnly session cookie (no JWT required)
 */
router.post('/', async (req: Request, res: Response) => {
  const traceId = randomUUID();
  const config = getConfig();

  try {
    // Generate session ID
    const sessionId = `sess_${randomUUID()}`;
    const userId = undefined; // Anonymous user for cookie-only bootstrap

    // Sign the session cookie with SESSION_COOKIE_SECRET
    const signedCookie = signSessionCookie(sessionId, userId, {
      secret: config.sessionCookieSecret,
      ttlSeconds: config.sessionCookieTtlSeconds
    });

    // Set HttpOnly session cookie (use config for cross-subdomain: COOKIE_DOMAIN, COOKIE_SAMESITE)
    const cookieOpts: Record<string, unknown> = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: config.cookieSameSite,
      maxAge: config.sessionCookieTtlSeconds * 1000
    };
    if (config.cookieDomain) {
      cookieOpts.domain = config.cookieDomain;
    }
    res.cookie('session', signedCookie, cookieOpts);

    logger.info({
      traceId,
      event: 'bootstrap_cookie_issued',
      sessionId: sessionId.substring(0, 20) + '...',
      msg: 'Bootstrap session cookie issued'
    });

    const response: BootstrapResponse = {
      ok: true,
      sessionId,
      traceId
    };

    return res.json(response);
  } catch (error) {
    logger.error({
      traceId,
      event: 'bootstrap_failed',
      error,
      msg: 'Failed to issue bootstrap cookie'
    });

    return res.status(500).json({
      ok: false,
      error: 'Failed to bootstrap session',
      traceId
    });
  }
});

export default router;
