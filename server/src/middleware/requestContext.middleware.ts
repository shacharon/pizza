/**
 * Request Context Middleware
 * Phase 1: TraceId propagation for deterministic debugging
 * 
 * Ensures every request has a unique traceId:
 * - Reuses x-trace-id from client if provided
 * - Generates UUID if not provided
 * - Attaches req.traceId and req.log (child logger with traceId)
 * - Returns x-trace-id in response header
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger/structured-logger.js';

declare global {
  namespace Express {
    interface Request {
      traceId: string;
      log: typeof logger;
    }
  }
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Get or generate traceId
  const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
  
  // Attach to request
  req.traceId = traceId;
  
  // Create child logger with traceId
  req.log = logger.child({ traceId });
  
  // Add traceId to response headers
  res.setHeader('x-trace-id', traceId);
  
  next();
}

