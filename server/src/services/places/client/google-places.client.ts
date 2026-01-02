import { PlacesConfig } from '../config/places.config.js';
import { traceProviderCall } from '../../../lib/telemetry/providerTrace.js';

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
    pageToken?: string;  // NEW: For fetching next page
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

    async textSearch(params: TextSearchParams, traceId?: string, sessionId?: string): Promise<GoogleRawResponse> {
        const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
        url.searchParams.set('key', this.config.apiKey);
        
        // When using pagetoken, ONLY send key + pagetoken (Google requirement)
        if (params.pageToken) {
            url.searchParams.set('pagetoken', params.pageToken);
        } else {
            // Normal search with all parameters
            url.searchParams.set('query', params.query);
            if (params.language) url.searchParams.set('language', params.language);
            const region = params.region ?? this.config.defaultRegion;
            if (region) url.searchParams.set('region', region);
            if (params.location) url.searchParams.set('location', `${params.location.lat},${params.location.lng}`);
            if (params.radius != null) url.searchParams.set('radius', String(params.radius));
            if (params.openNow != null) url.searchParams.set('opennow', params.openNow ? 'true' : 'false');
            if (params.priceMin != null) url.searchParams.set('minprice', String(params.priceMin));
            if (params.priceMax != null) url.searchParams.set('maxprice', String(params.priceMax));
        }
        
        // Redact API key in logs for safety
        const redacted = url.toString().replace(/(key=)[^&]+/i, '$1***');
        // console.log('[GooglePlacesClient] textSearch params', redacted);
        // console.log('[GooglePlacesClient] textSearch params', url.toString());
        return this.#fetchWithRetry(url.toString(), this.config.timeouts.textsearchMs, traceId, sessionId);
    }

    async nearbySearch(_params: NearbySearchParams, traceId?: string, sessionId?: string): Promise<GoogleRawResponse> {
        const params = _params;
        const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
        url.searchParams.set('key', this.config.apiKey);
        url.searchParams.set('location', `${params.location.lat},${params.location.lng}`);
        if (params.rankby === 'distance') {
            url.searchParams.set('rankby', 'distance');
        } else {
            // default prominence; include radius when provided
            if (params.radius != null) url.searchParams.set('radius', String(params.radius));
        }
        if (params.keyword) url.searchParams.set('keyword', params.keyword);
        if (params.type) url.searchParams.set('type', params.type);
        if (params.language) url.searchParams.set('language', params.language);
        if (params.openNow != null) url.searchParams.set('opennow', params.openNow ? 'true' : 'false');
        if (params.priceMin != null) url.searchParams.set('minprice', String(params.priceMin));
        if (params.priceMax != null) url.searchParams.set('maxprice', String(params.priceMax));

        return this.#fetchWithRetry(url.toString(), this.config.timeouts.nearbyMs, traceId, sessionId);
    }

    async findPlace(params: FindPlaceParams, traceId?: string, sessionId?: string): Promise<GoogleRawResponse> {
        const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
        url.searchParams.set('key', this.config.apiKey);
        url.searchParams.set('input', params.input);
        url.searchParams.set('inputtype', 'textquery');
        if (params.fields?.length) url.searchParams.set('fields', params.fields.join(','));
        if (params.language) url.searchParams.set('language', params.language);
        const redacted = url.toString().replace(/(key=)[^&]+/i, '$1***');
        console.log('[GooglePlacesClient] findPlace params', redacted);
        return this.#fetchWithRetry(url.toString(), this.config.timeouts.findplaceMs, traceId, sessionId);
    }

    async geocodeAddress(address: string, language?: Language, region?: string): Promise<{ lat: number; lng: number } | null> {
        // Use Places Find Place with fields=geometry to stay within Places API
        const payload: any = { input: address, fields: ['geometry'] };
        if (language) payload.language = language;
        const res = await this.findPlace(payload as FindPlaceParams);
        const first = (res.candidates && res.candidates[0]) as any;
        const loc = first?.geometry?.location;
        if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
            return { lat: loc.lat, lng: loc.lng };
        }
        return null;
    }

    async #fetchWithRetry(
        url: string,
        timeoutMs: number,
        traceId?: string,
        sessionId?: string
    ): Promise<GoogleRawResponse> {
        console.log('[GooglePlacesClient] #fetchWithRetry', url);
        const attempts = Math.max(1, this.config.retry.attempts + 1);
        let lastError: unknown = null;
        for (let i = 0; i < attempts; i++) {
            try {
                // Wrap fetch call with tracing
                const data = await traceProviderCall(
                    {
                        traceId,
                        sessionId,
                        provider: 'google_places',
                        operation: 'apiCall',
                        retryCount: i,
                    },
                    async () => {
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), timeoutMs);
                        
                        const res = await fetch(url, { signal: controller.signal });
                        clearTimeout(timer);
                        
                        if (!res.ok) {
                            const error: any = new Error(`Upstream HTTP ${res.status}`);
                            error.status = res.status;
                            throw error;
                        }
                        
                        const data = (await res.json()) as GoogleRawResponse;
                        
                        if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
                            return data;
                        }
                        
                        const error: any = new Error(
                            `Google status ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`
                        );
                        error.status = data.status === 'OVER_QUERY_LIMIT' ? 429 : 500;
                        error.code = data.status;
                        throw error;
                    }
                );
                
                return data;
            } catch (err) {
                lastError = err;
                const backoff = this.config.retry.backoffMs[i] ?? 0;
                if (i < attempts - 1) {
                    await new Promise((r) => setTimeout(r, backoff));
                    continue;
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
}


