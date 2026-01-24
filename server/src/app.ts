import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';

import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
import { httpLoggingMiddleware } from './middleware/httpLogging.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { createV1Router } from './routes/v1/index.js';
import { getExistingRedisClient } from './lib/redis/redis-client.js';
import { healthCheckHandler } from './controllers/health.controler.js';
import { getConfig } from './config/env.js';

export function createApp() {
  const app = express();
  const config = getConfig();

  // Security & perf
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // ─────────────────────────────────────────────
  // CORS (ENV-aware)
  // ─────────────────────────────────────────────
  if (config.env === 'production') {
    if (!config.corsAllowedOrigins || config.corsAllowedOrigins.length === 0) {
      throw new Error('[CORS] CORS_ALLOWED_ORIGINS is required in production');
    }

    app.use(
      cors({
        origin: (origin, cb) => {
          if (!origin) {
            return config.corsAllowNoOrigin
              ? cb(null, true)
              : cb(new Error('CORS: no origin'));
          }

          if (config.corsAllowedOrigins!.includes(origin)) {
            return cb(null, true);
          }

          return cb(new Error('CORS: origin not allowed'));
        },
        credentials: true,
      })
    );
  } else {
    // dev / test
    app.use(cors());
  }

  // Phase 1: Request context & logging (BEFORE routes)
  app.use(requestContextMiddleware);
  app.use(httpLoggingMiddleware);

  // Debug ENV (MUST be before error middleware)
  app.get('/api/v1/debug/env', (req, res) => {
    const key = process.env.GOOGLE_API_KEY;

    res.json({
      hostname: process.env.HOSTNAME ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      env: process.env.ENV ?? null,
      hasGoogleKey: Boolean(key),
      googleKeyLast4: key ? key.slice(-4) : null,
    });
  });

  // Create v1 router (single instance)
  const v1Router = createV1Router();

  // Canonical API
  app.use('/api/v1', v1Router);

  // Legacy API (temporary)
  app.use(
    '/api',
    (req, res, next) => {
      res.setHeader('Deprecation', 'true');
      res.setHeader(
        'Sunset',
        process.env.API_SUNSET_DATE || 'Sun, 01 Jun 2026 00:00:00 GMT'
      );
      res.setHeader('Link', '</api/v1>; rel="alternate"');

      if (req.log) {
        req.log.warn(
          {
            path: req.path,
            method: req.method,
            userAgent: req.get('user-agent'),
          },
          'Legacy API usage (/api) - migrate to /api/v1'
        );
      }

      next();
    },
    v1Router
  );

  // Health check (not versioned)
  app.get('/healthz', async (req, res) => {
    const redisClient = getExistingRedisClient();
    return await healthCheckHandler(req, res, redisClient ?? undefined);
  });

  // ❗ MUST be last
  app.use(errorMiddleware);

  return app;
}
