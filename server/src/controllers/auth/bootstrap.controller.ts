/**
 * Bootstrap Controller
 * Handles session bootstrap (initial session creation)
 * 
 * Endpoint:
 * - POST /api/v1/auth/bootstrap - Create new session (public, no auth required)
 * 
 * Flow:
 * 1. Generate new session ID (UUID)
 * 2. Store in Redis (7-day TTL)
 * 3. Set HttpOnly session cookie
 * 4. Return { ok: true }
 * 
 * This endpoint replaces the JWT token flow for pure server-authoritative sessions.
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';
import { getSessionStore, RedisUnavailableError } from '../../lib/session/redis-session.store.js';

const router = Router();
const config = getConfig();

/**
 * POST /api/v1/auth/bootstrap
 * Create new session and set HttpOnly cookie
 * 
 * Public endpoint - NO authentication required
 * 
 * Security:
 * - Session stored in Redis (server-authoritative)
 * - HttpOnly cookie prevents JavaScript access
 * - Same cookie config as existing session cookies
 * - 7-day sliding TTL
 * 
 * Response:
 * - Sets session cookie via Set-Cookie header
 * - Returns JSON: { ok: true, sessionId }
 */
router.post('/bootstrap', async (req: Request, res: Response) => {
  const traceId = (req as any).traceId || 'unknown';

  try {
    // Get session store
    const sessionStore = getSessionStore();

    if (!sessionStore.isAvailable()) {
      logger.error({
        event: 'bootstrap_redis_unavailable',
        traceId
      }, '[Bootstrap] Redis not available');

      return res.status(503).json({
        error: 'Service Unavailable',
        code: 'SESSION_STORE_UNAVAILABLE',
        message: 'Session bootstrap temporarily unavailable',
        traceId
      });
    }

    // Create new session in Redis (no userId for anonymous sessions)
    const sessionId = await sessionStore.createSession();

    // Build cookie attributes (same config as existing session cookies)
    const cookieAttributes: string[] = [
      `session=${sessionId}`,
      'HttpOnly', // Prevent JavaScript access
      'Path=/',
      `Max-Age=${7 * 24 * 60 * 60}` // 7 days to match Redis TTL
    ];

    // Add Secure flag in production/staging
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

    logger.info({
      event: 'session_bootstrapped',
      traceId,
      sessionId: sessionId.substring(0, 12) + '...',
      cookieDomain: config.cookieDomain || 'host-only',
      sameSite: config.cookieSameSite,
      secure: config.env === 'production' || config.env === 'staging'
    }, '[Bootstrap] Session bootstrapped successfully');

    return res.status(200).json({
      ok: true,
      sessionId: sessionId.substring(0, 12) + '...', // Partial for logging only
      traceId
    });

  } catch (error) {
    // Handle Redis unavailability separately (503)
    if (error instanceof RedisUnavailableError) {
      logger.error({
        event: 'redis_unavailable',
        traceId,
        route: '/auth/bootstrap',
        error: error.message,
        originalError: error.originalError?.message
      }, '[Bootstrap] Redis unavailable during session creation');

      return res.status(503).json({
        ok: false,
        error: 'REDIS_UNAVAILABLE',
        message: 'Session service temporarily unavailable',
        traceId
      });
    }

    // Other errors (unexpected) - 500
    logger.error({
      event: 'bootstrap_failed',
      traceId,
      error: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined
    }, '[Bootstrap] Failed to bootstrap session');

    return res.status(500).json({
      error: 'Internal Server Error',
      code: 'BOOTSTRAP_FAILED',
      traceId
    });
  }
});

export default router;
