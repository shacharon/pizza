import type { Request, Response } from 'express';
import { z } from 'zod';
import { nluService } from '../services/nlu.service.js';
import { nluPolicy } from '../services/nlu.policy.js';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';
import { phraserService } from '../services/phraser.service.js';
import { nluSessionService } from '../services/nlu-session.service.js';

// Request validation schema
const NLURequestSchema = z.object({
    text: z.string().min(1).max(500),
    language: z.enum(['he', 'en', 'ar']).default('he')
});

// Response types
export interface NLUResultsResponse {
    type: 'results';
    query: {
        city: string;
        type?: string;
        constraints?: { maxPrice?: number };
        language: string;
    };
    restaurants: any[];
    meta: {
        source: string;
        cached: boolean;
        nextPageToken?: string | null;
        enrichedTopN: number;
        nluConfidence: number;
    };
}

export interface NLUClarifyResponse {
    type: 'clarify';
    message: string;
    missing: string[];
    language: string;
    extractedSlots: any;
}

export type NLUResponse = NLUResultsResponse | NLUClarifyResponse;

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

        // Generate session ID from request headers or create one
        const sessionId = req.headers['x-session-id'] as string || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Step 1: Extract slots using NLU
        const nluResult = await nluService.extractSlots({ text, language });
        let { slots, confidence } = nluResult;

        // Step 2: Get session context *before* updating it
        const sessionContext = nluSessionService.getSessionContext(sessionId);
        const previousSlots = sessionContext ? sessionContext.lastSlots : null;

        // Step 3: Merge with session context
        slots = nluSessionService.mergeWithSession(sessionId, slots);

        // Update session with merged slots
        nluSessionService.updateSession(sessionId, slots, text);

        // Step 3: Apply policy to determine intent/action
        const policy = nluPolicy.decideContextual(slots, text, language);

        // Step 4: Execute action
        if (policy.action === 'ask_clarification') {
            const clarifyResponse: NLUClarifyResponse = {
                type: 'clarify',
                message: policy.message || 'Please provide more information.',
                missing: policy.missingFields,
                language,
                extractedSlots: slots
            };
            return res.json(clarifyResponse);
        }

        if (policy.action === 'clarify_not_food') {
            const clarifyResponse: NLUClarifyResponse = {
                type: 'clarify',
                message: policy.message || 'That doesn\'t seem to be a food type.',
                missing: [],
                language,
                extractedSlots: slots
            };
            return res.json(clarifyResponse);
        }

        // Step 5: Fetch results if we have anchor (city)
        if (policy.action === 'fetch_results' && slots.city) {
            const provider = getRestaurantsProvider();

            // Build search query from slots
            const searchQuery: any = {
                city: slots.city,
                language
            };

            // Add optional enhancements
            if (slots.type) searchQuery.type = slots.type;
            if (slots.maxPrice) {
                searchQuery.constraints = { maxPrice: slots.maxPrice };
            }

            // Call existing restaurant search
            const searchResult = await provider.search(searchQuery);

            // Generate polite, concise phrased message
            let phrased: string | undefined;
            try {
                const names = (searchResult.restaurants || []).map(r => r.name).filter(Boolean);

                // TODO: Fix this type casting. There is a subtle issue with exactOptionalPropertyTypes.
                phrased = await phraserService.phraseResults({
                    language,
                    currentSlots: slots,
                    previousSlots: previousSlots,
                    topResultName: names[0],
                    names,
                    sessionId: req.ip || 'default'
                } as any);
            } catch (e) {
                console.error('Error phrasing results:', e);
                /* ignore phrasing errors */
            }

            // Return unified results response
            const resultsResponse: NLUResultsResponse & { message?: string } = {
                type: 'results',
                query: {
                    city: slots.city,
                    ...(slots.type ? { type: slots.type } : {}),
                    ...(slots.maxPrice ? { constraints: { maxPrice: slots.maxPrice } } : {}),
                    language
                },
                restaurants: searchResult.restaurants,
                meta: {
                    ...searchResult.meta,
                    nluConfidence: confidence
                }
            };

            if (phrased) (resultsResponse as any).message = phrased;

            return res.json(resultsResponse);
        }

        // Fallback (shouldn't reach here)
        return res.status(500).json({ error: 'Unexpected policy result' });

    } catch (error: any) {
        console.error('[NLU] Parse handler error:', error);

        // Graceful error response
        const errorResponse: NLUClarifyResponse = {
            type: 'clarify',
            message: 'Sorry, I had trouble understanding your request. Could you try rephrasing?',
            missing: ['city'],
            language: (req.body?.language as string) || 'en',
            extractedSlots: {}
        };

        return res.status(500).json(errorResponse);
    }
}
