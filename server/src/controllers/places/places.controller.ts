import type { Request, Response } from 'express';
import { PlacesLangGraph } from '../../services/places/orchestrator/places.langgraph.js';
import { PlacesIntentSchema } from '../../services/places/intent/places-intent.schema.js';

// Minimal stub handler: validates presence of text or schema and returns 501 for now
export async function placesSearchHandler(req: Request, res: Response) {
    try {
        const { text, schema, userLocation, language } = req.body || {};
        if (!text && !schema) {
            return res.status(400).json({ error: 'Provide either text or schema' });
        }
        const sessionId = (req.headers['x-session-id'] as string) || `places-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // If schema is provided, validate now; otherwise allow stub chain to proceed with text
        let validated: any = null;
        if (schema) {
            const parsed = PlacesIntentSchema.safeParse(schema);
            if (!parsed.success) return res.status(400).json({ error: 'Invalid schema', details: parsed.error.flatten() });
            validated = parsed.data;
        }

        const chain = new PlacesLangGraph();
        const out = await chain.run({ text, schema: validated, sessionId, userLocation, language });

        return res.json(out);
    } catch (e: any) {
        return res.status(500).json({ error: 'Unexpected error' });
    }
}


