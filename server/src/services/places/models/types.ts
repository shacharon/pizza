export type AllowedLanguage = 'he' | 'en';

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
    openNow?: boolean;
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


