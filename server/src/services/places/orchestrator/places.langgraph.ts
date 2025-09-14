// Minimal orchestrator stub for the new Places flow (LLM-first)
import type { PlacesIntent } from '../intent/places-intent.schema.js';

export interface PlacesChainInput {
    text?: string;
    schema?: PlacesIntent | null;
    sessionId?: string;
    userLocation?: { lat: number; lng: number } | null;
    language?: 'he' | 'en';
}

export interface PlacesChainOutput {
    query: { mode: 'textsearch' | 'nearbysearch' | 'findplace'; language?: 'he' | 'en' };
    restaurants: any[];
    meta: { source: 'google'; mode: 'textsearch' | 'nearbysearch' | 'findplace'; nextPageToken: string | null; cached: boolean; tookMs: number };
}

export class PlacesLangGraph {
    async run(input: PlacesChainInput): Promise<PlacesChainOutput> {
        const t0 = Date.now();
        // Stub behavior: just echo a minimal structured response for wiring tests
        const mode = (input.schema?.search.mode || 'textsearch') as 'textsearch' | 'nearbysearch' | 'findplace';
        return {
            query: { mode, language: input.language || input.schema?.search.filters?.language },
            restaurants: [],
            meta: { source: 'google', mode, nextPageToken: null, cached: false, tookMs: Date.now() - t0 },
        };
    }
}


