/**
 * WebSocket Authentication Verifier
 * Handles origin validation and ticket-based authentication
 */

import type Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import { validateOrigin } from '../../lib/security/origin-validator.js';
import { HARD_CLOSE_REASONS } from './ws-close-reasons.js';

/**
 * Verify client connection eligibility
 * Phase 1: Origin validation
 * Phase 2: HTTPS enforcement in production
 * Phase 3: Ticket-based authentication
 */
export async function verifyClient(
  info: { origin?: string; req: any; secure?: boolean },
  allowedOrigins: string[],
  redis: Redis.Redis | null
): Promise<boolean> {
  const env = process.env.NODE_ENV || 'development';
  const isProdOrStaging = env === 'production' || env === 'staging';
  const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false'; // default true

  // Prefer XFF (behind ALB/Proxy), fallback to socket remoteAddress
  const ip =
    (info.req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()) ||
    info.req?.socket?.remoteAddress;

  // Phase 1: Production/Staging security gates
  if (isProdOrStaging) {
    if (allowedOrigins.includes('*')) {
      logger.error({ ip }, 'WS: Rejected - wildcard forbidden in production');
      return false;
    }
    if (allowedOrigins.includes('__PRODUCTION_MISCONFIGURED__')) {
      logger.error({ ip }, 'WS: Rejected - misconfigured origins');
      return false;
    }

    // Enforce HTTPS via proxy header (TLS terminates at ALB)
    const xfProto = (info.req?.headers?.['x-forwarded-proto'] ?? '').toString();
    if (xfProto && xfProto !== 'https') {
      logger.warn({ ip, protocol: xfProto }, 'WS: Rejected - non-HTTPS in production');
      return false;
    }
  }

  // Phase 2: Origin validation using shared utility
  const rawOrigin = (info.origin ?? info.req?.headers?.origin)?.toString();

  // Special case: localhost without origin ONLY in test mode
  const isLocal = ip === '127.0.0.1' || ip === '::1';
  const isTestMode = env === 'test';
  const allowNoOrigin = isTestMode && isLocal; // Only in test, not dev or staging

  const result = validateOrigin(rawOrigin, {
    allowedOrigins,
    allowNoOrigin,
    isProduction: isProdOrStaging, // Treat staging like production
    allowWildcardInDev: !isProdOrStaging, // Only in dev/test
    context: 'websocket'
  });

  if (!result.allowed) {
    logger.warn({ ip, origin: rawOrigin, reason: result.reason }, 'WS: Connection rejected');
    (info.req as any).wsRejectReason = HARD_CLOSE_REASONS.ORIGIN_BLOCKED;
    return false;
  }

  // Phase 3: Authentication
  if (requireAuth) {
    return await verifyTicket(info, redis, ip, rawOrigin);
  } else {
    logger.warn(
      { ip },
      'WS: Authentication disabled via WS_REQUIRE_AUTH=false'
    );
  }

  return true;
}

/**
 * Verify one-time authentication ticket
 */
async function verifyTicket(
  info: { origin?: string; req: any; secure?: boolean },
  redis: Redis.Redis | null,
  ip: string | undefined,
  rawOrigin: string | undefined
): Promise<boolean> {
  // Extract ticket from query param (SECURE: one-time ticket, not JWT)
  const url = new URL(info.req.url || '', 'ws://dummy');
  const ticket = url.searchParams.get('ticket');

  if (!ticket) {
    logger.warn({ ip, origin: rawOrigin }, 'WS: Rejected - no auth ticket');
    (info.req as any).wsRejectReason = HARD_CLOSE_REASONS.NOT_AUTHORIZED;
    return false;
  }

  // Verify ticket with Redis (one-time use)
  if (!redis) {
    logger.error({ ip, origin: rawOrigin }, 'WS: Rejected - Redis unavailable for ticket verification');
    return false;
  }

  try {
    const redisKey = `ws_ticket:${ticket}`;

    // Get and delete ticket atomically (one-time use)
    const ticketData = await redis.get(redisKey);

    if (!ticketData) {
      logger.warn(
        {
          ip,
          origin: rawOrigin,
          ticketHash: crypto.createHash('sha256').update(ticket).digest('hex').substring(0, 12)
        },
        'WS: Rejected - ticket invalid or expired'
      );
      (info.req as any).wsRejectReason = HARD_CLOSE_REASONS.NOT_AUTHORIZED;
      return false;
    }

    // Delete ticket immediately (one-time use)
    await redis.del(redisKey);

    // Parse ticket data
    const ticketPayload = JSON.parse(ticketData) as {
      userId?: string | null;
      sessionId: string;
      createdAt: number;
    };

    // Attach identity to request for handleConnection
    (info.req as any).userId = ticketPayload.userId || undefined;
    (info.req as any).sessionId = ticketPayload.sessionId;

    logger.debug(
      {
        ip,
        sessionId: ticketPayload.sessionId.substring(0, 12) + '...',
        hasUserId: Boolean(ticketPayload.userId),
        ticketAgeMs: Date.now() - ticketPayload.createdAt
      },
      'WS: Authenticated via ticket'
    );

    return true;
  } catch (error) {
    logger.error(
      {
        ip,
        origin: rawOrigin,
        error: error instanceof Error ? error.message : 'unknown'
      },
      'WS: Rejected - ticket verification error'
    );
    (info.req as any).wsRejectReason = HARD_CLOSE_REASONS.NOT_AUTHORIZED;
    return false;
  }
}
