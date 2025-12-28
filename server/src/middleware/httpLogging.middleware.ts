/**
 * HTTP Logging Middleware
 * Phase 1: Request/response summary logging
 * 
 * Features:
 * - One log line per request (with method, path, query)
 * - One log line per response (with status, duration)
 * - Automatic log level based on status code
 * - All logs include traceId via req.log
 */

import { Request, Response, NextFunction } from 'express';

export function httpLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  
  // Log request
  req.log.info({
    msg: 'HTTP request',
    method: req.method,
    path: req.path,
    query: req.query,
  });
  
  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' 
                : res.statusCode >= 400 ? 'warn' 
                : 'info';
    
    req.log[level]({
      msg: 'HTTP response',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });
  
  next();
}

