import type { PlacesIntent } from '../intent/places-intent.schema.js';
import { GooglePlacesClient, type TextSearchParams, type NearbySearchParams, type FindPlaceParams } from '../client/google-places.client.js';
import { PlacesConfig } from '../config/places.config.js';

export class QueryBuilderService {
    async resolveTargetCoordsAsync(intent: PlacesIntent, client = new GooglePlacesClient()): Promise<{ lat: number; lng: number } | undefined> {
        const filters = intent.search.filters || {};
        let coords = intent.search.target.coords ?? undefined;
        if (!coords) {
            try {
                if (intent.search.target.kind === 'city' && intent.search.target.city) {
                    coords = await client.geocodeAddress(
                        intent.search.target.city,
                        filters.language,
                        filters.region ?? PlacesConfig.defaultRegion
                    ) ?? undefined;
                } else if (intent.search.target.kind === 'place' && intent.search.target.place) {
                    coords = await client.geocodeAddress(
                        intent.search.target.place,
                        filters.language,
                        filters.region ?? PlacesConfig.defaultRegion
                    ) ?? undefined;
                }
            } catch (err) {
                console.warn('[QueryBuilderService] resolveTargetCoordsAsync failed', { message: (err as Error)?.message });
                coords = undefined;
            }
        }
        return coords;
    }
    async buildTextSearchAsync(intent: PlacesIntent, client = new GooglePlacesClient()): Promise<TextSearchParams> {
        const filters = intent.search.filters || {};
        let coords = intent.search.target.coords ?? undefined;
        if (!coords) {
            try {
                if (intent.search.target.kind === 'city' && intent.search.target.city) {
                    coords = await client.geocodeAddress(
                        intent.search.target.city,
                        filters.language,
                        filters.region ?? PlacesConfig.defaultRegion
                    ) ?? undefined;
                } else if (intent.search.target.kind === 'place' && intent.search.target.place) {
                    coords = await client.geocodeAddress(
                        intent.search.target.place,
                        filters.language,
                        filters.region ?? PlacesConfig.defaultRegion
                    ) ?? undefined;
                }
            } catch (err) {
                console.warn('[QueryBuilderService] geocode failed, continuing without coords', { message: (err as Error)?.message });
                coords = undefined;
            }
        }

        // Use a sane default radius for textsearch when coords are available.
        // City targets get a larger default bias; place/coords get a tighter default (e.g., street/landmark focus).
        const targetKind = intent.search.target.kind;
        const defaultRadius = targetKind === 'city'
            ? 5000
            : targetKind === 'place'
                ? 500
                : 1500;
        const radius = filters.radius ?? (coords ? defaultRadius : undefined);

        const base: any = {
            query: [filters.keyword, intent.search.query].filter(Boolean).join(' ').trim(),
        };
        if (filters.language) base.language = filters.language;
        if (filters.region) base.region = filters.region;
        if (coords) base.location = coords;
        if (radius != null) base.radius = radius;
        if (filters.opennow != null) base.openNow = filters.opennow;
        if (filters.price?.min != null) base.priceMin = filters.price.min;
        if (filters.price?.max != null) base.priceMax = filters.price.max;
        return base as TextSearchParams;
    }

    buildTextSearch(intent: PlacesIntent): TextSearchParams {
        const filters = intent.search.filters || {};
        const location = intent.search.target.coords ?? undefined; // legacy sync path without geocoding
        const targetKind = intent.search.target.kind;
        const defaultRadius = targetKind === 'city'
            ? 5000
            : targetKind === 'place'
                ? 500
                : 1500;
        const radius = filters.radius ?? (location ? defaultRadius : undefined);
        const base: any = {
            query: [filters.keyword, intent.search.query].filter(Boolean).join(' ').trim(),
        };
        if (filters.language) base.language = filters.language;
        if (filters.region) base.region = filters.region;
        if (location) base.location = location;
        if (radius != null) base.radius = radius;
        if (filters.opennow != null) base.openNow = filters.opennow;
        if (filters.price?.min != null) base.priceMin = filters.price.min;
        if (filters.price?.max != null) base.priceMax = filters.price.max;
        return base as TextSearchParams;
    }

    buildNearbySearch(intent: PlacesIntent): NearbySearchParams {
        const filters = intent.search.filters || {};
        const target = intent.search.target as any;

        // Ensure coords exist: geocode city/place if needed (nearbysearch requires location)
        let location = target?.coords as { lat: number; lng: number } | undefined;
        if (!location && (target?.kind === 'city' || target?.kind === 'place')) {
            // NOTE: synchronous path; callers should prefer the async builder variant if added
            // Here we cannot await, so we rely on target.coords being pre-resolved in most flows
            // If not present, we throw to surface a clear error rather than sending invalid params
            throw new Error('nearbysearch requires resolved coords (target.coords)');
        }

        const base: any = { location };
        const keyword = filters.keyword ?? (intent.search.query ? String(intent.search.query).trim() : undefined);
        if (keyword) base.keyword = keyword;
        if (filters.type) base.type = filters.type;
        if (filters.rankby) base.rankby = filters.rankby;
        const radius = filters.rankby === 'distance' ? undefined : filters.radius;
        if (radius != null) base.radius = radius;
        if (filters.language) base.language = filters.language;
        if (filters.opennow != null) base.openNow = filters.opennow;
        if (filters.price?.min != null) base.priceMin = filters.price.min;
        if (filters.price?.max != null) base.priceMax = filters.price.max;
        return base as NearbySearchParams;
    }

    buildFindPlace(intent: PlacesIntent): FindPlaceParams {
        const filters = intent.search.filters || {};
        const base: any = {
            input: intent.search.query || '',
            fields: intent.output?.fields ?? [
                'place_id', 'name', 'formatted_address', 'geometry', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'website', 'photos'
            ],
        };
        if (filters.language) base.language = filters.language;
        return base as FindPlaceParams;
    }
}


