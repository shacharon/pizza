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

// Phase 2: Initialize state store singleton
export const requestStateStore = new InMemoryRequestStore(300, 60_000);


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

const { port, openaiApiKey, googleApiKey } = getConfig();

if (!openaiApiKey) {
  logger.warn('OPENAI_API_KEY is not set. /api/chat will fail until it is provided.');
}
if (!googleApiKey) {
  logger.warn({
    msg: 'GOOGLE_API_KEY is not set. Google search will fail until it is provided.',
    remediation: 'Set GOOGLE_API_KEY in .env or use SEARCH_PROVIDER=stub for local dev'
  });
}

// Phase 1: EAGER Redis initialization (before listen, before routes)
// Prevents /ws-ticket 503 spam after deploy when Redis container is starting
// Behavior:
// - Production: Fail-closed (exit if Redis unavailable) - prevents cascading failures
// - Development: Continue in degraded mode (ws-ticket will 503, but server runs)
import { RedisService } from './infra/redis/redis.service.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const env = (process.env.NODE_ENV || 'development') as 'production' | 'development' | 'staging';

try {
  await RedisService.start(
    {
      url: redisUrl,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      commandTimeout: 2000,
      enableOfflineQueue: false
    },
    {
      timeout: 8000, // 8s startup timeout (ECS healthcheck allows this)
      env,
      failClosed: env === 'production' // Exit on failure in production
    }
  );
} catch (error) {
  // RedisService.start() handles process.exit() in production
  // This catch is for unexpected errors
  logger.fatal({
    error: error instanceof Error ? error.message : 'unknown',
    env
  }, '[BOOT] Unexpected error during Redis startup');
  if (env === 'production') {
    process.exit(1);
  }
}

// Phase 1.5: Initialize Google Maps Cache Service (AFTER Redis is ready)
// This ensures cache service doesn't race with Redis initialization
import { initializeCacheService } from './services/search/route2/stages/google-maps/cache-manager.js';
await initializeCacheService();

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

// Phase 4: Register "load_more" handler for ranking suggestions
// This allows WebSocket manager to trigger ranking suggestions when user clicks "load more"
import { loadMoreRegistry } from './services/search/route2/assistant/load-more-registry.js';
import { createLLMProvider } from './llm/factory.js';

const llmProvider = createLLMProvider();
if (llmProvider) {
  loadMoreRegistry.register(llmProvider, wsManager);
  logger.info('[BOOT] Load more handler registered');
} else {
  logger.warn('[BOOT] LLM provider not available, load more handler not registered');
}

/**
 * Graceful shutdown handler for ECS autoscaling
 * ONLY called by SIGTERM/SIGINT signals (process termination)
 * NEVER called by request-level errors
 * 
 * P0 Scale Safety: Drain in-flight requests before termination to prevent job loss.
 * ECS stopTimeout should be set to 60s to allow full drain cycle.
 */
async function shutdown(signal: NodeJS.Signals) {
  logger.info({
    signal,
    event: 'shutdown_initiated',
    msg: '[Shutdown] Graceful shutdown started'
  });

  // Phase 1: Stop accepting new connections (close server listener)
  // This makes ALB health checks fail immediately, routing traffic away
  server.close(() => {
    logger.info({
      event: 'http_server_closed',
      msg: '[Shutdown] HTTP server stopped accepting new connections'
    });
  });

  // Phase 2: Close WebSocket connections gracefully
  // Sends close frames to clients with shutdown reason
  try {
    wsManager.shutdown();
    logger.info({
      event: 'websocket_closed',
      msg: '[Shutdown] WebSocket connections closed'
    });
  } catch (err) {
    logger.error({
      error: err instanceof Error ? err.message : 'unknown',
      msg: '[Shutdown] WebSocket shutdown error (non-fatal)'
    });
  }

  // Phase 3: Shutdown state store (clear intervals)
  try {
    requestStateStore.shutdown();
    logger.info({
      event: 'state_store_shutdown',
      msg: '[Shutdown] Request state store cleanup completed'
    });
  } catch (err) {
    logger.error({
      error: err instanceof Error ? err.message : 'unknown',
      msg: '[Shutdown] State store shutdown error (non-fatal)'
    });
  }

  // Phase 3.5: Mark all RUNNING jobs as DONE_FAILED before closing Redis
  // This prevents orphaned jobs that never complete
  try {
    const runningJobs = await searchJobStore.getRunningJobs();
    
    logger.info({
      event: 'shutdown_inflight_counts',
      runningJobsCount: runningJobs.length,
      requestIds: runningJobs.map(j => j.requestId),
      msg: '[Shutdown] Marking running jobs as failed'
    });

    // Mark all running jobs as failed in parallel
    await Promise.all(
      runningJobs.map(job =>
        searchJobStore.setError(
          job.requestId,
          'SERVER_SHUTDOWN',
          'Server shutting down, request terminated',
          'SEARCH_FAILED'
        )
      )
    );

    if (runningJobs.length > 0) {
      logger.info({
        event: 'jobs_marked_failed',
        count: runningJobs.length,
        msg: '[Shutdown] All running jobs marked as DONE_FAILED'
      });
    }
  } catch (err) {
    logger.error({
      error: err instanceof Error ? err.message : 'unknown',
      msg: '[Shutdown] Failed to mark running jobs as failed (non-fatal)'
    });
  }

  // Phase 3.6: Close Redis connection
  try {
    await RedisService.close();
    logger.info({
      event: 'redis_closed',
      msg: '[Shutdown] Redis connection closed'
    });
  } catch (err) {
    logger.error({
      error: err instanceof Error ? err.message : 'unknown',
      msg: '[Shutdown] Redis shutdown error (non-fatal)'
    });
  }

  // Phase 4: Wait for in-flight HTTP requests to drain
  // Development: 60s timeout (allows graceful debugging)
  // Production: 30s timeout (ECS stopTimeout=60s allows: 30s drain + 30s cleanup buffer)
  const drainTimeoutMs = isDev ? 60_000 : 30_000;
  const drainTimeout = setTimeout(() => {
    logger.warn({
      event: 'drain_timeout',
      drainTimeoutMs,
      msg: '[Shutdown] Drain timeout reached, forcing exit'
    });
    process.exit(0);
  }, drainTimeoutMs);

  // Unref allows process to exit naturally if drain completes early
  drainTimeout.unref();

  logger.info({
    event: 'drain_started',
    maxWaitMs: drainTimeoutMs,
    msg: `[Shutdown] Waiting for in-flight HTTP requests to complete (max ${drainTimeoutMs / 1000}s)`
  });
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

