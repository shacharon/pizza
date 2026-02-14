/**
 * CRITICAL: Load environment variables FIRST before any imports
 * Priority: .env.local (dev overrides) → .env (defaults)
 * This ensures JWT_SECRET is loaded before any auth middleware imports
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local first (dev overrides), then .env (fallback)
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');
const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

if (existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  if (isDev) {
    console.info('[BOOT] Loaded .env.local');
  }
}

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false }); // Don't override .env.local values
  if (isDev && !existsSync(envLocalPath)) {
    console.info('[BOOT] Loaded .env');
  }
}

// Dev-only: Log JWT_SECRET status (source + length, NEVER the actual value)
if (isDev) {
  const jwtSecret = process.env.JWT_SECRET;
  const source = existsSync(envLocalPath) ? '.env.local' : '.env';
  console.info('[BOOT] JWT_SECRET status:', {
    source,
    length: jwtSecret?.length || 0,
    valid: jwtSecret && jwtSecret.length >= 32
  });
}

// Now safe to import modules that use environment variables
import { createApp } from './app.js';
import { getConfig } from './config/env.js';
import { logger } from './lib/logger/structured-logger.js';
import { InMemoryRequestStore } from './infra/state/in-memory-request-store.js';
import { WebSocketManager } from './infra/websocket/websocket-manager.js';
import { getRedisClient, getExistingRedisClient } from './lib/redis/redis-client.js';

// Phase 2: Initialize state store singleton
export const requestStateStore = new InMemoryRequestStore(300, 60_000);

// Get config early (used by Redis init and later by server setup)
const config = getConfig();

// Phase 2.5: EAGER Redis initialization (before HTTP server starts)
// CRITICAL: Redis must be initialized BEFORE /ws-ticket route is registered
// because ws-ticket endpoint depends on Redis for ticket storage
async function initializeRedis() {
  const wsRequiresAuth = process.env.WS_REQUIRE_AUTH !== 'false';
  const redisRequired = config.enableRedisJobStore || config.enableRedisCache || wsRequiresAuth;

  let redisInitialized = false;

  if (redisRequired && config.redisUrl) {
    logger.info(
      {
        event: 'redis_init_attempt',
        pid: process.pid,
        redisUrlHost: config.redisUrl.replace(/:[^:@]+@/, ':****@'),
        enableRedisJobStore: config.enableRedisJobStore,
        enableRedisCache: config.enableRedisCache,
        wsRequiresAuth,
      },
      '[BOOT] Initializing Redis client (required for WS tickets)'
    );

    try {
      logger.info({
        event: 'CALLING_GET_REDIS_CLIENT',
        url: config.redisUrl.replace(/:[^:@]+@/, ':****@'),
        msg: '[BOOT] About to call getRedisClient()'
      });
      
      const redis = await getRedisClient({
        url: config.redisUrl,
        maxRetriesPerRequest: 3,
        connectTimeout: 2000,
        commandTimeout: 2000,
        enableOfflineQueue: false
      });

      logger.info({
        event: 'GET_REDIS_CLIENT_RETURNED',
        redisIsNull: redis === null,
        redisType: typeof redis,
        msg: '[BOOT] getRedisClient() returned'
      });

      redisInitialized = Boolean(redis);

      logger.info(
        {
          event: 'redis_boot_status',
          pid: process.pid,
          redisUrlHost: config.redisUrl.replace(/:[^:@]+@/, ':****@').split('@')[1] || config.redisUrl.replace(/:[^:@]+@/, ':****@'),
          redisEnabled: redisInitialized,
          clientCreated: Boolean(redis),
          clientConnected: redisInitialized,
          wsRequiresAuth,
        },
        `[BOOT] Redis status: ${redisInitialized ? 'CONNECTED' : 'FAILED'}`
      );

      // Fail-fast if WS requires auth but Redis is down
      if (!redisInitialized && wsRequiresAuth) {
        if (config.env === 'production' || config.env === 'staging') {
          logger.error(
            {
              event: 'redis_required_but_unavailable',
              wsRequiresAuth: true,
              redisConnected: false,
              env: config.env,
            },
            '[BOOT] FATAL: Redis required for WS authentication but connection failed'
          );
          throw new Error('Redis connection required for WS_REQUIRE_AUTH=true');
        } else {
          logger.warn(
            {
              event: 'redis_unavailable_ws_auth_disabled',
              wsRequiresAuth: true,
              redisConnected: false,
              env: config.env,
            },
            '[BOOT] WARNING: Redis unavailable, WS authentication will be disabled in dev'
          );
          // Override WS_REQUIRE_AUTH in dev when Redis is down
          process.env.WS_REQUIRE_AUTH = 'false';
        }
      }
    } catch (error) {
      logger.error(
        {
          event: 'redis_boot_failed',
          pid: process.pid,
          error: error instanceof Error ? error.message : String(error),
          wsRequiresAuth,
        },
        '[BOOT] Redis initialization failed'
      );

      // Re-throw in production/staging when WS requires auth
      if ((config.env === 'production' || config.env === 'staging') && wsRequiresAuth) {
        throw error;
      }
    }
  } else {
    logger.info(
      {
        event: 'redis_boot_status',
        pid: process.pid,
        redisUrlHost: null,
        redisEnabled: false,
        clientCreated: false,
        clientConnected: false,
        wsRequiresAuth,
        reason: !config.redisUrl ? 'no_redis_url' : 'not_required',
      },
      '[BOOT] Redis not initialized (not required or not configured)'
    );
  }
}

// Initialize Redis before starting server
await initializeRedis();


function maskKey(k?: string) {
  if (!k) return { exists: false, len: 0, last4: '----' };
  return { exists: true, len: k.length, last4: k.slice(-4) };
}

// Log API key status at boot (only GOOGLE_API_KEY is used)
const googleKeyStatus = maskKey(process.env.GOOGLE_API_KEY);
logger.info({
  googleApiKey: googleKeyStatus,
  searchProvider: process.env.SEARCH_PROVIDER || 'google'
}, '[BOOT] API key status');

// Warn if API key missing but provider expects Google
if (!googleKeyStatus.exists && process.env.SEARCH_PROVIDER !== 'stub') {
  logger.warn({
    issue: 'GOOGLE_API_KEY missing but SEARCH_PROVIDER requires it',
    currentProvider: process.env.SEARCH_PROVIDER || 'google (default)',
    remediation: 'Set GOOGLE_API_KEY or use SEARCH_PROVIDER=stub for local dev without network access'
  }, '[BOOT] Configuration warning');
}

// Assistant mode is now always enabled (no feature flags)
logger.info('[Config] ASSISTANT_MODE = ENABLED (always on, LLM-first)');

const port = config.port;
const openaiApiKey = config.openaiApiKey;
const googleApiKey = config.googleApiKey;

if (!openaiApiKey) {
  logger.warn('OPENAI_API_KEY is not set. /api/chat will fail until it is provided.');
}
if (!googleApiKey) {
  logger.warn({
    msg: 'GOOGLE_API_KEY is not set. Google search will fail until it is provided.',
    remediation: 'Set GOOGLE_API_KEY in .env or use SEARCH_PROVIDER=stub for local dev'
  });
}

const app = createApp();
const server = app.listen(port, () => {
  logger.info(`Server listening on http://localhost:${port}`);
});

// Phase 3: Initialize WebSocket manager
// Import jobStore for Phase 1 authorization
import { searchJobStore } from './services/search/job-store/index.js';

export const wsManager = new WebSocketManager(server, {
  path: '/ws',
  heartbeatIntervalMs: 30_000,
  allowedOrigins: process.env.WS_ALLOWED_ORIGINS?.split(',') || ['*'],
  requestStateStore, // Phase 3: Enable late-subscriber replay
  jobStore: searchJobStore // Phase 1: Enable ownership verification
});

/**
 * Graceful shutdown handler
 * ONLY called by SIGTERM/SIGINT signals (process termination)
 * NEVER called by request-level errors
 */
