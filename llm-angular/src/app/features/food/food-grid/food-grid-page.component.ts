import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FoodGridResultsComponent } from '../food-grid-results/food-grid-results.component';
import { FoodService, type FoodSearchResponse } from '../food.service';

@Component({
    selector: 'app-food-grid-page',
    standalone: true,
    imports: [CommonModule, FormsModule, FoodGridResultsComponent],
    templateUrl: './food-grid-page.component.html',
    styleUrls: ['./food-grid-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodGridPageComponent {

    private foodService = inject(FoodService);

    searchQuery = signal<string>('');
    isLoading = signal<boolean>(false);
    restaurants = signal<any[]>([]);
    errorMessage = signal<string>('');
    clarificationMessage = signal<string>('');
    userLocation = signal<{ lat: number; lng: number } | null>(null);
    locationError = signal<string>('');
    showDistances = signal<boolean>(false);
    llmSuggestion: string | null = null;
    locationStatus = computed(() => this.userLocation() ? 'Using your location (±10km)' : 'No location — using city fallback');

    private searchTimeout: any;
    private loadingTimeout: any;
    // Prevent stale responses from overwriting newer results
    private requestSeq = 0;
    private activeRequestId = 0;

    constructor() {
        // Restore saved location if previously granted (but do NOT auto-search)
        try {
            const saved = localStorage.getItem('userLocation');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
                    this.userLocation.set(parsed);
                }
            }
        } catch { }
        // Show a friendly placeholder instead of auto-calling
        this.clarificationMessage.set('Start by typing a food or place (e.g., "pizza" or "Haifa").');
    }

    async onSearch(event: Event) {
        const input = event.target as HTMLInputElement;
        const query = input.value.trim();

        // Update search query immediately (for UI binding)
        this.searchQuery.set(query);

        // Clear previous timeouts
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
        }

        // Clear previous error messages
        this.errorMessage.set('');
        this.clarificationMessage.set('');

        if (!query) {
            // Clear results immediately when search is empty
            // Invalidate any in-flight responses
            this.activeRequestId = ++this.requestSeq;
            this.restaurants.set([]);
            this.isLoading.set(false);
            this.llmSuggestion = null;
            this.clarificationMessage.set('');
            return;
        }

        // Only show loading after a short delay to prevent flickering
        this.loadingTimeout = setTimeout(() => {
            this.isLoading.set(true);
        }, 200);

        // Debounce the actual search
        this.searchTimeout = setTimeout(async () => {
            if (this.loadingTimeout) {
                clearTimeout(this.loadingTimeout); // Cancel loading timeout if search executes
            }
            this.isLoading.set(true); // Ensure loading is shown during search
            await this.performLLMSearch(query);
        }, 800);
    }

    async onSearchClick() {
        // Trigger immediate search on button click
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        const query = this.searchQuery().trim();
        if (query) {
            this.isLoading.set(true);
            await this.performLLMSearch(query);
        }
    }

    private async performLLMSearch(query: string) {
        try {
            this.searchQuery.set(query);
            // Mark this request as the latest
            const requestId = ++this.requestSeq;
            this.activeRequestId = requestId;

            // When text includes a city/address, don't force-send userLocation;
            // allow backend to use the city anchor to avoid mixing near-me and city.
            const lower = (query || '').toLowerCase();
            const hasCityLike = /\b(tel\s*aviv|jerusalem|haifa|ashkelon|ashdod|beer\s*sheva|\d+\s+|street|st\.|road|rd\.|ave)\b/i.test(lower);
            const locToSend = hasCityLike ? undefined : (this.userLocation() || undefined);
            const response = await this.foodService.search(query, undefined, locToSend).toPromise();
            console.log('Search sent with userLocation:', locToSend);

            this.isLoading.set(false);

            // Ignore stale responses
            if (requestId !== this.activeRequestId) {
                return;
            }

            if (!response) {
                this.errorMessage.set('No response from server');
                return;
            }

            // Debug: Log the raw API response
            console.log('=== RAW API RESPONSE ===');
            console.log('Full response:', response);
            console.log('Restaurants array:', response.restaurants);
            console.log('First restaurant:', response.restaurants?.[0]);
            console.log('Meta info:', response.meta);
            console.log('========================');

            // FoodSearchResponse always has restaurants array
            this.restaurants.set(response.restaurants || []);
            this.clarificationMessage.set('');

            // Optional LLM follow-up suggestion
            this.llmSuggestion = (response as any).message || null;

            if (response.restaurants.length === 0) {
                // Avoid duplicate empty-state banners; rely on results grid empty-state and optional LLM suggestion
                this.clarificationMessage.set('');
            }

        } catch (error) {
            this.isLoading.set(false);
            // Ignore stale errors
            // (if a newer request started, don't show older error)
            // Note: activeRequestId already advanced when newer request began
            this.errorMessage.set('Search failed. Please try again.');
            console.error('LLM search error:', error);
        }
    }

    private requestUserLocation() {
        if (!navigator.geolocation) {
            this.locationError.set('Geolocation not supported by browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
                this.userLocation.set(loc);
                try { localStorage.setItem('userLocation', JSON.stringify(loc)); } catch { }
                this.locationError.set('');
                console.log('User location obtained:', this.userLocation());
            },
            (error) => {
                let errorMsg = 'Location access denied';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = 'Location access denied by user';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = 'Location information unavailable';
                        break;
                    case error.TIMEOUT:
                        errorMsg = 'Location request timed out';
                        break;
                }
                this.locationError.set(errorMsg);
                console.log('Location error:', errorMsg);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // Cache for 5 minutes
            }
        );
    }

    onDistanceToggle(event: Event) {
        const checkbox = event.target as HTMLInputElement;
        this.showDistances.set(checkbox.checked);

        // Request location if user enables distances and we don't have it yet
        if (checkbox.checked && !this.userLocation()) {
            this.requestUserLocation();
        }
    }

    async onUseMyLocation() {
        try {
            this.isLoading.set(true);
            await new Promise<void>((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        this.userLocation.set(loc);
                        try { localStorage.setItem('userLocation', JSON.stringify(loc)); } catch { }
                        resolve();
                    },
                    (err) => reject(err),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
                );
            });
            // Immediately re-run search with location if there is a query
            const q = this.searchQuery().trim();
            if (q) { await this.performLLMSearch(q); }
        } catch (e) {
            console.warn('Location error:', e);
            this.errorMessage.set('Unable to access your location. You can type a city instead.');
        } finally {
            this.isLoading.set(false);
        }
    }

    async retryLocation() {
        try {
            // If permission is blocked, inform how to enable
            const permissions: any = (navigator as any).permissions;
            if (permissions && permissions.query) {
                const status = await permissions.query({ name: 'geolocation' as any });
                if (status.state === 'denied') {
                    this.errorMessage.set('Location is blocked. Click the site lock icon → Site settings → Allow Location, then try again.');
                    return;
                }
            }
        } catch { /* ignore */ }
        // Re-request
        await this.onUseMyLocation();
    }
}
