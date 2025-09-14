import type { PlacesIntent } from '../intent/places-intent.schema.js';
import type { TextSearchParams, NearbySearchParams, FindPlaceParams } from '../client/google-places.client.js';

export class QueryBuilderService {
    buildTextSearch(intent: PlacesIntent): TextSearchParams {
        const filters = intent.search.filters || {};
        return {
            query: [filters.keyword, intent.search.query].filter(Boolean).join(' ').trim(),
            language: filters.language,
            region: filters.region,
            location: intent.search.target.coords ?? undefined,
            radius: filters.radius,
            openNow: filters.opennow,
            priceMin: filters.price?.min,
            priceMax: filters.price?.max,
        };
    }

    buildNearbySearch(intent: PlacesIntent): NearbySearchParams {
        const filters = intent.search.filters || {};
        return {
            location: intent.search.target.coords!,
            keyword: filters.keyword,
            type: filters.type,
            rankby: filters.rankby,
            radius: filters.rankby === 'distance' ? undefined : filters.radius,
            language: filters.language,
            openNow: filters.opennow,
            priceMin: filters.price?.min,
            priceMax: filters.price?.max,
        };
    }

    buildFindPlace(intent: PlacesIntent): FindPlaceParams {
        const filters = intent.search.filters || {};
        return {
            input: intent.search.query || '',
            fields: intent.output?.fields ?? [
                'place_id', 'name', 'formatted_address', 'geometry', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'website', 'photos'
            ],
            language: filters.language,
        };
    }
}