function shutdown(signal: NodeJS.Signals) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  // Phase 2: Shutdown state store (clear intervals)
  requestStateStore.shutdown();

  // Phase 3: Shutdown WebSocket manager
  wsManager.shutdown();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  // This is ONLY for process termination scenarios (SIGTERM/SIGINT)
  setTimeout(() => {
    logger.error('Forced shutdown after timeout during process termination');
    process.exit(1);
  }, 10_000).unref(); // unref() allows process to exit naturally if all work is done
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * PROD Hardening: Global error handlers for process safety
 * 
 * IMPORTANT: These handlers LOG errors but do NOT kill the process.
 * Killing the process for every unhandled rejection would make the server
 * extremely fragile and turn request-level errors into server crashes.
 * 
 * Process shutdown is ONLY triggered by SIGTERM/SIGINT signals.
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal(
    {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: String(promise)
    },
    '[FATAL] Unhandled Promise Rejection - request will fail but server continues'
  );

  // DO NOT call shutdown() here - let the request fail gracefully
  // The server should remain available for other requests
});

process.on('uncaughtException', (error) => {
  logger.fatal(
    {
      error: error.message,
      stack: error.stack
    },
    '[FATAL] Uncaught Exception - server may be in unstable state'
  );

  // DO NOT call shutdown() here - log and continue
  // In truly unrecoverable cases, process monitors (PM2/Docker/K8s) will restart
});

