

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';

import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
import { httpLoggingMiddleware } from './middleware/httpLogging.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware.js';
import { createRateLimiter } from './middleware/rate-limit.middleware.js';

import { createV1Router } from './routes/v1/index.js';
import { getExistingRedisClient } from './lib/redis/redis-client.js';
import { healthCheckHandler } from './controllers/health.controler.js';
import { getConfig } from './config/env.js';
import { validateOrigin, getSafeOriginSummary } from './lib/security/origin-validator.js';
import { logger } from './lib/logger/structured-logger.js';

export function createApp() {
  const app = express();
  const config = getConfig();
  const isProduction = config.env === 'production';

  // ─────────────────────────────────────────────
  // P0: Global Rate Limiting (covers /healthz, legacy /api, 404s, etc.)
  // ─────────────────────────────────────────────
  const globalRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 300, // 300 req/min per IP
    keyPrefix: 'global'
  });
  app.use(globalRateLimiter);

  // ─────────────────────────────────────────────
  // P0: Request/Response timeouts (basic Slowloris mitigation)
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

  // 3. Request Identity & Logging (ensure traceId exists early)
  app.use(requestContextMiddleware);
  app.use(httpLoggingMiddleware);

  // P0: Handle JSON parsing errors AFTER requestContextMiddleware (traceId available)
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

  app.get('/healthz', (req, res) => {
    const redisClient = getExistingRedisClient();
    Promise.resolve(healthCheckHandler(req as any, res as any, redisClient ?? undefined)).catch((err) =>
      (req as any)?.log?.error?.({ err }, 'healthz_failed')
    );
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

  if (isProduction) {
    if (!config.frontendOrigins || config.frontendOrigins.length === 0) {
      throw new Error('[CORS] FRONTEND_ORIGINS is required in production');
    }

    app.use(
      cors({
        origin: (origin, cb) => {
          const result = validateOrigin(origin, {
            allowedOrigins: config.frontendOrigins,
            allowNoOrigin: config.corsAllowNoOrigin,
            isProduction: true,
            allowWildcardInDev: false,
            context: 'cors'
          });

          if (result.allowed) return cb(null, true);
          return cb(new Error(`CORS: ${result.reason || 'origin not allowed'}`));
        },
        credentials: true
      })
    );
  } else {
    if (config.frontendOrigins && config.frontendOrigins.length > 0) {
      app.use(
        cors({
          origin: (origin, cb) => {
            const result = validateOrigin(origin, {
              allowedOrigins: config.frontendOrigins,
              allowNoOrigin: true,
              isProduction: false,
              allowWildcardInDev: true,
              context: 'cors'
            });
            cb(null, result.allowed);
          },
          credentials: true
        })
      );
    } else {
      app.use(cors());
    }
  }

  // 5. Debug & Diagnostics (Protected in Production)
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
      hasGoogleKey: Boolean(key)
      // googleKeyLast4 intentionally removed
    });
  });

  // 6. Routing
  const v1Router = createV1Router();
  app.use('/api/v1', v1Router);

  // Legacy API wrapper with Sunset headers
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

  // 7. Infrastructure & Health


  // 8. Global Error Handling (Must be last)
  app.use(errorMiddleware);

  return app;
}
