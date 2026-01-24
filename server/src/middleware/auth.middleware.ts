/**
 * JWT Authentication Middleware
 * P0 Security: Protect HTTP API endpoints
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

/**
 * JWT authentication middleware
 * Extracts and verifies JWT from Authorization header
 * Sets req.userId and req.sessionId from token
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({
      traceId: req.traceId,
      path: req.path,
      method: req.method
    }, '[Auth] Missing or invalid Authorization header');
    
    res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_AUTH',
      traceId: req.traceId || 'unknown'
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; sessionId?: string };
    
    if (!decoded.sessionId) {
      throw new Error('Token missing sessionId');
    }

    const authReq = req as AuthenticatedRequest;
    if (decoded.userId) {
      authReq.userId = decoded.userId;
    }
    authReq.sessionId = decoded.sessionId;
    
    // Set in ctx for backward compatibility
    if (!req.ctx) {
      (req as any).ctx = {};
    }
    req.ctx.sessionId = decoded.sessionId;
    if (decoded.userId) {
      (req as any).userId = decoded.userId;
    }

    logger.debug({
      traceId: req.traceId,
      sessionId: decoded.sessionId,
      userId: decoded.userId,
      path: req.path
    }, '[Auth] JWT verified');

    next();
  } catch (error) {
    logger.warn({
      traceId: req.traceId,
      path: req.path,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[Auth] JWT verification failed');
    
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
export function optionalJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; sessionId?: string };
    
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
      if (decoded.userId) {
        (req as any).userId = decoded.userId;
      }
    }
  } catch (error) {
    // Ignore invalid tokens in optional mode
  }

  next();
}
