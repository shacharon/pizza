import { Injectable, signal, computed } from '@angular/core';
import { PlacesApiService } from '../../shared/services/places-api.service';
import type {
    PlacesSearchRequest,
    PlacesSearchResponse,
    PlaceItem,
    DetectedContext,
    Language
} from './places.models';

/**
 * Facade service for Places feature
 * Handles business logic, state management, and coordinates with API service
 * Following Angular best practices: separation of concerns and SOLID principles
 */
@Injectable({ providedIn: 'root' })
export class PlacesFacade {
    // State signals
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    private readonly rawResults = signal<PlacesSearchResponse | null>(null);

    // Computed signals
    readonly results = computed(() => this.rawResults());
    readonly hasResults = computed(() => (this.rawResults()?.places.length ?? 0) > 0);
    readonly resultsCount = computed(() => this.rawResults()?.places.length ?? 0);

    // Context detection
    readonly detectedContext = signal<DetectedContext>({
        language: null,
        region: this.detectRegion()
    });

    constructor(private readonly api: PlacesApiService) {}

    /**
     * Execute a places search
     * Phase 1: Always uses English for search and results
     * TODO Phase 2: Translate query to region's native language, then translate results back
     */
    search(request: PlacesSearchRequest): void {
        if (!request.query.trim()) {
            this.error.set('Query cannot be empty');
            return;
        }

        this.loading.set(true);
        this.error.set(null);

        // Phase 1: Hardcoded English
        const languageForSearch = 'en';

        // If mode is provided (for troubleshooting), use schema-based search
        // Otherwise, use text-based search (LLM-first approach)
        const request$ = request.mode && request.mode !== 'textsearch'
            ? this.api.searchWithSchema({
                intent: 'find_food',
                provider: 'google_places',
                search: request.mode === 'findplace'
                    ? {
                        mode: 'findplace',
                        query: request.query,
                        target: { kind: 'place', place: request.query },
                        filters: { language: languageForSearch }
                    }
                    : {
                        mode: 'nearbysearch',
                        target: request.userLocation
                            ? { kind: 'coords', coords: request.userLocation }
                            : { kind: 'me' },
                        filters: {
                            keyword: request.query,
                            language: languageForSearch,
                            radius: 1500
                        }
                    },
                output: {
                    fields: ['place_id', 'name', 'formatted_address', 'geometry'],
                    page_size: 20
                }
            })
            : this.api.searchWithText({
                text: request.query,
                language: languageForSearch,
                userLocation: request.userLocation,
                nearMe: request.nearMe
            });

        request$.subscribe({
            next: (res) => {
                // Map API response to domain model
                const mapped: PlacesSearchResponse = {
                    query: res.query,
                    places: res.restaurants, // Backend calls them "restaurants", we call them "places"
                    meta: res.meta
                };
                this.rawResults.set(mapped);
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err?.message || 'Request failed');
                this.loading.set(false);
                this.rawResults.set(null);
            }
        });
    }

    /**
     * Update detected language from user input
     */
    updateDetectedLanguage(text: string): void {
        const language = text.trim() ? this.detectLanguage(text) : null;
        this.detectedContext.update(ctx => ({ ...ctx, language }));
    }

    /**
     * Clear all results and errors
     */
    clear(): void {
        this.rawResults.set(null);
        this.error.set(null);
    }

    /**
     * Detect language from input text using Hebrew Unicode range
     * Private helper method
     */
    private detectLanguage(text: string): Language {
        const hasHebrew = /[\u0590-\u05FF]/.test(text);
        return hasHebrew ? 'he' : 'en';
    }

    /**
     * Detect user's region from browser timezone
     * More reliable than navigator.language which often defaults to en-US
     * Falls back to 'IL' for Israeli users
     */
    private detectRegion(): string {
        try {
            // Try to get timezone
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Map common Israeli timezones
            if (timezone === 'Asia/Jerusalem' || timezone === 'Israel') {
                return 'IL';
            }

            // Try to extract region from timezone (e.g., "America/New_York" -> "US")
            const tzParts = timezone.split('/');
            if (tzParts.length > 0) {
                const continent = tzParts[0];
                // Map continents to common regions
                const continentMap: Record<string, string> = {
                    'America': 'US',
                    'Europe': 'EU',
                    'Asia': 'IL', // Default Asia to IL for now
                    'Africa': 'ZA',
                    'Australia': 'AU'
                };
                return continentMap[continent] || 'IL';
            }

            // Fallback: try navigator.language
            const locale = navigator.language || 'en-IL';
            const parts = locale.split('-');
            return parts.length > 1 ? parts[1].toUpperCase() : 'IL';
        } catch {
            // Ultimate fallback
            return 'IL';
        }
    }
}

