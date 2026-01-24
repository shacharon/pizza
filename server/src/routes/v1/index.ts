/**
 * API v1 Router Aggregator
 * Centralizes all v1 API routes under /api/v1
 * 
 * Route Structure:
 * - /api/v1/auth                POST /token (public - generates JWT)
 * - /api/v1/search              POST /, GET /stats (protected)
 * - /api/v1/analytics/*         POST /events, GET /events, GET /stats, DELETE /events (protected)
 * - /api/v1/photos/*            GET /* (proxy to Google Places photos, public)
 * - /api/v1/chat                POST /chat, POST /restaurants/search, etc.
 * - /api/v1/places/*            POST /places/search
 * - /api/v1/dialogue            POST /dialogue, DELETE /dialogue/session/:id, GET /dialogue/stats
 */

import { Router } from 'express';
import searchRouter from '../../controllers/search/search.controller.js';
import analyticsRouter from '../../controllers/analytics/analytics.controller.js';
import photosRouter from '../../controllers/photos/photos.controller.js';
import authRouter from '../../controllers/auth/auth.controller.js';
import { authenticateJWT } from '../../middleware/auth.middleware.js';
import { createRateLimiter } from '../../middleware/rate-limit.middleware.js';

export function createV1Router(): Router {
  const router = Router();

  // P0 Security: Search rate limiting (100 req/min per IP+session)
  const searchRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'search'
  });

  // Auth endpoint (public - generates JWT tokens)
  // Rate limited by default middleware
  router.use('/auth', authRouter);

  // P0 Security: Protected search endpoint
  // Requires JWT authentication
  router.use('/search', authenticateJWT, searchRateLimiter, searchRouter);

  // P0 Security: Protected analytics endpoint
  // Requires JWT authentication
  router.use('/analytics', authenticateJWT, analyticsRouter);

  // Photos proxy endpoint (P0 Security: hides Google API keys)
  // Public endpoint (already has rate limiting)
  router.use('/photos', photosRouter);

  return router;
}
