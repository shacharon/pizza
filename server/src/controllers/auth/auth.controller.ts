/**
 * Auth Controller
 * Handles JWT token generation, session cookies, and WebSocket ticket issuance
 *
 * Endpoints:
 * - POST /api/v1/auth/token - Generate JWT token with sessionId (public)
 * - POST /api/v1/auth/session - Issue session cookie (protected, requires Bearer JWT)
 * - POST /api/v1/auth/ws-ticket - Generate one-time WS ticket (protected)
 */

import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import crypto from 'crypto';

import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';
import { authenticateJWT, type AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { authSessionOrJwt } from '../../middleware/auth-session-or-jwt.middleware.js';
import { getExistingRedisClient } from '../../lib/redis/redis-client.js';
import { signSessionCookie } from '../../lib/session-cookie/session-cookie.service.js';

const router = Router();
const config = getConfig();

// WS Ticket Constants
const TICKET_TTL_SECONDS = 60;
const TICKET_PREFIX = 'ws_ticket:';

/**
 * Request schema for token generation
 * sessionId is optional - if not provided, one will be generated
 */
const TokenRequestSchema = z.object({
  sessionId: z.string().optional()
});

/**
 * Generate a session ID in format: sess_<uuid>
 */
function generateSessionId(): string {
  return `sess_${randomUUID()}`;
}

/**
 * POST /api/v1/auth/token
 * Generate JWT token with sessionId
 *
 * Request body (optional):
 * - sessionId?: string - existing session ID to include in token
 *
 * Response:
 * - token: string - JWT token (HS256)
 * - sessionId: string - session ID included in the token
 *
 * Security:
 * - Public endpoint (no auth required for initial token)
 * - Rate limited via global rate limiting
 * - JWT signed with JWT_SECRET from env
 */
router.post('/token', async (req: Request, res: Response) => {
  const traceId = (req as any).traceId || 'unknown';

  try {
    // Validate request body
    const parseResult = TokenRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      logger.warn(
        {
          traceId,
          errors: parseResult.error.issues
        },
        '[Auth] Invalid token request'
      );

      return res.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.issues,
        traceId
      });
    }

    // Use provided sessionId or generate a new one
    const sessionId = parseResult.data.sessionId || generateSessionId();

    // Generate JWT token with all required claims
    const payload = {
      sessionId,
      iat: Math.floor(Date.now() / 1000) // Issued at (seconds since epoch)
    };
    const token = jwt.sign(payload, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '30d'
    });

    logger.info(
      {
        traceId,
        sessionId,
        wasProvided: Boolean(parseResult.data.sessionId)
      },
      '[Auth] JWT token generated'
    );

    return res.status(200).json({
      token,
      sessionId,
      traceId
    });
  } catch (error) {
    logger.error(
      {
        traceId,
        error: error instanceof Error ? error.message : 'unknown',
        stack: error instanceof Error ? error.stack : undefined
      },
      '[Auth] Token generation failed'
    );

    return res.status(500).json({
      error: 'Internal server error',
      code: 'TOKEN_GENERATION_FAILED',
      traceId
    });
  }
});

/**
 * Generate a cryptographically secure random ticket
 * Using UUID format for consistency
 */
function generateTicket(): string {
  return randomUUID();
}

/**
 * POST /api/v1/auth/ws-ticket
 * Generate one-time WebSocket ticket
 * 
 * Security:
 * - Protected endpoint (requires JWT via authenticateJWT middleware)
 * - Ticket stored in Redis with userId and sessionId from JWT
 * - Ticket is deleted on first use (one-time)
 * - Short TTL (60s) prevents abuse
 * 
 * Headers:
 * - Authorization: Bearer <JWT> (required)
 * 
 * Response:
 * - ticket: string - one-time ticket for WebSocket connection
 * - ttlSeconds: number - TTL (60s)
 * - traceId: string - request trace ID
 * 
 * Error codes:
 * - MISSING_SESSION (401): JWT missing sessionId
 * - WS_TICKET_REDIS_NOT_READY (503): Redis not available (client should retry with backoff)
 */
router.post('/ws-ticket', authenticateJWT, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const traceId = (req as any).traceId || 'unknown';

  try {
    // Extract authenticated identity from JWT (canonical source)
    // NEVER read sessionId from headers, body, or query params
    const userId = authReq.userId;
    const sessionId = authReq.sessionId;

    if (!sessionId) {
      logger.warn(
        {
          traceId,
          userId: userId ? 'present' : 'missing'
        },
        '[WSTicket] Missing sessionId in JWT'
      );

      return res.status(401).json({
        error: 'NOT_AUTHORIZED',
        code: 'MISSING_SESSION',
        message: 'JWT must contain sessionId',
        traceId
      });
    }

    // Get Redis client (must be initialized at boot, not lazy-loaded)
    const redis = getExistingRedisClient();

    if (!redis) {
      logger.error(
        {
          event: 'ws_ticket_redis_unavailable',
          traceId,
          sessionId,
          pid: process.pid,
        },
        '[WSTicket] Redis client not available - check boot logs for redis_boot_status'
      );

      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        code: 'WS_TICKET_REDIS_NOT_READY',
        message: 'WebSocket ticket service temporarily unavailable - Redis not ready',
        traceId
      });
    }

    // Generate ticket
    const ticket = generateTicket();
    const redisKey = `${TICKET_PREFIX}${ticket}`;

    // Store ticket in Redis with identity matching WebSocketManager expectations
    const ticketData = JSON.stringify({
      userId: userId || null,
      sessionId,
      createdAt: Date.now()
    });

    await redis.setex(redisKey, TICKET_TTL_SECONDS, ticketData);

    logger.info(
      {
        traceId,
        sessionId,
        hasUserId: Boolean(userId),
        ticketHash: crypto.createHash('sha256').update(ticket).digest('hex').substring(0, 12),
        ttl: TICKET_TTL_SECONDS
      },
      '[WSTicket] Ticket generated'
    );

    return res.status(200).json({
      ticket,
      ttlSeconds: TICKET_TTL_SECONDS,
      traceId
    });

  } catch (error) {
    logger.error(
      {
        traceId,
        error: error instanceof Error ? error.message : 'unknown',
        stack: error instanceof Error ? error.stack : undefined
      },
      '[WSTicket] Ticket generation failed'
    );

    return res.status(500).json({
      error: 'Internal server error',
      code: 'TICKET_GENERATION_FAILED',
      traceId
    });
  }
});

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

/**
 * GET /api/v1/auth/whoami
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
