import type { PlacesIntent } from '../intent/places-intent.schema.js';
import { GooglePlacesClient, type TextSearchParams, type NearbySearchParams, type FindPlaceParams } from '../client/google-places.client.js';
import { PlacesConfig } from '../config/places.config.js';

export class QueryBuilderService {
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

        const radius = filters.radius ?? (coords ? 0 : undefined);

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
        const radius = filters.radius ?? (location ? 0 : undefined);
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
        const base: any = {
            location: intent.search.target.coords!,
        };
        if (filters.keyword) base.keyword = filters.keyword;
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


