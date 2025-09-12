import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
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

    private searchTimeout: any;

    constructor() {
        // Request user location on component init
        this.requestUserLocation();
    }

    async onSearch(event: Event) {
        const input = event.target as HTMLInputElement;
        const query = input.value.trim();

        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Clear previous results
        this.errorMessage.set('');
        this.clarificationMessage.set('');

        if (!query) {
            this.restaurants.set([]);
            this.searchQuery.set('');
            return;
        }

        // Show loading and debounce
        this.isLoading.set(true);
        this.searchTimeout = setTimeout(async () => {
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

            const response = await this.foodService.search(query).toPromise();

            this.isLoading.set(false);

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

            if (response.restaurants.length === 0) {
                this.clarificationMessage.set('No restaurants found. Try a different search term or location.');
            }

        } catch (error) {
            this.isLoading.set(false);
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
                this.userLocation.set({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
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
}
