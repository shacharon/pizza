import type { Request, Response } from 'express';
import { z } from 'zod';
import { NLUService } from '../services/nlu.service.js';
import { nluPolicy } from '../services/nlu.policy.js';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';


// Request validation schema
const NLURequestSchema = z.object({
    text: z.string().min(1).max(500),
    language: z.enum(['he', 'en', 'ar']).default('he')
});

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

        // Use NLU + Policy + Provider to return structured response for Food UI
        const nlu = new NLUService();
        const provider = getRestaurantsProvider();

        const nluRes = await nlu.extractSlots({ text, language });
        const policy = nluPolicy.decideContextual(nluRes.slots, text, language);

        // Return clarification if needed
        if (policy.action === 'ask_clarification' || policy.action === 'clarify_not_food') {
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
            return res.json({
                type: 'clarify',
                message: policy.message || 'Could you provide more details?',
                missing: policy.missingFields || [],
                language
            });
        }

        // Fetch and return results
        if (policy.action === 'fetch_results' && nluRes.slots.city) {
            const dto: any = { city: nluRes.slots.city };
            if (nluRes.slots.type) dto.type = nluRes.slots.type;
            if (typeof nluRes.slots.maxPrice === 'number') dto.constraints = { maxPrice: nluRes.slots.maxPrice };
            dto.language = language as any;

            const result = await provider.search(dto);
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
            return res.json({
                type: 'results',
                query: {
                    city: nluRes.slots.city,
                    type: nluRes.slots.type || undefined,
                    constraints: nluRes.slots.maxPrice ? { maxPrice: nluRes.slots.maxPrice } : undefined,
                    language
                },
                restaurants: result.restaurants || [],
                meta: {
                    source: result.meta?.source || 'google',
                    cached: false,
                    nextPageToken: result.meta?.nextPageToken || null,
                    enrichedTopN: result.meta?.enrichedTopN || 0,
                    nluConfidence: nluRes.confidence
                }
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
            message: 'I need more information to help you find restaurants.',
            missing: ['city'],
            language
        });

    } catch (error: any) {
        console.error('[NLU] Parse handler error:', error);
        return res.status(500).json({ type: 'clarify', message: 'Sorry, an unexpected error occurred.' });
    }
}
