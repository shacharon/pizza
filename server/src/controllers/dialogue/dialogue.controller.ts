import type { Request, Response } from 'express';
import { z } from 'zod';
import { DialogueService } from '../../services/dialogue/dialogue.service.js';

/**
 * Request body validation schema
 */
const RequestSchema = z.object({
    text: z.string().min(1).max(500),
    userLocation: z.object({ 
        lat: z.number(), 
        lng: z.number() 
    }).optional(),
});

/**
 * Singleton instance of DialogueService
 * Reused across requests to maintain session state
 */
const dialogueService = new DialogueService();

/**
 * Handle dialogue message
 * POST /api/dialogue
 * 
 * Request body:
 * {
 *   "text": "pizza in haifa",
 *   "userLocation": { "lat": 32.8, "lng": 34.9 } // optional
 * }
 * 
 * Headers:
 * x-session-id: "dialogue-123" // required for conversation continuity
 * 
 * Response:
 * {
 *   "message": "Found 15 pizza places! 🍕",
 *   "suggestions": [
 *     { "id": "romantic", "emoji": "🌹", "label": "Romantic", "action": "filter", "value": "romantic" },
 *     ...
 *   ],
 *   "places": [...],
 *   "meta": { "source": "google", "tookMs": 3500 }
 * }
 */
export async function dialogueHandler(req: Request, res: Response) {
    const t0 = Date.now();

    try {
        // Validate request body
        const parsed = RequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ 
                error: 'Invalid request', 
                details: parsed.error.flatten() 
            });
        }

        const { text, userLocation } = parsed.data;

        // Get or generate session ID
        const sessionId = (req.headers['x-session-id'] as string) || 
            `dialogue-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        console.log('[DialogueController] Request', { 
            sessionId, 
            text: text.substring(0, 50),
            hasLocation: !!userLocation 
        });

        // Call DialogueService
        const result = await dialogueService.handleMessage(
            sessionId, 
            text, 
            userLocation
        );

        const tookMs = Date.now() - t0;
        console.log('[DialogueController] Response', { 
            sessionId, 
            tookMs,
            resultsCount: result.results.length,
            suggestionsCount: result.suggestions.length
        });

        // Return response
        return res.json({
            message: result.botMessage,
            suggestions: result.suggestions,
            places: result.results,
            meta: {
                ...result.meta,
                tookMs,
                sessionId // Include session ID in response for client
            }
        });

    } catch (e: any) {
        console.error('[DialogueController] Error:', e);
        return res.status(500).json({ 
            error: 'Unexpected error',
            message: e?.message || 'Internal server error'
        });
    }
}

/**
 * Clear session (for testing/debugging)
 * DELETE /api/dialogue/session/:sessionId
 */
export async function clearSessionHandler(req: Request, res: Response) {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        dialogueService.clearSession(sessionId);

        console.log('[DialogueController] Session cleared', { sessionId });

        return res.json({ 
            success: true, 
            message: 'Session cleared',
            sessionId 
        });

    } catch (e: any) {
        console.error('[DialogueController] Clear session error:', e);
        return res.status(500).json({ error: 'Unexpected error' });
    }
}

/**
 * Get service stats (for monitoring)
 * GET /api/dialogue/stats
 */
export async function statsHandler(req: Request, res: Response) {
    try {
        const sessionCount = dialogueService.getSessionCount();

        return res.json({
            sessionCount,
            uptime: process.uptime(),
            timestamp: Date.now()
        });

    } catch (e: any) {
        console.error('[DialogueController] Stats error:', e);
        return res.status(500).json({ error: 'Unexpected error' });
    }
}


