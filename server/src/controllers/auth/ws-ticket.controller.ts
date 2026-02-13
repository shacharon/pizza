/**
 * WebSocket Ticket Controller
 * Handles one-time WebSocket ticket generation
 *
 * Endpoints:
 * - POST /ws-ticket - Generate one-time WS ticket (protected)
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import crypto from 'crypto';

import { logger } from '../../lib/logger/structured-logger.js';
import { authenticateJWT, type AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { getExistingRedisClient } from '../../lib/redis/redis-client.js';

const router = Router();

// WS Ticket Constants
const TICKET_TTL_SECONDS = 60;
const TICKET_PREFIX = 'ws_ticket:';

/**
 * Generate a cryptographically secure random ticket
 * Using UUID format for consistency
 */
function generateTicket(): string {
  return randomUUID();
}

/**
 * POST /ws-ticket
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

export default router;
