import express from 'express';
import cors, { CorsOptions } from 'cors';
import compression from 'compression';
import helmet from 'helmet';

import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
import { httpLoggingMiddleware } from './middleware/httpLogging.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware.js';
import { createRateLimiter } from './middleware/rate-limit.middleware.js';

import { createV1Router } from './routes/v1/index.js';
import { livenessHandler, readinessHandler, legacyHealthCheckHandler } from './controllers/health.controller.js';
import { getConfig } from './config/env.js';
import { validateOrigin, getSafeOriginSummary } from './lib/security/origin-validator.js';
import { logger } from './lib/logger/structured-logger.js';

export function createApp() {
  const app = express();
  const config = getConfig();
  const isProduction = config.env === 'production';

  // ─────────────────────────────────────────────
  // P0: Global Rate Limiting
  // ─────────────────────────────────────────────
  const globalRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 300,
    keyPrefix: 'global'
  });
  app.use(globalRateLimiter);

  // ─────────────────────────────────────────────
  // P0: Request/Response timeouts
  // ─────────────────────────────────────────────
  app.use((req, res, next) => {
    req.setTimeout(30_000);
    res.setTimeout(30_000);
    next();
  });

  // 1. Core Security Headers & Performance
  app.use(helmet());
  app.use(securityHeadersMiddleware);
  app.use(compression());

  // 2. Body parsers with limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // 3. Request Identity & Logging
  app.use(requestContextMiddleware);
  app.use(httpLoggingMiddleware);

  // P0: Handle JSON parsing errors AFTER requestContextMiddleware
  app.use((err: any, req: any, res: any, next: any) => {
    const isJsonSyntaxError =
      err instanceof SyntaxError && typeof err?.message === 'string' && 'body' in err;

    if (isJsonSyntaxError) {
      logger.warn(
        {
          traceId: req?.traceId ?? 'missing',
          method: req.method,
          path: req.path,
          error: err.message
        },
        '[Security] Invalid JSON in request body'
      );

      return res.status(400).json({
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
        traceId: req?.traceId ?? 'missing'
      });
    }

    return next(err);
  });

  // Health & Readiness endpoints
  // /health - Liveness (process alive?)
  // /ready - Readiness (can serve traffic? Redis ready?)
  // /healthz - Legacy (deprecated, use /ready)

  app.get('/health', livenessHandler);
  app.get('/ready', (req, res) => {
    Promise.resolve(readinessHandler(req, res)).catch((err) => {
      logger.error({ error: err.message }, '[Health] Readiness check error');
      res.status(503).json({ status: 'ERROR', ready: false });
    });
  });

  // Legacy endpoint (backward compatibility)
  app.get('/healthz', (req, res) => {
    Promise.resolve(legacyHealthCheckHandler(req, res)).catch((err) => {
      logger.error({ error: err.message }, '[Health] Legacy healthz error');
      res.status(503).json({ status: 'ERROR' });
    });
  });

  // ─────────────────────────────────────────────
  // 4. CORS (ENV-aware, unified with WebSocket)
  // ─────────────────────────────────────────────
  logger.info(
    {
      env: config.env,
      originsCount: config.frontendOrigins?.length ?? 0,
      originsSummary: getSafeOriginSummary(config.frontendOrigins),
      credentialsEnabled: true
    },
    'CORS: Initialized'
  );

  const corsCommon: CorsOptions = {
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id', 'X-Idempotency-Key'] as string[],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as string[],
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  /**
   * Photo Routes Policy:
   * Override CORP to allow cross-origin embedding of image resources.
   * Uses origin:true to bypass validation errors and allow all origins (standard for public assets).
   */
  app.use('/api/v1/photos', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  app.use('/api/v1/photos', cors({ ...corsCommon, origin: true }));

  // ✅ DEV safety net: always allow common local frontends even if FRONTEND_ORIGINS is missing/mis-set
  const devLocalOrigins = ['http://localhost:4200', 'http://localhost:4201', 'http://localhost:3000'];
  const devAllowedOrigins = Array.from(
    new Set([...(config.frontendOrigins ?? []), ...devLocalOrigins])
  );

  // Keep a reference to the active CORS middleware so we can explicitly handle OPTIONS before auth/routes
  let activeCorsMiddleware: any = null;

  if (isProduction) {
    // FAIL-SAFE: If FRONTEND_ORIGINS missing, allow requests without origin but reject browser requests
    if (!config.frontendOrigins || config.frontendOrigins.length === 0) {
      logger.error({
        env: 'production',
        frontendOriginsCount: 0
      }, '[CORS] ⚠️  FRONTEND_ORIGINS missing in production - allowing health checks but rejecting browser CORS');

      // Allow requests without Origin (curl, health checks) but reject browser CORS
      const corsFailSafe = cors((req, cb) => {
        const origin = req.headers.origin as string | undefined;

        if (!origin) {
          // Allow health checks, curl, server-to-server
          return cb(null, { ...corsCommon, origin: true });
        }

        // Reject all browser requests with Origin header
        logger.warn({ origin }, '[CORS] Origin rejected - FRONTEND_ORIGINS not configured');
        return cb(null, { ...corsCommon, origin: false });
      });
      activeCorsMiddleware = corsFailSafe;
      app.use(corsFailSafe);
    } else {
      const corsProd = cors((req, cb) => {
        const origin = req.headers.origin as string | undefined;

        // CRITICAL FIX: Allow requests without Origin header (curl, health checks, server-to-server)
        // These don't need CORS headers and shouldn't be rejected
        if (!origin) {
          logger.debug('[CORS] Request without Origin header - allowing (health check / curl)');
          return cb(null, { ...corsCommon, origin: true }); // Allow without CORS restrictions
        }

        // Strict validation ONLY for requests with Origin header
        const result = validateOrigin(origin, {
          allowedOrigins: config.frontendOrigins,
          allowNoOrigin: config.corsAllowNoOrigin,
          isProduction: true,
          allowWildcardInDev: false,
          context: 'cors'
        });

        // If not allowed, return origin:false (and let browser block)
        if (!result.allowed) {
          logger.warn({ origin }, '[CORS] Origin rejected by allowlist');
          return cb(null, { ...corsCommon, origin: false });
        }

        return cb(null, { ...corsCommon, origin });
      });

      activeCorsMiddleware = corsProd;
      app.use(corsProd);
    }
  } else {
    // Development Environment
    if ((config.frontendOrigins && config.frontendOrigins.length > 0) || devAllowedOrigins.length > 0) {
      const corsDev = cors({
        ...corsCommon,
        origin: (origin, cb) => {
          // Allow requests without Origin (curl, healthz, etc.)
          if (!origin) return cb(null, true);

          const result = validateOrigin(origin, {
            allowedOrigins: devAllowedOrigins,
            allowNoOrigin: true,
            isProduction: false,
            allowWildcardInDev: true,
            context: 'cors'
          });

          // ✅ IMPORTANT: allow localhost:4200 preflight by actually whitelisting it above
          // If not allowed -> no CORS headers -> browser blocks; but we still want preflight to finish cleanly.
          cb(null, result.allowed ? origin : false);
        }
      });

      activeCorsMiddleware = corsDev;
      app.use(corsDev);
    } else {
      const corsDevOpen = cors({ ...corsCommon, origin: true });
      activeCorsMiddleware = corsDevOpen;
      app.use(corsDevOpen);
    }
  }

  // ✅ Explicitly handle ALL preflight requests BEFORE /api/v1 routes (prevents auth 401 on OPTIONS)
  // This makes OPTIONS return 204 early whenever CORS middleware is active.
  // Using regex pattern instead of '*' for modern Express Router compatibility
  if (activeCorsMiddleware) {
    app.options(/.*/, activeCorsMiddleware);
  }

  // 5. Debug & Diagnostics
  app.get('/api/v1/debug/env', (req, res) => {
    if (isProduction) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Debug endpoints are disabled in production'
      });
    }

    const key = process.env.GOOGLE_API_KEY;
    res.json({
      hostname: process.env.HOSTNAME ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      env: process.env.ENV ?? null,
      hasGoogleKey: Boolean(key),
      devAllowedOrigins // helpful for local debugging
    });
  });

  // 6. Routing
  const v1Router = createV1Router();
  app.use('/api/v1', v1Router);

  // Legacy API wrapper
  app.use(
    '/api',
    (req: any, res, next) => {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', process.env.API_SUNSET_DATE || 'Sun, 01 Jun 2026 00:00:00 GMT');
      res.setHeader('Link', '</api/v1>; rel="alternate"');

      if (req.log) {
        req.log.warn(
          { path: req.path, method: req.method, userAgent: req.get('user-agent') },
          'Legacy API usage (/api) - migrate to /api/v1'
        );
      }
      next();
    },
    v1Router
  );

  // 8. Global Error Handling
  app.use(errorMiddleware);

  return app;
}
