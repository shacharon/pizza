import type { RestaurantItem } from '../models/types.js';
import type { GoogleRawResponse } from '../client/google-places.client.js';

export class ResponseNormalizerService {
    // For now return empty normalized items; to be implemented with real mapping
    normalizeList(raw: GoogleRawResponse<any>, projectionFields: string[]): { items: RestaurantItem[]; nextPageToken: string | null } {
        const sourceArray = raw.results ?? raw.candidates ?? [];
        const items: RestaurantItem[] = sourceArray.map((r: any) => this.#mapItem(r, projectionFields));
        const nextPageToken = raw.next_page_token ?? null;
        return { items, nextPageToken };
    }

    #mapItem(r: any, _fields: string[]): RestaurantItem {
        // Minimal safe mapping for textsearch
        const placeId: string = r.place_id ?? '';
        const name: string = r.name ?? '';
        const address: string = r.formatted_address ?? r.vicinity ?? '';
        const rating: number | undefined = typeof r.rating === 'number' ? r.rating : undefined;
        const userRatingsTotal: number | undefined = typeof r.user_ratings_total === 'number' ? r.user_ratings_total : undefined;
        const priceLevel: number | undefined = typeof r.price_level === 'number' ? r.price_level : undefined;
        const location = r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : undefined;
        const openNow: boolean | undefined = r.opening_hours?.open_now;

        // Photo URL construction requires key; omitted for now
        return { placeId, name, address, rating, userRatingsTotal, priceLevel, location, openNow };
    }
}


