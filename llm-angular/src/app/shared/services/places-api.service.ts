import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export type Language = 'he' | 'en';

export interface PlacesRequestText {
    text: string;
    language?: Language;
    userLocation?: { lat: number; lng: number };
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
    }>;
    meta: { source: 'google'; mode: 'textsearch' | 'nearbysearch' | 'findplace'; nextPageToken: string | null; cached: boolean; tookMs: number };
}

@Injectable({ providedIn: 'root' })
export class PlacesApiService {
    constructor(private readonly http: HttpClient) { }

    searchWithText(request: PlacesRequestText): Observable<PlacesResponseDto> {
        const headers = request.sessionId
            ? new HttpHeaders({ 'x-session-id': request.sessionId })
            : undefined;

        return this.http.post<PlacesResponseDto>('/api/places/search', {
            text: request.text,
            language: request.language,
            userLocation: request.userLocation
        }, { headers });
    }

    searchWithSchema(schema: unknown, sessionId?: string): Observable<PlacesResponseDto> {
        const headers = sessionId
            ? new HttpHeaders({ 'x-session-id': sessionId })
            : undefined;
        return this.http.post<PlacesResponseDto>('/api/places/search', { schema }, { headers });
    }
}
