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
 * 
 * Log Noise Reduction:
 * - OPTIONS requests: only log errors (4xx/5xx) or 1% sample
 * - Regular requests: DEBUG level (INFO for errors/warnings)
 * - Responses: DEBUG for 2xx; ERROR for 5xx; WARN for 4xx on real API paths
 * - Scanner 4xx (/, phpunit, .env, favicon): not logged (was filling CloudWatch)
 * - Slow requests (>5000ms): always INFO regardless of method
 */

import { Request, Response, NextFunction } from 'express';
import { shouldSampleRandom, SAMPLING_RATES, SLOW_THRESHOLDS } from '../lib/logging/sampling.js';
import { resolveHttpResponseLog } from '../lib/logging/http-response-log.js';

export function httpLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const isOptions = req.method === 'OPTIONS';
  
  // Log request
  // OPTIONS: skip unless sampled (1%)
  // Regular: DEBUG level
  if (!isOptions || shouldSampleRandom(SAMPLING_RATES.LOW)) {
    const queryKeys = Object.keys(req.query || {});
    req.log.debug({
      method: req.method,
      path: req.path,
      queryKeys: queryKeys.length > 0 ? queryKeys : undefined,
      ...(isOptions && { sampled: true })
    }, 'HTTP request');
  }
  
  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const decision = resolveHttpResponseLog({
      path: req.path,
      originalUrl: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      slowThresholdMs: SLOW_THRESHOLDS.HTTP,
    });
    const isError = res.statusCode >= 500;
    const isClientError = res.statusCode >= 400 && res.statusCode < 500;

    if (decision.skip) {
      return;
    }

    // OPTIONS: only log errors or 1% sample
    const shouldLogOptions = isOptions && (isError || isClientError || shouldSampleRandom(SAMPLING_RATES.LOW));
    const shouldLogRegular = !isOptions;

    if (shouldLogOptions || shouldLogRegular) {
      req.log[decision.level]({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        ...(isOptions && decision.level === 'debug' && { sampled: true }),
        ...(duration > SLOW_THRESHOLDS.HTTP && { slow: true })
      }, 'HTTP response');
    }
  });
  
  next();
}

