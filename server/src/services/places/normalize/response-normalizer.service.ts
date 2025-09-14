import type { PlacesResponseDto, RestaurantItem } from '../models/types.js';
import type { GoogleRawResponse } from '../client/google-places.client.js';

export class ResponseNormalizerService {
    // For now return empty normalized items; to be implemented with real mapping
    normalizeList(_raw: GoogleRawResponse, projectionFields: string[]): { items: RestaurantItem[]; nextPageToken: string | null } {
        void projectionFields;
        return { items: [], nextPageToken: null };
    }
}


