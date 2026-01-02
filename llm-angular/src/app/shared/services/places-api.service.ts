import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ENDPOINTS } from '../api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../http/api-error.mapper';

export type Language = 'he' | 'en';

export interface PlacesRequestText {
    text: string;
    language?: Language;
    userLocation?: { lat: number; lng: number };
    nearMe?: boolean;
    sessionId?: string;
}

export interface PlacesResponseDto {
    query: { mode: 'textsearch' | 'nearbysearch' | 'findplace'; language?: Language };
    restaurants: Array<{
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
    }>;
    meta: { source: 'google'; mode: 'textsearch' | 'nearbysearch' | 'findplace'; nextPageToken: string | null; cached: boolean; tookMs: number; note?: string };
}

@Injectable({ providedIn: 'root' })
export class PlacesApiService {
    constructor(private readonly http: HttpClient) { }

    /**
     * Search with text query
     * Note: x-session-id is automatically added by apiSessionInterceptor
     * 
     * @returns Observable or ApiErrorView
     */
    searchWithText(request: PlacesRequestText): Observable<PlacesResponseDto> {
        return this.http.post<PlacesResponseDto>(ENDPOINTS.PLACES_SEARCH, {
            text: request.text,
            language: request.language,
            userLocation: request.userLocation,
            nearMe: request.nearMe
        }).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('PlacesApiService.searchWithText', apiError);
                return throwError(() => apiError);
            })
        );
    }

    /**
     * Search with schema
     * Note: x-session-id is automatically added by apiSessionInterceptor
     * 
     * @returns Observable or ApiErrorView
     */
    searchWithSchema(schema: unknown, sessionId?: string): Observable<PlacesResponseDto> {
        return this.http.post<PlacesResponseDto>(ENDPOINTS.PLACES_SEARCH, { schema }).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('PlacesApiService.searchWithSchema', apiError);
                return throwError(() => apiError);
            })
        );
    }
}
