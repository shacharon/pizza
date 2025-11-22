// Minimal orchestrator stub for the new Places flow (LLM-first)
import type { PlacesIntent } from '../intent/places-intent.schema.js';
import type { PlacesResponseDto, QuerySummary } from '../models/types.js';
import { QueryBuilderService } from '../query/query-builder.service.js';
import { TextSearchStrategyImpl } from '../strategy/textsearch.strategy.js';
import { NearbySearchStrategyImpl } from '../strategy/nearbysearch.strategy.js';
import { FindPlaceStrategyImpl } from '../strategy/findplace.strategy.js';
import { ResponseNormalizerService } from '../normalize/response-normalizer.service.js';
import { PlacesIntentService } from '../intent/places-intent.service.js';
import { TranslationService } from '../translation/translation.service.js';
import type { TranslationResult } from '../translation/translation.types.js';

export interface PlacesChainInput {
    text?: string;
    schema?: PlacesIntent | null;
    sessionId?: string;
    userLocation?: { lat: number; lng: number } | null;
    nearMe?: boolean;
    browserLanguage?: string;
}

export interface PlacesChainOutput extends PlacesResponseDto { }

export class PlacesLangGraph {
    async run(input: PlacesChainInput): Promise<PlacesChainOutput> {
        const t0 = Date.now();

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STEP 1: TRANSLATION - Analyze and translate query if needed
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        let translation: TranslationResult | null = null;
        let queryForIntent = input.text || '';
        let languageForIntent: 'he' | 'en' | undefined = undefined;

        if (!input.schema && input.text) {
            const translationService = new TranslationService();
            translation = await translationService.analyzeAndTranslate(
                input.text,
                input.nearMe || false,
                input.userLocation ?? undefined,
                input.browserLanguage
            );

            // Use translated query and region language for intent resolution
            queryForIntent = translation.translatedQuery;
            languageForIntent = translation.regionLanguage as 'he' | 'en';

            console.log('[PlacesLangGraph] translation result', {
                inputLanguage: translation.inputLanguage,
                targetRegion: translation.targetRegion,
                regionLanguage: translation.regionLanguage,
                skipTranslation: translation.skipTranslation,
                fallback: translation.fallback
            });
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STEP 2: Build effective intent
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const effectiveIntent: PlacesIntent = input.schema ?? {
            intent: 'find_food',
            provider: 'google_places',
            search: {
                mode: 'textsearch',
                query: queryForIntent,
                target: input.userLocation ? { kind: 'coords', coords: input.userLocation } : { kind: 'me' },
                filters: languageForIntent ? { language: languageForIntent } : undefined,
            },
            output: {
                fields: [
                    'place_id', 'name', 'formatted_address', 'geometry', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'website', 'photos'
                ],
                page_size: 20
            },
        };

        // Ensure language preference is applied if provided explicitly
        if (languageForIntent) {
            effectiveIntent.search.filters = {
                ...(effectiveIntent.search.filters || {}),
                language: languageForIntent,
            } as any;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STEP 3: LLM Intent Resolution (uses translated query)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (!input.schema && queryForIntent) {
            const intentService = new PlacesIntentService();
            try {
                const llmIntent = await intentService.resolve(queryForIntent, languageForIntent);
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

        // Safety: If LLM chose nearbysearch but we don't have user coords and target is city/place,
        // prefer textsearch (Maps-like) instead of invalid/over-broad nearby.
        try {
            const targetKind: any = (effectiveIntent.search.target as any)?.kind;
            const hasUserCoords = Boolean(input.userLocation);
            if (effectiveIntent.search.mode === 'nearbysearch' && !hasUserCoords && (targetKind === 'city' || targetKind === 'place')) {
                effectiveIntent.search.mode = 'textsearch';
                // Remove rankby if set; textsearch does not use it
                if ((effectiveIntent.search.filters as any)?.rankby) {
                    delete (effectiveIntent.search.filters as any).rankby;
                }
            }
        } catch { }

        // Deterministic mode selection per rules
        try {
            const filters: any = effectiveIntent.search.filters || {};
            const targetKind: any = (effectiveIntent.search.target as any)?.kind;
            const queryText = (effectiveIntent.search.query || '').trim();
            const hasRichText = queryText.length > 0; // topic, dietary or attributes present
            const needHardRadius = filters.radius != null;
            const needClosest = looksNearMe;

            const setNearbyDefaults = (rankby: 'prominence' | 'distance') => {
                filters.rankby = rankby as any;
                if (rankby === 'distance') {
                    if (filters.radius != null) delete filters.radius; // forbidden with distance
                } else {
                    if (filters.radius == null) {
                        // Set sane radius for bounding
                        const r = targetKind === 'city' ? 5000 : targetKind === 'place' ? 500 : 1500;
                        filters.radius = r;
                    }
                }
                if (!filters.keyword && queryText) filters.keyword = queryText;
                effectiveIntent.search.filters = filters;
            };

            if (targetKind === 'place') {
                if (needClosest && !needHardRadius) {
                    effectiveIntent.search.mode = 'nearbysearch';
                    setNearbyDefaults('distance');
                } else {
                    if (hasRichText) {
                        effectiveIntent.search.mode = 'textsearch';
                    } else {
                        effectiveIntent.search.mode = 'nearbysearch';
                        setNearbyDefaults('prominence');
                    }
                }
            } else if (targetKind === 'city') {
                if (needHardRadius) {
                    effectiveIntent.search.mode = 'nearbysearch';
                    setNearbyDefaults('prominence');
                } else {
                    if (hasRichText) {
                        effectiveIntent.search.mode = 'textsearch';
                    } else {
                        effectiveIntent.search.mode = 'nearbysearch';
                        setNearbyDefaults('prominence');
                    }
                }
            } else {
                if (needClosest && !needHardRadius) {
                    effectiveIntent.search.mode = 'nearbysearch';
                    setNearbyDefaults('distance');
                } else {
                    if (hasRichText) {
                        effectiveIntent.search.mode = 'textsearch';
                    } else {
                        effectiveIntent.search.mode = 'nearbysearch';
                        setNearbyDefaults('prominence');
                    }
                }
            }
        } catch { }

        let mode = effectiveIntent.search.mode;
        const lang = languageForIntent ?? effectiveIntent.search.filters?.language;
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
            // Ensure coords are resolved for city/place before nearby; otherwise fall back to textsearch
            const coords = (effectiveIntent.search.target as any)?.coords || await (new QueryBuilderService()).resolveTargetCoordsAsync(effectiveIntent);
            if (coords) {
                (effectiveIntent.search as any).target = { kind: 'coords', coords };
                const params = builder.buildNearbySearch(effectiveIntent);
                const raw = await new NearbySearchStrategyImpl().execute(params);
                const norm = normalizer.normalizeList(raw, effectiveIntent.output?.fields ?? []);
                restaurants = norm.items;
                nextPageToken = norm.nextPageToken;
            } else {
                // Fallback: no coords for nearby, do textsearch instead and add a note
                const tsParams = await builder.buildTextSearchAsync(effectiveIntent);
                const tsRaw = await new TextSearchStrategyImpl().execute(tsParams);
                const tsNorm = normalizer.normalizeList(tsRaw, effectiveIntent.output?.fields ?? []);
                restaurants = tsNorm.items;
                nextPageToken = tsNorm.nextPageToken;
                mode = 'textsearch';
                (query as any).mode = mode;
                return { query, restaurants, meta: { source: 'google', mode, nextPageToken, cached: false, tookMs: Date.now() - t0, note: 'Nearby requested without coords; used textsearch with radius.' } };
            }
        } else {
            // Mode: findplace. If we also have a non-empty food/topic query, run a secondary
            // textsearch anchored to the candidate's coords and return those results, with a note.
            let norm;
            try {
                const params = builder.buildFindPlace(effectiveIntent);
                const raw = await new FindPlaceStrategyImpl().execute(params);
                norm = normalizer.normalizeList(raw, effectiveIntent.output?.fields ?? []);
            } catch (err) {
                // Fallback: findplace failed; if target city exists, run city-anchored textsearch with a note
                const city = (effectiveIntent.search.target as any)?.city;
                if (city) {
                    const coords = await (new QueryBuilderService()).resolveTargetCoordsAsync({ ...effectiveIntent, search: { ...effectiveIntent.search, target: { kind: 'city', city } } } as any);
                    const aroundIntent: PlacesIntent = {
                        ...effectiveIntent,
                        search: {
                            ...effectiveIntent.search,
                            mode: 'textsearch',
                            target: coords ? ({ kind: 'coords', coords } as any) : effectiveIntent.search.target
                        }
                    } as any;
                    const tsParams = await builder.buildTextSearchAsync(aroundIntent);
                    const tsRaw = await new TextSearchStrategyImpl().execute(tsParams);
                    const tsNorm = normalizer.normalizeList(tsRaw, effectiveIntent.output?.fields ?? []);
                    restaurants = tsNorm.items;
                    nextPageToken = tsNorm.nextPageToken;
                    mode = 'textsearch';
                    (query as any).mode = mode;
                    return { query, restaurants, meta: { source: 'google', mode, nextPageToken, cached: false, tookMs: Date.now() - t0, note: 'Venue not found confidently; showing results in target city.' } };
                }
                throw err;
            }
            const topic = (effectiveIntent.search.query || '').trim();
            const candidateLoc = (norm.items[0]?.location as any) || null;
            if (topic && candidateLoc && typeof candidateLoc.lat === 'number' && typeof candidateLoc.lng === 'number') {
                // Build a synthetic intent for textsearch around the candidate
                const aroundIntent: PlacesIntent = {
                    ...effectiveIntent,
                    search: {
                        ...effectiveIntent.search,
                        mode: 'textsearch',
                        target: { kind: 'coords', coords: { lat: candidateLoc.lat, lng: candidateLoc.lng } } as any,
                        filters: { ...(effectiveIntent.search.filters || {}), keyword: topic }
                    }
                } as any;
                const tsParams = await builder.buildTextSearchAsync(aroundIntent);
                const tsRaw = await new TextSearchStrategyImpl().execute(tsParams);
                const tsNorm = normalizer.normalizeList(tsRaw, effectiveIntent.output?.fields ?? []);
                restaurants = tsNorm.items;
                nextPageToken = tsNorm.nextPageToken;
                mode = 'textsearch';
                (query as any).mode = mode;
                (query as any).language = lang;
                return {
                    query,
                    restaurants,
                    meta: { source: 'google', mode, nextPageToken, cached: false, tookMs: Date.now() - t0, note: `Low certainty or mixed intent; searched around '${effectiveIntent.search.target?.place ?? 'place'}' for topic '${topic}'.` },
                };
            }
            // Otherwise, return the findplace candidates (normalized) as-is
            restaurants = norm.items;
            nextPageToken = norm.nextPageToken;
        }

        // City anchoring to reduce spillover: if intent is city and we have coords,
        // prefer nearbysearch with rankby=prominence and the same topic keyword.
        if (effectiveIntent.search.mode === 'textsearch' && (effectiveIntent.search.target as any)?.kind === 'city') {
            const coords = await (new QueryBuilderService()).resolveTargetCoordsAsync(effectiveIntent);
            if (coords) {
                const nearbyIntent: PlacesIntent = {
                    ...effectiveIntent,
                    search: {
                        ...effectiveIntent.search,
                        mode: 'nearbysearch',
                        target: { kind: 'coords', coords } as any,
                        filters: { ...(effectiveIntent.search.filters || {}), rankby: 'prominence' as any, keyword: (effectiveIntent.search.query || '').trim(), radius: (effectiveIntent.search.filters as any)?.radius ?? 5000 }
                    }
                } as any;
                const params = (new QueryBuilderService()).buildNearbySearch(nearbyIntent);
                const raw = await new NearbySearchStrategyImpl().execute(params);
                const norm = normalizer.normalizeList(raw, effectiveIntent.output?.fields ?? []);
                restaurants = norm.items;
                nextPageToken = norm.nextPageToken;
                mode = 'nearbysearch';
            } // if no coords, keep textsearch results as-is
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STEP N: TRANSLATE RESULTS BACK (if needed)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        let finalRestaurants = restaurants;
        let translationNote: string | undefined = translation?.note;

        if (translation && !translation.skipTranslation && restaurants.length > 0) {
            try {
                const translationService = new TranslationService();
                finalRestaurants = await translationService.translateResults(
                    restaurants,
                    translation.regionLanguage,
                    translation.inputLanguage
                );
                console.log('[PlacesLangGraph] translated results back to', translation.inputLanguage);
            } catch (error) {
                console.warn('[PlacesLangGraph] result translation failed', (error as Error)?.message);
                translationNote = translationNote
                    ? `${translationNote}; Result translation failed`
                    : 'Result translation failed; showing original language';
            }
        }

        const meta: any = {
            source: 'google',
            mode,
            nextPageToken,
            cached: false,
            tookMs: Date.now() - t0
        };

        if (translationNote) {
            meta.note = translationNote;
        }

        return {
            query,
            restaurants: finalRestaurants,
            meta,
        };
    }
}


