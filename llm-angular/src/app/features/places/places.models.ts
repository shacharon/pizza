/**
 * Domain models for Places feature
 * Following Angular best practices: strong typing and separation of concerns
 */

export type Language = 'he' | 'en';
export type SearchMode = 'textsearch' | 'nearbysearch' | 'findplace';

/**
 * Request model for Places search
 */
export interface PlacesSearchRequest {
    query: string;
    nearMe: boolean;
    mode?: SearchMode; // Optional: for troubleshooting, will be removed in Phase 2
    userLocation?: { lat: number; lng: number };
}

/**
 * Individual place item returned from search
 */
export interface PlaceItem {
    placeId: string;
    name: string;
    address: string;
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    photoUrl?: string;
    website?: string;
    openNow?: boolean;
    location?: { lat: number; lng: number };
}

/**
 * Complete search response
 */
export interface PlacesSearchResponse {
    query: {
        mode: SearchMode;
        language?: Language;
    };
    places: PlaceItem[];
    meta: {
        source: 'google';
        mode: SearchMode;
        nextPageToken: string | null;
        cached: boolean;
        tookMs: number;
        note?: string; // Optional hint/explanation from backend
    };
}

/**
 * UI state for language and region detection
 */
export interface DetectedContext {
    language: Language | null;
    region: string;
}


