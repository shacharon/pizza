/**
 * Shared types and interfaces for the Food feature module
 */

export interface Restaurant {
    name: string;
    address?: string | null;
    vicinity?: string;
    rating?: number | null;
    photoUrl?: string | null;
    placeId?: string;
    priceLevel?: number;
    userRatingsTotal?: number;
    types?: string[];
    distance?: number;
    phoneNumber?: string;
    openingHours?: { openNow?: boolean };
    delivery?: boolean;
    takeaway?: boolean;
}

export type ViewMode = 'list' | 'grid';

export interface FoodSearchResponse {
    restaurants: Restaurant[];
    meta: {
        source: string;
        nextPageToken?: string;
        totalResults?: number;
        nluConfidence?: number;
        cached?: boolean;
    };
}

export interface SearchOptions {
    city?: string;
    type?: string;
    maxPrice?: number;
    minRating?: number;
    openNow?: boolean;
    delivery?: boolean;
}

export interface SearchSuggestion {
    text: string;
    type: 'cuisine' | 'location' | 'restaurant';
    icon?: string;
}
