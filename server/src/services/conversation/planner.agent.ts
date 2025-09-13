import config from '../../config/index.js';
import { findCity, textSearch, fetchDetails } from '../google/places.service.js';
import type { RestaurantsResponse } from '@api';

export interface PlannerInput {
    text: string;
    language: 'he' | 'en' | 'ar';
}

export async function runAgentLoopPlanner(input: PlannerInput): Promise<RestaurantsResponse | null> {
    if (!config.FEATURE_AGENT_LOOP) return null;
    const t0 = Date.now();
    const TIME_CAP_MS = 6000;
    try {
        // Step 1: naive anchor extraction via geocode
        const geo = await findCity(input.text, input.language);

        // Step 2: text search with or without geo
        const q = input.text;
        let data: any;
        let radius = geo ? 2_000 : undefined;
        if (geo) {
            data = await textSearch(q, input.language, undefined, { location: { lat: geo.lat, lng: geo.lng }, radiusMeters: radius });
        } else {
            data = await textSearch(q, input.language);
        }
        let restaurants = Array.isArray(data?.results) ? data.results.map((r: any) => ({
            name: r.name,
            address: r.formatted_address,
            rating: r.rating ?? null,
            priceLevel: r.price_level ?? null,
            placeId: r.place_id,
            photoUrl: null,
            location: r.geometry?.location ?? null,
            types: r.types ?? null,
            website: r.website ?? null,
        })) : [];
        // Step 3: widen radius if geo exists and few results
        if (geo && restaurants.length < 5) {
            const widenSteps = [6_000, 10_000];
            for (const r of widenSteps) {
                if (Date.now() - t0 > TIME_CAP_MS) break;
                const d = await textSearch(q, input.language, undefined, { location: { lat: geo.lat, lng: geo.lng }, radiusMeters: r });
                const list = Array.isArray(d?.results) ? d.results.map((rr: any) => ({
                    name: rr.name,
                    address: rr.formatted_address,
                    rating: rr.rating ?? null,
                    priceLevel: rr.price_level ?? null,
                    placeId: rr.place_id,
                    photoUrl: null,
                    location: rr.geometry?.location ?? null,
                    types: rr.types ?? null,
                    website: rr.website ?? null,
                })) : [];
                if (list.length > restaurants.length) {
                    restaurants = list;
                    radius = r;
                }
                if (restaurants.length >= 5) break;
            }
        }

        // Step 4 (optional): enrich Top-N if time permits
        let enrichedTopN = 0;
        if (Date.now() - t0 < TIME_CAP_MS - 1500 && restaurants.length > 0) {
            const topN = Math.min(8, restaurants.length);
            const promises = restaurants.slice(0, topN).map(r => fetchDetails((r as any).placeId, input.language));
            const settled = await Promise.allSettled(promises);
            settled.forEach((s, i) => {
                if (s.status === 'fulfilled' && s.value) {
                    const d: any = s.value;
                    const ref = d?.photos?.[0]?.photo_reference ?? null;
                    if (ref && !(restaurants[i] as any).photoUrl) {
                        // keep photoUrl null to avoid extra URL assembly here; planner is lightweight
                        (restaurants[i] as any).photoUrl = null;
                    }
                }
            });
            enrichedTopN = topN;
        }

        const out: RestaurantsResponse = { query: { city: geo?.city || 'unknown', language: input.language }, restaurants, meta: { source: 'google', cached: false, nextPageToken: data?.next_page_token ?? null, enrichedTopN } } as any;
        console.log('[AgentLoop] done in', Date.now() - t0, 'ms, count=', restaurants.length);
        return out;
    } catch (e) {
        console.warn('[AgentLoop] failed', e);
        return null;
    }
}


