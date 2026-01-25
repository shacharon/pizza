/**
 * JWT Authentication Middleware
 * P0 Security: Protect HTTP API endpoints
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';
import jwt from 'jsonwebtoken';

/**
 * Fail-fast JWT secret resolver (TypeScript-safe)
 */
function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'dev-secret-change-in-production' || secret.length < 32) {
    throw new Error(
      '[P0 Security] JWT_SECRET must be set to a secure value (>=32 chars) and must not be the dev default'
    );
  }

  return secret;
}

const JWT_SECRET = requireJwtSecret();

type JwtClaims = {
  userId?: string;
  sessionId?: string;
  exp?: number;
  iat?: number;
};

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

/**
 * JWT authentication middleware
 * Extracts and verifies JWT from Authorization header
 * Sets req.userId and req.sessionId from token
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(
      {
        traceId: req.traceId,
        path: req.path,
        method: req.method
      },
      '[Auth] Missing or invalid Authorization header'
    );

    res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_AUTH',
      traceId: req.traceId || 'unknown'
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '30d'
    }) as JwtClaims;

    if (!decoded.sessionId) {
      throw new Error('Token missing sessionId');
    }

    if (!decoded.exp) {
      throw new Error('Token missing expiration (exp)');
    }

    const authReq = req as AuthenticatedRequest;

    if (decoded.userId) {
      authReq.userId = decoded.userId;
    }

    authReq.sessionId = decoded.sessionId;

    // Backward compatibility: ctx holds sessionId only (single source of truth)
    if (!req.ctx) {
      (req as any).ctx = {};
    }

    req.ctx.sessionId = decoded.sessionId;

    logger.debug(
      {
        traceId: req.traceId,
        sessionId: decoded.sessionId,
        userId: decoded.userId,
        path: req.path
      },
      '[Auth] JWT verified'
    );

    next();
  } catch (error) {
    logger.warn(
      {
        traceId: req.traceId,
        path: req.path,
        error: error instanceof Error ? error.message : 'unknown'
      },
      '[Auth] JWT verification failed'
    );

    res.status(401).json({
      error: 'Unauthorized',
      code: 'INVALID_TOKEN',
      traceId: req.traceId || 'unknown'
    });
  }
}

/**
 * Optional JWT middleware
 * Same as authenticateJWT but allows requests without token
 */
export function optionalJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '30d'
    }) as JwtClaims;

    if (decoded.sessionId) {
      const authReq = req as AuthenticatedRequest;

      if (decoded.userId) {
        authReq.userId = decoded.userId;
      }

      authReq.sessionId = decoded.sessionId;

      if (!req.ctx) {
        (req as any).ctx = {};
      }

      req.ctx.sessionId = decoded.sessionId;
    }
  } catch (error) {
    // Optional mode: continue without auth, but log for monitoring
    logger.debug(
      {
        traceId: req.traceId,
        path: req.path,
        error: error instanceof Error ? error.message : 'unknown'
      },
      '[Auth] Optional JWT verification failed'
    );
  }

  next();
}
