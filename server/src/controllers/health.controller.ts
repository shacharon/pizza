/**
 * Health & Readiness Endpoints
 * 
 * Purpose:
 * - /health: Liveness check (is process alive?)
 * - /ready: Readiness check (can serve traffic? Redis ready?)
 * 
 * ALB Configuration:
 * - Target group healthcheck should use /ready
 * - /health is for container orchestration (ECS/K8s)
 * 
 * P0 Scale Safety:
 * - Production: Redis required for readiness
 * - Development: Redis optional (degraded mode)
 */

import { Request, Response } from 'express';
import { RedisService } from '../infra/redis/redis.service.js';
import { getConfig } from '../config/env.js';
import { logger } from '../lib/logger/structured-logger.js';

const config = getConfig();

/**
 * Liveness check (/health)
 * Returns 200 if process is alive
 * Does NOT check Redis or external dependencies
 * 
 * Use: Container orchestration (ECS/K8s) to restart dead containers
 */
export function livenessHandler(req: Request, res: Response): void {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    checks: {
      process: 'UP'
    }
  });
}

/**
 * Readiness check (/ready)
 * Returns 200 only if ready to serve traffic
 * Checks Redis readiness (required for ws-ticket)
 * 
 * Use: ALB target group healthcheck
 * 
 * HTTP codes:
 * - 200: Ready (ALB routes traffic)
 * - 503: Not ready (ALB drains traffic)
 */
export async function readinessHandler(req: Request, res: Response): Promise<void> {
  const isProduction = config.env === 'production';
  const isStaging = config.env === 'staging';

  const healthStatus = {
    status: 'UP',
    ready: false,
    timestamp: new Date().toISOString(),
    checks: {
      process: 'UP',
      redis: 'UNKNOWN'
    }
  };

  // Check Redis readiness
  const redisReady = RedisService.isReady();

  if (redisReady) {
    healthStatus.checks.redis = 'UP';
    healthStatus.ready = true;
  } else {
    healthStatus.checks.redis = 'DOWN';
    healthStatus.ready = false;

    // Log based on environment
    if (isProduction || isStaging) {
      logger.error({
        event: 'readiness_redis_down',
        env: config.env,
        checks: healthStatus.checks
      }, '[Health] Readiness check FAILED - Redis not ready (production/staging)');
    } else {
      logger.warn({
        event: 'readiness_redis_down',
        env: config.env
      }, '[Health] Readiness check FAILED - Redis not ready (development)');
    }
  }

  // Additional checks can be added here (database, etc.)

  // Return 503 if not ready
  if (!healthStatus.ready) {
    healthStatus.status = 'NOT_READY';
    return res.status(503).json(healthStatus);
  }

  // Ready to serve traffic
  res.status(200).json(healthStatus);
}

/**
 * Legacy health check handler (/healthz)
 * Deprecated: Use /health (liveness) or /ready (readiness)
 * Kept for backward compatibility
 */
export async function legacyHealthCheckHandler(req: Request, res: Response): Promise<void> {
  // Legacy behavior: same as readiness check
  return readinessHandler(req, res);
}
