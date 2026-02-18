/**
 * Auth Controller (Router Aggregator)
 * Mounts authentication-related routes
 *
 * Routes:
 * - /token -> token.controller.ts (POST /api/v1/auth/token)
 * - /bootstrap -> bootstrap.controller.ts (POST /api/v1/auth/bootstrap)
 * - /session -> session.controller.ts (POST /api/v1/auth/session)
 * - /whoami -> session.controller.ts (GET /api/v1/auth/whoami)
 * - /ws-ticket -> ws-ticket.controller.ts (POST /api/v1/auth/ws-ticket)
 * - /bootstrap -> bootstrap.controller.ts (POST /api/v1/auth/bootstrap) - NEW: Redis-backed sessions
 */

import { Router } from 'express';
import tokenController from './token.controller.js';
import bootstrapController from './bootstrap.controller.js';
import sessionController from './session.controller.js';
import wsTicketController from './ws-ticket.controller.js';
import bootstrapController from './bootstrap.controller.js';

const router = Router();

// Mount sub-controllers (preserves exact route structure)
router.use('/', tokenController);
router.use('/bootstrap', bootstrapController);
router.use('/', sessionController);
router.use('/', wsTicketController);
router.use('/', bootstrapController); // NEW: Redis session bootstrap

export default router;
