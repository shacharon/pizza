// health.controller.ts
import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { getConfig } from '../config/env.js';


const config = getConfig();

/**
 * Health Check handler for ALB /healthz route.
 * Improved with a timeout to prevent ALB 504 Gateway Timeouts.
 */
export async function healthCheckHandler(req: Request, res: Response, redisClient?: Redis) {
    const healthStatus = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        checks: {
            server: 'UP',
            redis: 'DISABLED'
        }
    };

    let isHealthy = true;

    if (config.enableRedisJobStore || config.enableRedisCache) {
        if (!redisClient) {
            healthStatus.checks.redis = 'MISSING_CLIENT';
            isHealthy = false;
        } else {
            try {
                /**
                 * SMALL IMPROVEMENT: Promise.race ensures that if Redis is blocked 
                 * by a Security Group, the health check fails quickly (3 seconds) 
                 * instead of hanging and causing an ALB 504 error.
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
                // Log the error for CloudWatch debugging
                console.error('[HealthCheck] Redis check failed or timed out:', error);
            }
        }
    }

    if (!isHealthy) {
        healthStatus.status = 'DOWN';
        return res.status(503).json(healthStatus);
    }

    return res.status(200).json(healthStatus);
}