import { Router } from 'express';
import { 
    dialogueHandler, 
    clearSessionHandler, 
    statsHandler 
} from '../controllers/dialogue/dialogue.controller.js';

/**
 * Dialogue routes
 * Handles conversational food search
 */
export const dialogueRouter = Router();

/**
 * POST /api/dialogue
 * Main dialogue endpoint - send message, get response
 */
dialogueRouter.post('/dialogue', dialogueHandler);

/**
 * DELETE /api/dialogue/session/:sessionId
 * Clear session (for testing/debugging)
 */
dialogueRouter.delete('/dialogue/session/:sessionId', clearSessionHandler);

/**
 * GET /api/dialogue/stats
 * Get service statistics (for monitoring)
 */
dialogueRouter.get('/dialogue/stats', statsHandler);


