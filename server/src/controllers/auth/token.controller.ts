/**
 * Token Controller
 * Handles JWT token generation
 *
 * Endpoints:
 * - POST /token - Generate JWT token with sessionId (public)
 */

import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';
import {
  extractSessionCookieFromHeader,
  verifySessionCookie,
} from '../../lib/session-cookie/session-cookie.service.js';

const router = Router();
const config = getConfig();

/**
 * Body may still include sessionId so existing clients keep validating.
 * That value is never signed. See issueSession().
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

type IssuedSession = {
  sessionId: string;
  source: 'cookie' | 'jwt' | 'new';
};

function sessionIdFromVerifiedCookie(req: Request): string | null {
  const raw = extractSessionCookieFromHeader(req.headers.cookie);
  if (!raw) {
    return null;
  }
  const decoded = verifySessionCookie(raw, config.sessionCookieSecret);
  if (!decoded || typeof decoded.sessionId !== 'string' || decoded.sessionId.length === 0) {
    return null;
  }
  return decoded.sessionId;
}

function sessionIdFromVerifiedJwt(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      maxAge: '30d',
      clockTolerance: 5,
    }) as { sessionId?: unknown };
    if (typeof decoded.sessionId !== 'string' || decoded.sessionId.length === 0) {
      return null;
    }
    return decoded.sessionId;
  } catch {
    return null;
  }
}

/**
 * Re-issue only a session the caller already proved with a valid cookie or JWT.
 * Cookie wins, matching authSessionOrJwt. Otherwise mint a new id.
 */
function issueSession(req: Request): IssuedSession {
  const fromCookie = sessionIdFromVerifiedCookie(req);
  if (fromCookie) {
    return { sessionId: fromCookie, source: 'cookie' };
  }
  const fromJwt = sessionIdFromVerifiedJwt(req);
  if (fromJwt) {
    return { sessionId: fromJwt, source: 'jwt' };
  }
  return { sessionId: generateSessionId(), source: 'new' };
}

/**
 * POST /token
 * Generate JWT token with sessionId
 *
 * Request body (optional):
 * - sessionId?: string - accepted and ignored; not used as the signed subject
 *
 * Response:
 * - token: string - JWT token (HS256)
 * - sessionId: string - session ID included in the token
 *
 * Security:
 * - Public endpoint (no auth required for an initial token)
 * - A presented cookie or Bearer JWT is honored only after verification
 * - Rate limited via global rate limiting
 * - JWT signed with JWT_SECRET from env
 */
router.post('/token', async (req: Request, res: Response) => {
  const traceId = req.traceId || 'unknown';

  try {
    // Validate request body
    const parseResult = TokenRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      logger.warn(
        {
          traceId,
          errors: parseResult.error.issues.map((issue) => ({
            path: issue.path,
            code: issue.code,
          })),
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

    const issued = issueSession(req);
    const sessionId = issued.sessionId;

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
        sessionIdPrefix: sessionId.substring(0, 12),
        source: issued.source
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
        error: error instanceof Error ? error.name : 'unknown'
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

export default router;
