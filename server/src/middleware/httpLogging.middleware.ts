/**
 * HTTP Logging Middleware
 * Phase 2: Request/response summary logging
 * 
 * Features:
 * - One log line per request (with method, path, query)
 * - One log line per response (with status, duration)
 * - Automatic log level based on status code
 * - All logs include traceId + sessionId via req.log
 * - Uses req.originalUrl for consistency between request and response
 */

import { Request, Response, NextFunction } from 'express';

export function httpLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  
  // Log request (keep queryKeys only, not full query values to avoid logging user queries)
  const queryKeys = Object.keys(req.query || {});
  req.log.info({
    method: req.method,
    path: req.path, // Use path instead of originalUrl to avoid query string duplication
    queryKeys: queryKeys.length > 0 ? queryKeys : undefined,
  }, 'HTTP request');
  
  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' 
                : res.statusCode >= 400 ? 'warn' 
                : 'info';
    
    req.log[level]({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
    }, 'HTTP response');
  });
  
  next();
}

