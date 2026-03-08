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
import { authSessionOrJwt, type AuthenticatedRequest } from '../../middleware/auth-session-or-jwt.middleware.js';
import { getExistingRedisClient } from '../../lib/redis/redis-client.js';
import { setTicket as setMemoryTicket } from '../../lib/ws-ticket-memory-store.js';

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
 * - Protected endpoint (requires session cookie OR JWT via authSessionOrJwt middleware)
 * - Ticket stored in Redis with userId and sessionId
 * - Ticket is deleted on first use (one-time)
 * - Short TTL (60s) prevents abuse
 * 
 * Headers:
 * - Cookie: session=<sessionId> (preferred) OR Authorization: Bearer <JWT>
 * 
 * Response:
 * - wsAvailable: boolean - when false, WebSocket is unavailable (degraded mode); client should use polling/SSE
 * - ticket?: string - present when wsAvailable is true
 * - ttlSeconds?: number - TTL (60s) when ticket is present
 * - message?: string - human-readable when wsAvailable is false
 * - traceId: string - request trace ID
 * 
 * When Redis is down: returns 200 with wsAvailable: false (soft fail). No 503.
 * Optional: set REDIS_WS_MEMORY_FALLBACK=true to issue in-memory tickets when Redis is down (single-instance dev).
 * 
 * Error codes:
 * - MISSING_SESSION (401): Missing sessionId
 */
router.post('/ws-ticket', authSessionOrJwt, async (req: Request, res: Response) => {
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

    // Get Redis client (or degraded / in-memory fallback when Redis is down)
    const redis = getExistingRedisClient();
    const useMemoryFallback = process.env.REDIS_WS_MEMORY_FALLBACK === 'true';

    if (!redis) {
      // Option A: in-memory tickets (single-instance dev) when explicitly enabled
      if (useMemoryFallback) {
        const ticket = generateTicket();
        const ticketData = {
          userId: userId || null,
          sessionId,
          createdAt: Date.now()
        };
        setMemoryTicket(ticket, ticketData, TICKET_TTL_SECONDS);
        logger.info(
          { traceId, sessionId, store: 'memory' },
          '[WSTicket] Ticket generated (in-memory fallback, Redis down)'
        );
        return res.status(200).json({
          wsAvailable: true,
          ticket,
          ttlSeconds: TICKET_TTL_SECONDS,
          traceId
        });
      }

      // Option B: degraded mode — 200 with wsAvailable: false (no ticket). Client uses polling/SSE.
      logger.warn(
        { traceId, sessionId, event: 'ws_ticket_degraded' },
        '[WSTicket] Redis unavailable — returning wsAvailable: false (soft fail)'
      );
      return res.status(200).json({
        wsAvailable: false,
        message: 'WebSocket unavailable (degraded mode). Use polling or SSE for updates.',
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
      wsAvailable: true,
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
