import type { Request, Response } from 'express';
import { PlacesLangGraph } from '../../services/places/orchestrator/places.langgraph.js';
import { PlacesIntentSchema, validateGoogleRules } from '../../services/places/intent/places-intent.schema.js';

// Singleton PlacesLangGraph instance (reused across requests)
// Matches DialogueService pattern: create once, reuse forever
const placesGraph = new PlacesLangGraph();

/**
 * Handle places search requests
 * POST /api/places/search
 * 
 * @deprecated Use POST /api/search instead (Phase 3 unified endpoint)
 */
export async function placesSearchHandler(req: Request, res: Response) {
    try {
        // Add deprecation headers
        res.setHeader('X-API-Deprecated', 'true');
        res.setHeader('X-API-Sunset', '2026-06-01'); // 6 months deprecation period
        res.setHeader('X-API-Alternative', 'POST /api/search');
        res.setHeader('Deprecation', 'true'); // RFC 8594 standard header
        
        console.warn('[DEPRECATED] /api/places/search called - migrate to POST /api/search');

        const { text, schema, userLocation, nearMe, browserLanguage } = req.body || {};
        if (!text && !schema) {
            return res.status(400).json({ error: 'Provide either text or schema' });
        }
        const sessionId = (req.headers['x-session-id'] as string) || `places-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Extract browserLanguage from headers if not in body
        const finalBrowserLanguage = browserLanguage || req.headers['accept-language']?.split(',')[0];

        // If schema is provided, validate now; otherwise allow stub chain to proceed with text
        let validated: any = null;
        if (schema) {
            const parsed = PlacesIntentSchema.safeParse(schema);
            if (!parsed.success) return res.status(400).json({ error: 'Invalid schema', details: parsed.error.flatten() });
            try {
                validateGoogleRules(parsed.data as any);
            } catch (err: any) {
                return res.status(400).json({ error: 'Schema rule violation', details: err?.message || String(err) });
            }
            validated = parsed.data;
        }

        // Use PlacesLangGraph directly (matches Dialogue pattern)
        const result = await placesGraph.run({
            text,
            schema: validated,
            sessionId,
            userLocation: userLocation ?? null,
            nearMe: Boolean(nearMe),
            browserLanguage: finalBrowserLanguage
        });

        return res.json(result);
    } catch (e: any) {
        console.error('[PlacesController] Error:', e);
        return res.status(500).json({
            error: 'Unexpected error',
            message: e?.message || 'Internal server error'
        });
    }
}


