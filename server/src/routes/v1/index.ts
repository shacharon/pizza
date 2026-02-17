/**
 * API v1 Router Aggregator
 * Centralizes all v1 API routes under /api/v1
 * 
 * Route Structure:
 * - /api/v1/auth/token          POST / (public - generates JWT)
 * - /api/v1/auth/session        POST / (protected - issues session cookie, requires Bearer JWT)
 * - /api/v1/auth/ws-ticket      POST / (protected - generates WS ticket)
 * - /api/v1/auth/whoami         GET / (protected - returns auth context, accepts cookie or Bearer JWT)
 * - /api/v1/search              POST /, GET /stats (protected - accepts Bearer JWT or session cookie)
 * - /api/v1/stream/assistant/*  GET /:requestId (protected - SSE endpoint, accepts cookie or Bearer JWT)
 * - /api/v1/analytics/*         POST /events, GET /events, GET /stats, DELETE /events (protected)
 * - /api/v1/photos/*            GET /* (proxy to Google Places photos, public)
 * - /api/v1/chat                POST /chat, POST /restaurants/search, etc.
 * - /api/v1/places/*            POST /places/search
 * - /api/v1/dialogue            POST /dialogue, DELETE /dialogue/session/:id, GET /dialogue/stats
 */

import { Router, Request, Response } from 'express';
import searchRouter from '../../controllers/search/search.controller.js';
import analyticsRouter from '../../controllers/analytics/analytics.controller.js';
import photosRouter from '../../controllers/photos/photos.controller.js';
import authRouter from '../../controllers/auth/auth.controller.js';
import assistantSSERouter from '../../controllers/stream/assistant-sse/assistant-sse.router.js';
import { authenticateJWT } from '../../middleware/auth.middleware.js';
import { authSessionOrJwt } from '../../middleware/auth-session-or-jwt.middleware.js';
import { createRateLimiter } from '../../middleware/rate-limit.middleware.js';
import { getConfig } from '../../config/env.js';

export function createV1Router(): Router {
  const router = Router();

  // P0 Security: Search rate limiting (100 req/min per IP+session)
  const searchRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'search'
  });

  // Auth endpoints (includes both public /token and protected /ws-ticket)
  // Rate limited by default middleware
  router.use('/auth', authRouter);

  // P0 Security: Protected search endpoint
  // Accepts session cookie OR JWT Bearer token
  router.use('/search', authSessionOrJwt, searchRateLimiter, searchRouter);

  // SSE streaming endpoint for assistant (cookie-first auth)
  // No rate limiting for SSE (long-lived connections)
  router.use('/stream', assistantSSERouter);

  // P0 Security: Protected analytics endpoint
  // Accepts session cookie OR JWT Bearer token
  router.use('/analytics', authSessionOrJwt, analyticsRouter);

  // Photos proxy endpoint (P0 Security: hides Google API keys)
  // Public endpoint (already has rate limiting)
  router.use('/photos', photosRouter);

  // Debug endpoint for production config validation
  // TEMP: Guarded by ENV=production AND X-Debug-Key header
  router.get('/debug/prod-config', (req: Request, res: Response) => {
    const config = getConfig();
    const isProduction = config.env === 'production';
    const debugKey = process.env.DEBUG_KEY;
    const requestDebugKey = req.headers['x-debug-key'];

    // Only available in production with correct debug key
    if (!isProduction) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!debugKey || requestDebugKey !== debugKey) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Return safe config info (no secrets)
    return res.json({
      env: config.env,
      hasJwtSecret: Boolean(config.jwtSecret) && !config.jwtSecret.includes('__'),
      jwtSecretLen: config.jwtSecret?.length || 0,
      hasOpenaiKey: Boolean(config.openaiApiKey),
      hasGoogleKey: Boolean(config.googleApiKey),
      frontendOriginsCount: config.frontendOrigins?.length || 0,
      hasRedisUrl: Boolean(config.redisUrl),
      redisEnabled: config.enableRedisJobStore || config.enableRedisCache,
      redisActuallyEnabled: (config as any).redisActuallyEnabled
    });
  });

  return router;
}
