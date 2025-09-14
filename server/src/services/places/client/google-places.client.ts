import { PlacesConfig } from '../config/places.config.js';

export type Language = 'he' | 'en';

export interface TextSearchParams {
    query: string;
    language?: Language;
    region?: string;
    location?: { lat: number; lng: number };
    radius?: number;
    openNow?: boolean;
    priceMin?: number;
    priceMax?: number;
}

export interface NearbySearchParams {
    location: { lat: number; lng: number };
    keyword?: string;
    type?: string;
    rankby?: 'prominence' | 'distance';
    radius?: number; // omit when rankby=distance
    language?: Language;
    openNow?: boolean;
    priceMin?: number;
    priceMax?: number;
}

export interface FindPlaceParams {
    input: string;
    fields: string[];
    language?: Language;
}

export interface GoogleRawResponse<T = unknown> {
    status: string;
    error_message?: string;
    html_attributions?: string[];
    results?: T[];
    candidates?: T[];
    next_page_token?: string | null;
}

export class GooglePlacesClient {
    constructor(private readonly config = PlacesConfig) { }

    async textSearch(_params: TextSearchParams): Promise<GoogleRawResponse> {
        // TODO: implement fetch with this.config.timeouts.textsearchMs and retries
        return { status: 'OK', results: [], next_page_token: null };
    }

    async nearbySearch(_params: NearbySearchParams): Promise<GoogleRawResponse> {
        // TODO: implement fetch with this.config.timeouts.nearbyMs and retries
        return { status: 'OK', results: [], next_page_token: null };
    }

    async findPlace(_params: FindPlaceParams): Promise<GoogleRawResponse> {
        // TODO: implement fetch with this.config.timeouts.findplaceMs and retries
        return { status: 'OK', candidates: [] };
    }
}


