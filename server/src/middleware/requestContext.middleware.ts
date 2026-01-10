/**
 * Request Context Middleware
 * Phase 2: TraceId + SessionId propagation for deterministic debugging
 * 
 * Ensures every request has proper context:
 * - traceId: Reuses x-trace-id from client or generates UUID
 * - sessionId: Extracts from x-session-id header (optional)
 * - Attaches req.ctx = { traceId, sessionId }
 * - Attaches req.log (child logger with traceId + sessionId)
 * - Returns x-trace-id in response header
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger/structured-logger.js';

export interface RequestContext {
  traceId: string;
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      traceId: string;
      ctx: RequestContext;
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
  
  // Extract sessionId from header (optional)
  const sessionId = req.headers['x-session-id'] as string | undefined;
  
  // Create context object
  const ctx: RequestContext = {
    traceId,
    ...(sessionId && { sessionId }),
  };
  
  // Attach to request
  req.traceId = traceId;
  req.ctx = ctx;
  
  // Create child logger with traceId + sessionId
  req.log = logger.child(ctx);
  
  // Add traceId to response headers
  res.setHeader('x-trace-id', traceId);
  
  next();
}

