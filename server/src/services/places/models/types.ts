export type AllowedLanguage = 'he' | 'en';

/**
 * Verifiable Boolean - Tri-state type for data quality
 * - true: Verified and confirmed
 * - false: Verified and confirmed false
 * - 'UNKNOWN': Not verified or data not available
 */
export type VerifiableBoolean = true | false | 'UNKNOWN';

export interface LatLng {
    lat: number;
    lng: number;
}

export type SearchMode = 'textsearch' | 'nearbysearch' | 'findplace';

export interface QuerySummary {
    mode: SearchMode;
    language?: AllowedLanguage;
}

export interface RestaurantItemLocation extends LatLng { }

export interface RestaurantItem {
    placeId: string;
    name: string;
    address: string;
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    photoUrl?: string;
    location?: RestaurantItemLocation;
    website?: string;
    openNow?: VerifiableBoolean;  // true | false | 'UNKNOWN'
}

export interface MetaInfo {
    source: 'google';
    mode: SearchMode;
    nextPageToken: string | null;
    cached: boolean;
    tookMs: number;
    note?: string;
}

export interface PlacesResponseDto {
    query: QuerySummary;
    restaurants: RestaurantItem[];
    meta: MetaInfo;
}


