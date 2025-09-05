import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type Lang = 'mirror' | 'he' | 'en' | 'ar';

export interface FoodSearchBody {
    city?: string;
    type?: 'pizza' | 'sushi' | 'burger' | 'other';
    constraints?: { maxPrice?: number };
    language?: Lang;
}

export interface NLURequest {
    text: string;
    language: 'he' | 'en' | 'ar';
}

export interface NLUResultsResponse {
    type: 'results';
    query: {
        city: string;
        type?: 'pizza' | 'sushi' | 'burger' | 'other';
        constraints?: { maxPrice?: number };
        language: string;
    };
    restaurants: any[];
    meta: {
        source: string;
        cached: boolean;
        nextPageToken?: string | null;
        enrichedTopN: number;
        nluConfidence: number;
    };
}

export interface NLUClarifyResponse {
    type: 'clarify';
    message: string;
    missing: string[];
    language: string;
    extractedSlots: any;
}

export type NLUResponse = NLUResultsResponse | NLUClarifyResponse;

@Injectable({ providedIn: 'root' })
export class FoodService {
    private http = inject(HttpClient);

    // Direct search (legacy)
    search(body: FoodSearchBody) {
        return this.http.post<any>('/api/restaurants/search', body);
    }

    // NLU-powered parse and search
    parseAndSearch(request: NLURequest) {
        return this.http.post<NLUResponse>('/api/nlu/parse', request);
    }
}


