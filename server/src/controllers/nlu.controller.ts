import type { Request, Response } from 'express';
import { z } from 'zod';
import { nluService } from '../services/nlu.service.js';
import { nluPolicy } from '../services/nlu.policy.js';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';

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
        type?: 'pizza' | 'sushi' | 'burger' | 'other';
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

        // Step 1: Extract slots using NLU
        const nluResult = await nluService.extractSlots({ text, language });
        const { slots, confidence } = nluResult;

        // Step 2: Apply policy to determine intent/action
        const policy = nluPolicy.decide(slots, language, confidence);

        // Step 3: Execute action
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

        // Step 4: Fetch results if we have anchor (city)
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

            // Return unified results response
            const resultsResponse: NLUResultsResponse = {
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
