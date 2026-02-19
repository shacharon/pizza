/**
 * WebSocket Configuration Validation
 * Handles config resolution, origin validation, and security gates
 */

import { logger } from '../../lib/logger/structured-logger.js';
import { getSafeOriginSummary } from '../../lib/security/origin-validator.js';
import type { WebSocketManagerConfig } from './websocket.types.js';

/**
 * Resolve and validate WebSocket configuration
 * Applies production security gates and fallbacks
 */
export function resolveWebSocketConfig(
  config?: Partial<WebSocketManagerConfig>
): WebSocketManagerConfig {
  // 1. Resolve allowedOrigins from ENV (unified with CORS)
  const frontendOriginsEnv = process.env.FRONTEND_ORIGINS || process.env.ALLOWED_ORIGINS || '';
  const envAllowedOrigins = frontendOriginsEnv
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const isProduction = process.env.NODE_ENV === 'production';

  // 2. Dev/local defaults: explicitly allow localhost:4200 for Angular dev server
  const devDefaults = ['http://localhost:4200', 'http://127.0.0.1:4200'];

  // 3. Resolve base config
  const resolvedConfig: WebSocketManagerConfig = {
    path: config?.path || '/ws',
    heartbeatIntervalMs: config?.heartbeatIntervalMs || 30_000,
    allowedOrigins:
      envAllowedOrigins.length > 0
        ? envAllowedOrigins
        : config?.allowedOrigins || (isProduction ? [] : devDefaults),
  };

  // Add optional properties only if defined
  if (config?.requestStateStore) {
    resolvedConfig.requestStateStore = config.requestStateStore;
  }
  if (config?.jobStore) {
    resolvedConfig.jobStore = config.jobStore;
  }
  
  const redisUrl = config?.redisUrl || process.env.REDIS_URL;
  if (redisUrl) {
    resolvedConfig.redisUrl = redisUrl;
  }

  // 4. Production security gate with Fallback Logic
  if (isProduction) {
    if (
      resolvedConfig.allowedOrigins.length === 0 ||
      resolvedConfig.allowedOrigins.includes('*')
    ) {
      const fallbackOrigin =
        process.env.WS_FALLBACK_ORIGIN || 'https://app.going2eat.food';

      logger.warn(
        {
          fallbackOrigin,
          current: resolvedConfig.allowedOrigins,
        },
        'SECURITY: Production WS origins invalid, applying fallback domain'
      );

      resolvedConfig.allowedOrigins = [fallbackOrigin];
    }

    // Final safety check to prevent accidental wildcard leak
    if (resolvedConfig.allowedOrigins.includes('*')) {
      logger.error(
        { env: process.env.NODE_ENV, allowedOrigins: resolvedConfig.allowedOrigins },
        'SECURITY: WebSocket wildcard (*) BLOCKED in production'
      );
      resolvedConfig.allowedOrigins = ['__PRODUCTION_MISCONFIGURED__'];
    }
  }

  // 5. Final authoritative boot log with safe origin summary
  logger.info(
    {
      path: resolvedConfig.path,
      originsCount: resolvedConfig.allowedOrigins.length,
      originsSummary: getSafeOriginSummary(resolvedConfig.allowedOrigins),
      env: process.env.NODE_ENV || 'development',
      redisEnabled: !!resolvedConfig.redisUrl,
      hasStateStore: !!resolvedConfig.requestStateStore,
    },
    'WebSocketManager: Configuration resolved'
  );

  return resolvedConfig;
}

/**
 * Validate Redis requirement for ticket-based auth
 * P0 Security: Enforces strict production/staging guards
 */
export function validateRedisForAuth(hasRedis: boolean): void {
  const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false'; // default true
  const env = process.env.NODE_ENV || 'development';
  const isProdOrStaging = env === 'production' || env === 'staging';

  // P0: Production/Staging MUST have auth enabled
  if (isProdOrStaging && !requireAuth) {
    logger.error(
      { env },
      'SECURITY: WS_REQUIRE_AUTH cannot be false in production/staging'
    );
    throw new Error(`[P0 Security] WS_REQUIRE_AUTH cannot be disabled in ${env}`);
  }

  // P0: If auth is enabled, Redis MUST be available
  if (requireAuth && !hasRedis) {
    logger.error(
      { env, requireAuth },
      'SECURITY: Redis required for WebSocket ticket authentication'
    );
    
    // Fail-fast in production/staging
    if (isProdOrStaging) {
      throw new Error(`[P0 Security] Redis connection required for WebSocket authentication in ${env}`);
    }
    
    // In dev/test, throw anyway (no bypass)
    throw new Error('Redis connection required for WebSocket ticket authentication');
  }
}
