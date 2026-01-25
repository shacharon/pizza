/**
 * WebSocket Ticket Controller
 * Generates one-time tickets for secure WebSocket authentication
 * 
 * Security:
 * - Requires existing JWT authentication
 * - Generates cryptographically random tickets (128+ bits)
 * - Stores in Redis with 30s TTL
 * - One-time use (deleted on first use)
 * - No JWT in WebSocket URL
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import { getExistingRedisClient } from '../../lib/redis/redis-client.js';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

const router = Router();

const TICKET_TTL_SECONDS = 30;
const TICKET_PREFIX = 'ws_ticket:';

/**
 * Generate a cryptographically secure random ticket
 * 128 bits (16 bytes) = 32 hex characters
 */
function generateTicket(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * POST /api/v1/ws-ticket
 * Generate one-time WebSocket ticket
 * 
 * Headers:
 * - Authorization: Bearer <JWT> (required)
 * 
 * Response:
 * - ticket: string - one-time ticket for WebSocket connection
 * - expiresInSeconds: number - TTL (30s)
 * 
 * Security:
 * - Protected endpoint (requires JWT)
 * - Ticket stored in Redis with userId and sessionId
 * - Ticket is deleted on first use (one-time)
 * - Short TTL prevents abuse
 */
router.post('/ws-ticket', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const traceId = req.traceId || 'unknown';

  try {
    // Extract authenticated identity from JWT middleware
    const userId = authReq.userId;
    const sessionId = authReq.sessionId;

    if (!sessionId) {
      logger.warn({
        traceId,
        userId: userId ? 'present' : 'missing'
      }, '[WSTicket] Missing sessionId in JWT');

      return res.status(401).json({
        error: 'Unauthorized',
        code: 'MISSING_SESSION',
        message: 'JWT must contain sessionId',
        traceId
      });
    }

    // Get Redis client
    const redis = getExistingRedisClient();

    if (!redis) {
      logger.error({
        traceId,
        sessionId
      }, '[WSTicket] Redis client not available');

      return res.status(503).json({
        error: 'Service unavailable',
        code: 'REDIS_UNAVAILABLE',
        message: 'Ticket service temporarily unavailable',
        traceId
      });
    }

    // Generate ticket
    const ticket = generateTicket();
    const redisKey = `${TICKET_PREFIX}${ticket}`;

    // Store ticket in Redis with identity
    const ticketData = JSON.stringify({
      userId: userId || null,
      sessionId,
      createdAt: Date.now()
    });

    await redis.setex(redisKey, TICKET_TTL_SECONDS, ticketData);

    logger.info({
      traceId,
      sessionId,
      hasUserId: Boolean(userId),
      ticketHash: crypto.createHash('sha256').update(ticket).digest('hex').substring(0, 12),
      ttl: TICKET_TTL_SECONDS
    }, '[WSTicket] Ticket generated');

    return res.status(200).json({
      ticket,
      expiresInSeconds: TICKET_TTL_SECONDS,
      traceId
    });

  } catch (error) {
    logger.error({
      traceId,
      error: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined
    }, '[WSTicket] Ticket generation failed');

    return res.status(500).json({
      error: 'Internal server error',
      code: 'TICKET_GENERATION_FAILED',
      traceId
    });
  }
});

export default router;
