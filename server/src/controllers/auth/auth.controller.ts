/**
 * Auth Controller
 * Handles JWT token generation and WebSocket ticket issuance
 *
 * Endpoints:
 * - POST /api/v1/auth/token - Generate JWT token with sessionId (public)
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
import { getExistingRedisClient } from '../../lib/redis/redis-client.js';

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

    // Generate JWT token
    const payload = { sessionId };
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
 * - WS_REDIS_UNAVAILABLE (503): Redis not available
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

    // Get Redis client
    const redis = getExistingRedisClient();

    if (!redis) {
      logger.error(
        {
          traceId,
          sessionId
        },
        '[WSTicket] Redis client not available'
      );

      return res.status(503).json({
        error: 'WS_REDIS_UNAVAILABLE',
        code: 'WS_REDIS_UNAVAILABLE',
        message: 'Ticket service temporarily unavailable',
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

export default router;
