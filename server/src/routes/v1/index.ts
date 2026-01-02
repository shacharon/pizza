/**
 * API v1 Router Aggregator
 * Centralizes all v1 API routes under /api/v1
 * 
 * Route Structure:
 * - /api/v1/search              POST /, GET /stats
 * - /api/v1/analytics/*         POST /events, GET /events, GET /stats, DELETE /events
 * - /api/v1/chat                POST /chat, POST /restaurants/search, etc.
 * - /api/v1/places/*            POST /places/search
 * - /api/v1/dialogue            POST /dialogue, DELETE /dialogue/session/:id, GET /dialogue/stats
 */

import { Router } from 'express';
import searchRouter from '../../controllers/search/search.controller.js';
import analyticsRouter from '../../controllers/analytics/analytics.controller.js';
import { chatRouter } from '../chat.routes.js';
import { placesRouter } from '../places.routes.js';
import { dialogueRouter } from '../dialogue.routes.js';

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

  // Legacy chat endpoints (already have full paths internally)
  // Internal routes: POST /chat, POST /restaurants/search, POST /nlu/parse, etc.
  // Exposed as-is: POST /chat, POST /restaurants/search, etc.
  router.use(chatRouter);

  // Legacy places endpoint (already has full path internally)
  // Internal routes: POST /places/search
  // Exposed as-is: POST /places/search
  router.use(placesRouter);

  // Dialogue endpoint (already has full path internally)
  // Internal routes: POST /dialogue, DELETE /dialogue/session/:id, GET /dialogue/stats
  // Exposed as-is: POST /dialogue, etc.
  router.use(dialogueRouter);

  return router;
}
