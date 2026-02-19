/**
 * Request Context Middleware
 * Phase 2: TraceId propagation for deterministic debugging
 *
 * Ensures every request has proper context:
 * - traceId: Reuses x-trace-id from client (sanitized) or generates UUID
 * - Attaches req.ctx = { traceId }
 * - Attaches req.log (child logger with traceId)
 * - Returns x-trace-id in response header
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger/structured-logger.js';

export interface RequestContext {
  traceId: string;
  sessionId?: string; // Added for JWT session tracking
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

function resolveTraceId(req: Request): string {
  const raw = req.headers['x-trace-id'];
  const rawTraceId = typeof raw === 'string' ? raw : undefined;

  // Allow only safe chars, bounded length; block CR/LF implicitly
  if (rawTraceId && rawTraceId.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(rawTraceId)) {
    return rawTraceId;
  }

  return uuidv4();
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const traceId = resolveTraceId(req);

  const ctx: RequestContext = { traceId };

  req.traceId = traceId;
  req.ctx = ctx;

  req.log = logger.child(ctx);

  res.setHeader('x-trace-id', traceId);

  next();
}
