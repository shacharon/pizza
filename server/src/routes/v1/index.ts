/**
 * API v1 Router Aggregator
 * Centralizes all v1 API routes under /api/v1
 * 
 * Route Structure:
 * - /api/v1/search              POST /, GET /stats
 * - /api/v1/analytics/*         POST /events, GET /events, GET /stats, DELETE /events
 * - /api/v1/photos/*            GET /* (proxy to Google Places photos)
 * - /api/v1/chat                POST /chat, POST /restaurants/search, etc.
 * - /api/v1/places/*            POST /places/search
 * - /api/v1/dialogue            POST /dialogue, DELETE /dialogue/session/:id, GET /dialogue/stats
 */

import { Router } from 'express';
import searchRouter from '../../controllers/search/search.controller.js';
import analyticsRouter from '../../controllers/analytics/analytics.controller.js';
import photosRouter from '../../controllers/photos/photos.controller.js';
// OBSOLETE: Legacy routes removed
// import { chatRouter } from '../chat.routes.js';
// import { placesRouter } from '../places.routes.js';
// import { dialogueRouter } from '../dialogue.routes.js';

export function createV1Router(): Router {
  const router = Router();

  // Unified search endpoint
  // Internal routes: POST /, GET /stats
  // Exposed as: POST /search, GET /search/stats
  router.use('/search', searchRouter);

  // Analytics endpoint
  // Internal routes: POST /events, GET /events, GET /stats, DELETE /events
  // Exposed as: POST /analytics/events, etc.
  router.use('/analytics', analyticsRouter);

  // Photos proxy endpoint (P0 Security: hides Google API keys)
  // Internal routes: GET /*
  // Exposed as: GET /photos/places/{placeId}/photos/{photoId}
  router.use('/photos', photosRouter);

  // OBSOLETE: Legacy endpoints removed
  // These endpoints are no longer supported:
  // - POST /chat, POST /restaurants/search, POST /nlu/parse
  // - POST /places/search
  // - POST /dialogue
  // Use POST /search with proper request format instead

  return router;
}
