import type { Request, Response } from 'express';
import { z } from 'zod';
import { buildFoodGraph } from '../services/conversation/food-graph.manager.js';
import { nluService } from '../services/nlu.service.js';
import { nluSessionService } from '../services/nlu-session.service.js';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';
import { Action } from '../services/nlu.policy.js';
import config from '../config/index.js';
import { runAgentLoopPlanner } from '../services/conversation/planner.agent.js';

const BodyZ = z.object({
    text: z.string().min(1).max(500),
    language: z.enum(['he', 'en', 'ar']).default('he').optional(),
    nearMe: z.boolean().optional(),
    userLocation: z.object({ lat: z.number(), lng: z.number() }).optional()
});

export async function foodDialogueHandler(req: Request, res: Response) {
    try {
        const parsed = BodyZ.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
        }

        const { text, language, nearMe, userLocation } = parsed.data as any;
        const sessionId = (req.headers['x-session-id'] as string) || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const provider = getRestaurantsProvider();
        // Optional: planner path
        // config.FEATURE_AGENT_LOOP = true;

        if (config.FEATURE_AGENT_LOOP && (req.headers['x-agent'] === 'loop')) {
            const planned = await runAgentLoopPlanner({ text, language: (language as any) || 'he' });
            if (planned) {
                const restaurants = (planned.restaurants || []).slice(0, 8);
                const message = await nluService.generateEvidenceReply({ language: (language as any) || 'he', slots: {}, restaurants: restaurants.map(r => ({ name: r.name, address: (r as any).address, rating: (r as any).rating })), userQuery: text });
                return res.json({ type: 'results', restaurants, meta: planned.meta, message });
            }
        }

        const graph = buildFoodGraph({ nlu: nluService as any, session: nluSessionService as any, provider });
        const out = await graph.run({ sessionId, text, language: (language as any) || 'he', nearMe: !!nearMe, userLocation: userLocation || undefined } as any);

        if (out.policy?.action !== Action.FetchResults) {
            const kind: 'missing_location' | 'missing_city' = (out.policy?.missing || []).includes('location') ? 'missing_location' : 'missing_city';
            const s: any = out.slots || {};
            // pick next topic based on missing pieces (no heavy logic; simple priority chain)
            const topic: any = !s.type ? 'type' : (Array.isArray(s.dietary) && s.dietary.length === 0) ? 'dietary' : (!Array.isArray(s.toppings) || s.toppings.length === 0) ? 'toppings' : (typeof s.maxPrice !== 'number') ? 'budget' : (!s.delivery ? 'delivery' : 'openNow');
            const msg = await nluService.generateClarifyMessage({ language: (language as any) || 'he', slots: (out.slots as any) || {}, kind, topic });
            return res.json({ type: 'clarify', message: msg, missing: out.policy?.missing || [], language: (language as any) || 'he' });
        }

        // Guided mode: on a brand-new session, ask one guiding question before showing results
        const existing = nluSessionService.getSessionContext(sessionId);
        if (!existing) {
            const hasAnchor = !!((out.slots as any)?.city || (out as any).userLocation);
            const q = await nluService.generateClarifyMessage({ language: (language as any) || 'he', slots: (out.slots as any) || {}, kind: hasAnchor ? 'first_turn' : 'missing_location' });
            // Seed session so the next turn is treated as a follow-up
            try { nluSessionService.updateSession(sessionId, (out.slots as any) || {} as any, text); } catch { }
            return res.json({ type: 'clarify', message: q, missing: [], language: (language as any) || 'he' });
        }

        const restaurants = (out.results?.restaurants || []).slice(0, 8).map((r: any) => ({
            name: r.name,
            address: r.address ?? null,
            rating: r.rating ?? null,
            priceLevel: r.priceLevel ?? null,
            placeId: r.placeId ?? null,
            photoUrl: r.photoUrl ?? null,
            location: r.location ?? null,
            types: r.types ?? null,
            website: r.website ?? null,
            dietary: r.dietary ?? null,
        }));

        // Conversational message (evidence-only)
        const message = await nluService.generateEvidenceReply({
            language: (language as any) || 'he',
            slots: (out.slots as any) || {},
            restaurants: restaurants.map(r => ({ name: r.name, address: r.address, rating: r.rating })),
            userQuery: text
        });

        // Minimal chips (server-suggested actions)
        const chips: Array<{ label: string; patch: Record<string, unknown> }> = [];
        if (out.slots?.city || out.userLocation) {
            chips.push({ label: 'קרוב יותר (2 ק"מ)', patch: { constraints: { radiusMeters: 2000 } } });
            chips.push({ label: 'פתוח עכשיו', patch: { constraints: { openNow: true } } });
        }

        return res.json({ type: 'results', restaurants, meta: out.results?.meta || {}, message, chips });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || 'Unexpected error' });
    }
}


