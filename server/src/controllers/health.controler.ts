// health.controller.ts
import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { getConfig } from '../config/env.js';


const config = getConfig();

/**
 * Health Check handler for ALB /healthz route.
 * Improved with a timeout to prevent ALB 504 Gateway Timeouts.
 * 
 * P0 Scale Safety: Distinguishes between liveness (process alive) and readiness (can serve traffic).
 * In production with multi-instance ECS, Redis is REQUIRED for readiness.
 * 
 * Response contract:
 * - status: 'UP' | 'DOWN' (liveness - process health)
 * - ready: true | false (readiness - can serve traffic)
 * - checks: individual component health
 * 
 * HTTP codes:
 * - 200: healthy AND ready (ALB target healthy)
 * - 503: not ready (ALB should not route traffic)
 */
export async function healthCheckHandler(req: Request, res: Response, redisClient?: Redis) {
    const isProduction = config.env === 'production';
    const redisRequired = isProduction && config.enableRedisJobStore;

    const healthStatus = {
        status: 'UP',
        ready: true,
        timestamp: new Date().toISOString(),
        checks: {
            server: 'UP',
            redis: 'DISABLED'
        }
    };

    let isHealthy = true;
    let isReady = true;

    // Check Redis if enabled OR required in production
    if (config.enableRedisJobStore || config.enableRedisCache || redisRequired) {
        if (!redisClient) {
            healthStatus.checks.redis = 'MISSING_CLIENT';
            isHealthy = false;
            isReady = false;

            // P0 Scale Safety: Log critical error if Redis required but missing
            if (redisRequired) {
                console.error(
                    '[HealthCheck] CRITICAL: Redis required in production but client unavailable. ' +
                    'ECS task NOT READY for traffic.'
                );
            }
        } else {
            try {
                /**
                 * Promise.race ensures that if Redis is blocked by a Security Group,
                 * the health check fails quickly (3 seconds) instead of hanging.
                 */
                const redisPing = redisClient.ping();
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Redis Timeout')), 3000)
                );

                await Promise.race([redisPing, timeout]);
                healthStatus.checks.redis = 'UP';
            } catch (error) {
                healthStatus.checks.redis = 'DOWN';
                isHealthy = false;
                isReady = false;

                // P0 Scale Safety: Log with severity based on environment
                const logLevel = redisRequired ? 'error' : 'warn';
                console[logLevel](
                    '[HealthCheck] Redis check failed or timed out:',
                    error,
                    redisRequired ? '(REQUIRED in production - NOT READY)' : '(optional - degraded)'
                );
            }
        }
    }

    // Update status and ready flags
    if (!isHealthy) {
        healthStatus.status = 'DOWN';
    }
    healthStatus.ready = isReady;

    // P0 Scale Safety: Return 503 if not ready (ALB will mark target unhealthy)
    if (!isReady) {
        return res.status(503).json(healthStatus);
    }

    return res.status(200).json(healthStatus);
}