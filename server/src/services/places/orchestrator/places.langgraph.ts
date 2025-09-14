// Minimal orchestrator stub for the new Places flow (LLM-first)
import type { PlacesIntent } from '../intent/places-intent.schema.js';
import type { PlacesResponseDto, QuerySummary } from '../models/types.js';
import { QueryBuilderService } from '../query/query-builder.service.js';
import { TextSearchStrategyImpl } from '../strategy/textsearch.strategy.js';
import { NearbySearchStrategyImpl } from '../strategy/nearbysearch.strategy.js';
import { FindPlaceStrategyImpl } from '../strategy/findplace.strategy.js';
import { ResponseNormalizerService } from '../normalize/response-normalizer.service.js';

export interface PlacesChainInput {
    text?: string;
    schema?: PlacesIntent | null;
    sessionId?: string;
    userLocation?: { lat: number; lng: number } | null;
    language?: 'he' | 'en';
}

export interface PlacesChainOutput extends PlacesResponseDto { }

export class PlacesLangGraph {
    async run(input: PlacesChainInput): Promise<PlacesChainOutput> {
        const t0 = Date.now();
        // Minimal wiring: build an effective intent, build params, execute strategy (stub client), normalize
        const effectiveIntent: PlacesIntent = input.schema ?? {
            intent: 'find_food',
            provider: 'google_places',
            search: {
                mode: 'textsearch',
                query: input.text || '',
                target: input.userLocation ? { kind: 'coords', coords: input.userLocation } : { kind: 'me' },
                filters: input.language ? { language: input.language } : undefined,
            },
            output: {
                fields: [
                    'place_id', 'name', 'formatted_address', 'geometry', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'website', 'photos'
                ],
                page_size: 20
            },
        };

        // Ensure language preference is applied if provided explicitly
        if (input.language) {
            effectiveIntent.search.filters = {
                ...(effectiveIntent.search.filters || {}),
                language: input.language,
            } as any;
        }

        const mode = effectiveIntent.search.mode;
        const lang = input.language ?? effectiveIntent.search.filters?.language;
        const query: QuerySummary = lang ? { mode, language: lang } : { mode };

        const builder = new QueryBuilderService();
        const normalizer = new ResponseNormalizerService();

        let nextPageToken: string | null = null;
        let restaurants: any[] = [];

        if (mode === 'textsearch') {
            const params = builder.buildTextSearch(effectiveIntent);
            const raw = await new TextSearchStrategyImpl().execute(params);
            const norm = normalizer.normalizeList(raw, effectiveIntent.output?.fields ?? []);
            restaurants = norm.items;
            nextPageToken = norm.nextPageToken;
        } else if (mode === 'nearbysearch') {
            // For minimal wiring, allow missing coords (client is stubbed). Query builder tolerates undefined.
            const params = builder.buildNearbySearch(effectiveIntent);
            const raw = await new NearbySearchStrategyImpl().execute(params);
            const norm = normalizer.normalizeList(raw, effectiveIntent.output?.fields ?? []);
            restaurants = norm.items;
            nextPageToken = norm.nextPageToken;
        } else {
            const params = builder.buildFindPlace(effectiveIntent);
            const raw = await new FindPlaceStrategyImpl().execute(params);
            const norm = normalizer.normalizeList(raw, effectiveIntent.output?.fields ?? []);
            restaurants = norm.items;
            nextPageToken = norm.nextPageToken;
        }

        return {
            query,
            restaurants,
            meta: { source: 'google', mode, nextPageToken, cached: false, tookMs: Date.now() - t0 },
        };
    }
}


