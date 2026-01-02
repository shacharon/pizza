import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
import { httpLoggingMiddleware } from './middleware/httpLogging.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { createV1Router } from './routes/v1/index.js';

export function createApp() {
    const app = express();
    app.use(helmet());
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(cors()); // keep permissive for dev; restrict via env in server.ts if needed

    // Phase 1: Request context & logging (BEFORE routes)
    app.use(requestContextMiddleware);
    app.use(httpLoggingMiddleware);

    // Create v1 router (single instance for both mounts)
    const v1Router = createV1Router();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // API v1 - Canonical namespace (NEW)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    app.use('/api/v1', v1Router);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Legacy API - Backward compatible (TEMPORARY)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Clients should migrate to /api/v1
    app.use('/api', (req, res, next) => {
      // Add deprecation headers (RFC 8594)
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', 'Sun, 01 Jun 2025 00:00:00 GMT'); // 6 months from now
      res.setHeader('Link', '</api/v1>; rel="alternate"');
      
      // Log legacy usage for observability
      if (req.log) {
        req.log.warn({ 
          path: req.path,
          method: req.method,
          userAgent: req.get('user-agent')
        }, 'Legacy API usage (/api) - migrate to /api/v1');
      }
      next();
    }, v1Router);

    // Health check (not versioned)
    app.get('/healthz', (_req, res) => res.status(200).send('ok'));

    // Centralized error handler (MUST be LAST)
    app.use(errorMiddleware);

    return app;
}


