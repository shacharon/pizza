/**
 * Readiness Service
 *
 * Tracks Redis, Session store, and Providers (provider enrichment uses same Redis).
 * Used by GET /health/ready to decide 200 vs 503.
 */

import { getExistingRedisClient } from '../redis/redis-client.js';
import { getSessionStore } from '../session/redis-session.store.js';
import { logger } from '../logger/structured-logger.js';

const REDIS_PING_TIMEOUT_MS = 2000;

export interface ReadinessResult {
  ready: boolean;
  checks: {
    redis: boolean;
    sessionStore: boolean;
    providers: boolean;
  };
}

let systemReadyLogged = false;

/**
 * Run readiness checks: Redis (ping), Session store (isAvailable), Providers (same Redis).
 * Providers use the same Redis client for cache; no separate check.
 */
export async function checkReadiness(): Promise<ReadinessResult> {
  const redis = getExistingRedisClient();
  const redisOk = await checkRedis(redis);
  const sessionStore = getSessionStore();
  const sessionStoreOk = sessionStore.isAvailable();
  const providersOk = redisOk;

  const ready = redisOk && sessionStoreOk && providersOk;

  return {
    ready,
    checks: {
      redis: redisOk,
      sessionStore: sessionStoreOk,
      providers: providersOk,
    },
  };
}

function checkRedis(redis: ReturnType<typeof getExistingRedisClient>): Promise<boolean> {
  if (!redis) return Promise.resolve(false);
  return Promise.race([
    redis.ping().then(() => true),
    new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timeout')), REDIS_PING_TIMEOUT_MS)
    ),
  ]).catch(() => false);
}

/**
 * Log system_ready=true once per boot when readiness is true.
 * Call this when GET /health/ready returns 200 (or when first becoming ready).
 */
export function logSystemReadyIfReady(ready: boolean): void {
  if (ready && !systemReadyLogged) {
    systemReadyLogged = true;
    logger.info({ event: 'system_ready', system_ready: true }, 'system_ready=true');
  }
}
