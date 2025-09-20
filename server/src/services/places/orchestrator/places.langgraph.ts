// Minimal orchestrator stub for the new Places flow (LLM-first)
import type { PlacesIntent } from '../intent/places-intent.schema.js';
import type { PlacesResponseDto, QuerySummary } from '../models/types.js';
import { QueryBuilderService } from '../query/query-builder.service.js';
import { TextSearchStrategyImpl } from '../strategy/textsearch.strategy.js';
import { NearbySearchStrategyImpl } from '../strategy/nearbysearch.strategy.js';
import { FindPlaceStrategyImpl } from '../strategy/findplace.strategy.js';
import { ResponseNormalizerService } from '../normalize/response-normalizer.service.js';
import { PlacesIntentService } from '../intent/places-intent.service.js';

export interface PlacesChainInput {
    text?: string;
    schema?: PlacesIntent | null;
    sessionId?: string;
    userLocation?: { lat: number; lng: number } | null;
    language?: 'he' | 'en';
    nearMe?: boolean;
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

        // LLM-first: if only text is provided, call intent service to determine mode/filters
        if (!input.schema && input.text) {
            const intentService = new PlacesIntentService();
            try {
                const llmIntent = await intentService.resolve(input.text, input.language);
                effectiveIntent.search.mode = llmIntent.search.mode;
                effectiveIntent.search.query = llmIntent.search.query;
                effectiveIntent.search.target = llmIntent.search.target;
                effectiveIntent.search.filters = { ...(effectiveIntent.search.filters || {}), ...(llmIntent.search.filters || {}) } as any;
            } catch {
                // fallback: keep heuristic below
            }
        }

        // Heuristic fallback: if nearMe flag is true or text includes near-me phrases, and we have a location, use nearbysearch
        const text = input.text?.toLowerCase() || '';
        const looksNearMe = input.nearMe || /\b(near me|nearby|close to me|around me|לידי|קרוב אליי)\b/.test(text);
        if (!input.schema && looksNearMe && (input.userLocation || effectiveIntent.search.target.coords)) {
            effectiveIntent.search.mode = 'nearbysearch';
        }

        const mode = effectiveIntent.search.mode;
        const lang = input.language ?? effectiveIntent.search.filters?.language;
        const query: QuerySummary = lang ? { mode, language: lang } : { mode };

        // Debug: log effective intent just before building params
        console.log('[PlacesLangGraph] effective intent', {
            mode: effectiveIntent.search.mode,
            query: effectiveIntent.search.query,
            target: effectiveIntent.search.target,
        });

        const builder = new QueryBuilderService();
        const normalizer = new ResponseNormalizerService();
        console.log('[PlacesLangGraph] builder', builder);
        console.log('[PlacesLangGraph] normalizer', normalizer);

        let nextPageToken: string | null = null;
        let restaurants: any[] = [];

        if (mode === 'textsearch') {
            const params = await builder.buildTextSearchAsync(effectiveIntent);
            console.log('[PlacesLangGraph] textsearch params', params);
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


