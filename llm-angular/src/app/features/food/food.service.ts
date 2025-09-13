import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, throwError } from 'rxjs';
import { Restaurant } from './food-grid-results.component';

export interface FoodSearchResponse {
    restaurants: Restaurant[];
    meta: {
        source: string;
        nextPageToken?: string;
        totalResults?: number;
        nluConfidence?: number;
        cached?: boolean;
    };
    // Optional concise follow-up question from backend
    message?: string;
}

export interface SearchOptions {
    city?: string;
    type?: string;
    maxPrice?: number;
    minRating?: number;
    openNow?: boolean;
    delivery?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class FoodService {
    private readonly apiUrl = '/api';

    constructor(private http: HttpClient) { }

    /**
     * Main search method that handles natural language queries
     * @param query Natural language search query (e.g., "pizza in Tel Aviv")
     * @param options Additional search options
     */
    search(query: string, options?: SearchOptions, userLocation?: { lat: number; lng: number }): Observable<FoodSearchResponse> {
        const body: any = {
            text: query,
            language: this.detectLanguage(query)
        };

        if (userLocation) {
            body.userLocation = userLocation;
            body.nearMe = true;
        }

        const headers = {
            'Content-Type': 'application/json',
            'x-session-id': this.generateSessionId()
        };

        return this.http.post<any>(`${this.apiUrl}/nlu/parse`, body, { headers })
            .pipe(
                map(response => this.transformResponse(response)),
                catchError(error => this.handleError(error))
            );
    }

    private generateSessionId(): string {
        const stored = localStorage.getItem('food-session-id');
        if (stored) return stored;

        const newId = `food-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('food-session-id', newId);
        return newId;
    }

    private detectLanguage(text: string): 'he' | 'en' | 'ar' {
        // Simple heuristic: check first char script; default EN
        const trimmed = (text || '').trim();

        // Check for Hebrew characters
        if (/[\u0590-\u05FF]/.test(trimmed)) return 'he';

        // Check for Arabic characters  
        if (/[\u0600-\u06FF]/.test(trimmed)) return 'ar';

        // Default to English
        return 'en';
    }

    /**
     * Load more results using pagination token
     * @param nextPageToken Token from previous search response
     */
    loadMore(nextPageToken: string): Observable<FoodSearchResponse> {
        const params = new HttpParams()
            .set('pagetoken', nextPageToken);

        return this.http.get<FoodSearchResponse>(`${this.apiUrl}/places/search`, { params })
            .pipe(
                map(response => this.transformResponse(response)),
                catchError(error => this.handleError(error))
            );
    }

    /**
     * Search for restaurants with specific filters
     * @param filters Structured search filters
     */
    searchWithFilters(filters: {
        city?: string;
        type?: string;
        maxPrice?: number;
        minRating?: number;
        openNow?: boolean;
        delivery?: boolean;
        query?: string;
    }): Observable<FoodSearchResponse> {
        // Build query string from filters
        const queryParts: string[] = [];

        if (filters.query) {
            queryParts.push(filters.query);
        }

        if (filters.type) {
            queryParts.push(filters.type);
        }

        if (filters.city) {
            queryParts.push(`in ${filters.city}`);
        }

        if (filters.maxPrice) {
            queryParts.push(`under ₪${filters.maxPrice}`);
        }

        if (filters.openNow) {
            queryParts.push('open now');
        }

        if (filters.delivery) {
            queryParts.push('with delivery');
        }

        const query = queryParts.join(' ');

        return this.search(query, filters);
    }

    /**
     * Get restaurant details by place ID
     * @param placeId Google Places place ID
     */
    getRestaurantDetails(placeId: string): Observable<Restaurant> {
        const params = new HttpParams()
            .set('placeid', placeId);

        return this.http.get<Restaurant>(`${this.apiUrl}/places/details`, { params })
            .pipe(
                catchError(error => this.handleError(error))
            );
    }

    /**
     * Get nearby restaurants based on location
     * @param latitude User's latitude
     * @param longitude User's longitude
     * @param radius Search radius in meters
     */
    getNearbyRestaurants(latitude: number, longitude: number, radius = 1000): Observable<FoodSearchResponse> {
        const query = `restaurants near me`;
        const params = new HttpParams()
            .set('text', query)
            .set('language', 'he')
            .set('location', `${latitude},${longitude}`)
            .set('radius', radius.toString());

        return this.http.get<FoodSearchResponse>(`${this.apiUrl}/nlu/parse`, { params })
            .pipe(
                map(response => this.transformResponse(response)),
                catchError(error => this.handleError(error))
            );
    }

    /**
     * Transform backend response to our internal format
     */
    private transformResponse(response: any): FoodSearchResponse {
        // Handle different response formats from backend
        if (response.type === 'results') {
            return {
                restaurants: response.restaurants || [],
                meta: {
                    source: response.meta?.source || 'google',
                    nextPageToken: response.meta?.nextPageToken,
                    totalResults: response.restaurants?.length || 0,
                    nluConfidence: response.meta?.nluConfidence || 0,
                    cached: response.meta?.cached || false
                },
                message: response.message
            };
        }

        // Handle clarification responses
        if (response.type === 'clarify') {
            return {
                restaurants: [],
                meta: {
                    source: 'nlu',
                    nluConfidence: 0,
                    cached: false
                },
                message: response.message
            };
        }

        // Default empty response
        return {
            restaurants: [],
            meta: {
                source: 'unknown',
                cached: false
            }
        };
    }

    /**
     * Handle HTTP errors
     */
    private handleError(error: any): Observable<never> {
        console.error('FoodService error:', error);

        let errorMessage = 'An unknown error occurred';

        if (error.error instanceof ErrorEvent) {
            // Client-side error
            errorMessage = error.error.message;
        } else if (error.status) {
            // Server-side error
            switch (error.status) {
                case 400:
                    errorMessage = 'Invalid search query. Please try again.';
                    break;
                case 404:
                    errorMessage = 'No restaurants found for your search.';
                    break;
                case 429:
                    errorMessage = 'Too many requests. Please wait and try again.';
                    break;
                case 500:
                    errorMessage = 'Server error. Please try again later.';
                    break;
                default:
                    errorMessage = `Server error: ${error.status}`;
            }
        }

        return throwError(() => new Error(errorMessage));
    }

    /**
     * Utility method to build search queries
     */
    buildQuery(options: {
        cuisine?: string;
        city?: string;
        price?: string;
        dietary?: string[];
        features?: string[];
    }): string {
        const parts: string[] = [];

        if (options.cuisine) {
            parts.push(options.cuisine);
        }

        if (options.city) {
            parts.push(`in ${options.city}`);
        }

        if (options.price) {
            parts.push(options.price);
        }

        if (options.dietary && options.dietary.length > 0) {
            parts.push(options.dietary.join(' '));
        }

        if (options.features && options.features.length > 0) {
            parts.push(options.features.join(' '));
        }

        return parts.join(' ');
    }

    /**
     * Get popular search suggestions
     */
    getPopularSearches(): string[] {
        return [
            'Pizza in Tel Aviv',
            'Italian restaurants',
            'Coffee shops',
            'Fast food',
            'Vegetarian options',
            'Delivery available',
            'Open now',
            'Highly rated restaurants'
        ];
    }

    /**
     * Get cuisine type suggestions
     */
    getCuisineTypes(): string[] {
        return [
            'Italian',
            'Chinese',
            'Japanese',
            'Thai',
            'Indian',
            'Mexican',
            'French',
            'Mediterranean',
            'American',
            'Middle Eastern'
        ];
    }

    /**
     * Get city suggestions based on current location/language
     */
    getCitySuggestions(): string[] {
        return [
            'Tel Aviv',
            'Jerusalem',
            'Haifa',
            'Rishon LeZion',
            'Petah Tikva',
            'Ashdod',
            'Netanya',
            'Beer Sheva',
            'Holon',
            'Bnei Brak'
        ];
    }
}