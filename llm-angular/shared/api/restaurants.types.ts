// shared/api/restaurants.types.ts
// Shared types for restaurant search results when using external providers (e.g., Google Places)

export type LatLng = { lat: number; lng: number };

export interface Restaurant {
    name: string;
    address: string;
    rating?: number | null;
    phone?: string | null;
    website?: string | null;
    openNow?: boolean | null;
    mapsUrl?: string | null;
    placeId: string;
    location?: LatLng | null;
}

export interface RestaurantsResponseMeta {
    source: "google" | "osm";
    cached: boolean;
    nextPageToken?: string | null;
    enrichedTopN: number;
}

export interface RestaurantsResponse {
    // Echo of the original query shape kept minimal to avoid coupling
    query: {
        city: string;
        type?: "pizza" | "sushi" | "burger" | "other";
        maxPrice?: number;
        language?: "he" | "en" | "ar" | "ru" | "fr";
        page?: number;
    };
    restaurants: Restaurant[];
    meta: RestaurantsResponseMeta;
}


