import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';

import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
import { httpLoggingMiddleware } from './middleware/httpLogging.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware.js';
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

  // 1. Core Security Headers & Performance
  // Helmet sets basic security headers (X-Content-Type-Options, X-Frame-Options, etc.)
  app.use(helmet());
  // Custom middleware for HSTS, CSP and other prod-specific headers
  app.use(securityHeadersMiddleware);

  app.use(compression());

  // JSON body parser with limit and error handling
  app.use(express.json({ limit: '1mb' }));

  // P0 Security: Handle JSON parsing errors (return 400 instead of 500)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      logger.warn({
        traceId: req.traceId || 'unknown',
        method: req.method,
        path: req.path,
        error: err.message
      }, '[Security] Invalid JSON in request body');

      return res.status(400).json({
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
        traceId: req.traceId || 'unknown'
      });
    }
    next(err);
  });

  // ─────────────────────────────────────────────
  // 2. CORS (ENV-aware, unified with WebSocket)
  // ─────────────────────────────────────────────

  // Safe boot logging
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
        credentials: true, // Required for secure cookie/auth headers
      })
    );
  } else {
    // Development Mode
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
          credentials: true,
        })
      );
    } else {
      app.use(cors());
    }
  }

  // 3. Request Identity & Logging
  app.use(requestContextMiddleware);
  app.use(httpLoggingMiddleware);

  // 4. Debug & Diagnostics (Protected in Production)
  app.get('/api/v1/debug/env', (req, res) => {
    // SECURITY: Never leak environment details in production
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
      googleKeyLast4: key ? key.slice(-4) : null,
    });
  });

  // 5. Routing
  const v1Router = createV1Router();
  app.use('/api/v1', v1Router);

  // Legacy API wrapper with Sunset headers
  app.use(
    '/api',
    (req, res, next) => {
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

  // 6. Infrastructure & Health
  app.get('/healthz', async (req, res) => {
    const redisClient = getExistingRedisClient();
    return await healthCheckHandler(req, res, redisClient ?? undefined);
  });

  // 7. Global Error Handling (Must be last)
  app.use(errorMiddleware);

  return app;
}