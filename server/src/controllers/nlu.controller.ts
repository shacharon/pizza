import type { Request, Response } from 'express';
import { z } from 'zod';
import { nluService } from '../services/nlu.service.js';
import { nluPolicy, Action } from '../services/nlu.policy.js';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';
import { nluSessionService } from '../services/nlu-session.service.js';
import { promptManager } from '../services/prompt.service.js';
import config from '../config/index.js';
import { buildFoodGraph } from '../services/conversation/food-graph.manager.js';


// Request validation schema
const NLURequestSchema = z.object({
    text: z.string().min(1).max(500),
    language: z.enum(['he', 'en', 'ar']).default('he')
});

// Singletons / lazily resolved instances
const provider = getRestaurantsProvider();

export async function nluParseHandler(req: Request, res: Response) {
    try {
        // Validate request
        const parsed = NLURequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Invalid request',
                details: parsed.error.flatten()
            });
        }

        const { text, language } = parsed.data;
        const sessionId = req.headers['x-session-id'] as string || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const t0 = Date.now();

        // If enabled, run FoodGraph orchestrator
        if (config.FOOD_GRAPH_ENABLED) {
            const graph = buildFoodGraph({ nlu: nluService as any, session: nluSessionService as any, provider });
            const out = await graph.run({ sessionId, text, language });

            if (out.policy?.action !== Action.FetchResults) {
                const msg = out.policy?.message
                    || (out.policy?.missing?.includes('city')
                        ? promptManager.get('clarify_city', language)
                        : out.policy?.missing?.includes('maxPrice')
                            ? promptManager.get('clarify_price', language)
                            : promptManager.get('clarify_city', language));
                return res.json({ type: 'clarify', message: msg, missing: out.policy?.missing || [], language });
            }

            const restaurants = (out.results?.restaurants || []).map((r: any) => ({
                name: r.name,
                rating: r.rating ?? null,
                priceLevel: r.priceLevel ?? null,
                placeId: r.placeId ?? null,
                photoUrl: r.photoUrl ?? null,
            }));
            const meta: any = out.results?.meta ? (out.results.meta as Record<string, unknown>) : undefined;
            return res.json({
                type: 'results',
                query: {
                    city: out.slots?.city!,
                    type: out.slots?.type || undefined,
                    constraints: out.slots?.maxPrice ? { maxPrice: out.slots?.maxPrice } : undefined,
                    language
                },
                restaurants,
                meta: { ...(meta || {}), nluConfidence: 1 }
            });
        }

        // Use NLU + Policy + Provider to return structured response for Food UI

        const nluRes = await nluService.extractSlots({ text, language });
        // Merge slots with session memory to support follow-ups like "cheaper" or "same city"
        const mergedSlots = nluSessionService.mergeWithSession(sessionId, nluRes.slots as any);
        const policy = nluPolicy.decideContextual(mergedSlots as any, text, language);

        // Return clarification if needed
        if (policy.action === Action.AskClarification || policy.action === Action.ClarifyNotFood) {
            try {
                console.log('[NLUParse]', {
                    sessionId,
                    language,
                    tookMs: Date.now() - t0,
                    action: policy.action,
                    input: text.slice(0, 120),
                    missing: policy.missingFields || [],
                });
            } catch { }
            const msg = policy.message
                || (policy.missingFields?.includes('city')
                    ? promptManager.get('clarify_city', language)
                    : policy.missingFields?.includes('maxPrice')
                        ? promptManager.get('clarify_price', language)
                        : promptManager.get('clarify_city', language));
            // Do not update memory on clarify; wait until we have anchor/results
            return res.json({
                type: 'clarify',
                message: msg,
                missing: policy.missingFields || [],
                language
            });
        }

        // Fetch and return results
        if (policy.action === Action.FetchResults && nluRes.slots.city) {
            const dto: any = { city: mergedSlots.city };
            if (mergedSlots.type) dto.type = mergedSlots.type;
            if (typeof mergedSlots.maxPrice === 'number') dto.constraints = { maxPrice: mergedSlots.maxPrice };
            dto.language = language as any;

            const result = await provider.search(dto);
            // Update session memory after successful fetch
            nluSessionService.updateSession(sessionId, mergedSlots as any, text);
            try {
                console.log('[NLUParse]', {
                    sessionId,
                    language,
                    tookMs: Date.now() - t0,
                    action: policy.action,
                    city: nluRes.slots.city,
                    type: nluRes.slots.type || null,
                    maxPrice: nluRes.slots.maxPrice ?? null,
                    count: (result.restaurants || []).length,
                });
            } catch { }
            const restaurants = (result.restaurants || []).map((r: any) => ({
                name: r.name,
                rating: r.rating ?? null,
                priceLevel: r.priceLevel ?? null,
                placeId: r.placeId ?? null,
                photoUrl: r.photoUrl ?? null,
            }));
            const meta: any = {
                source: result.meta?.source || 'google',
                nextPageToken: result.meta?.nextPageToken || null,
                enrichedTopN: result.meta?.enrichedTopN || 0,
                nluConfidence: nluRes.confidence
            };
            if (typeof result.meta?.cached === 'boolean') meta.cached = result.meta.cached;
            return res.json({
                type: 'results',
                query: {
                    city: mergedSlots.city!,
                    type: mergedSlots.type || undefined,
                    constraints: mergedSlots.maxPrice ? { maxPrice: mergedSlots.maxPrice } : undefined,
                    language
                },
                restaurants,
                meta
            });
        }

        // Fallback clarification
        try {
            console.log('[NLUParse]', {
                sessionId,
                language,
                tookMs: Date.now() - t0,
                action: 'clarify_fallback',
                input: text.slice(0, 120),
                missing: ['city'],
            });
        } catch { }
        return res.json({
            type: 'clarify',
            message: promptManager.get('clarify_city', language),
            missing: ['city'],
            language
        });

    } catch (error: any) {
        console.error('[NLU] Parse handler error:', error);
        return res.status(500).json({ type: 'clarify', message: 'Sorry, an unexpected error occurred.' });
    }
}
