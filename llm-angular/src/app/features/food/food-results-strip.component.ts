import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';


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

@Component({
    selector: 'app-food-results-strip',
    standalone: true,
    imports: [
        CommonModule,

    ],
    templateUrl: './food-results-strip.component.html',
    styleUrls: ['./food-results-strip.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FoodResultsStripComponent {
    @Input() items: Restaurant[] = [];
    @Input() summary: string | null = null;
    @Input() uxMode: 'grid' | 'swipe' | 'map' = 'grid';
    @Input() selectedRestaurant: Restaurant | null = null;

    @Output() restaurantSelected = new EventEmitter<Restaurant>();
    @Output() favoriteToggled = new EventEmitter<Restaurant>();
    @Output() loadMoreRequested = new EventEmitter<void>();

    @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

    // State management
    favorites = new Set<string>();
    viewMode: ViewMode = 'list';
    hasSwiped = false;
    hasMoreResults = true;

    // UX Concept 1: Enhanced Card Grid Methods
    trackByPlaceId(index: number, item: Restaurant): string {
        return item.placeId || item.name + index;
    }

    isTopRated(restaurant: Restaurant): boolean {
        return (restaurant.rating || 0) >= 4.5;
    }

    isFavorite(restaurant: Restaurant): boolean {
        return this.favorites.has(restaurant.placeId || restaurant.name);
    }

    getStars(rating: number | null): { filled: boolean }[] {
        const stars = [];
        const numStars = Math.floor(rating || 0);
        for (let i = 0; i < 5; i++) {
            stars.push({ filled: i < numStars });
        }
        return stars;
    }

    getPriceDots(priceLevel: number): string {
        return '₪'.repeat(priceLevel);
    }

    getPriceText(priceLevel: number): string {
        const labels = ['Budget', 'Moderate', 'Mid-range', 'Upscale', 'Fine Dining'];
        return labels[priceLevel - 1] || 'Unknown';
    }

    getCuisineTypes(types: string[]): string[] {
        // Map Google Places types to readable cuisine types
        const cuisineMap: { [key: string]: string } = {
            'restaurant': 'Restaurant',
            'food': 'Food',
            'meal_takeaway': 'Takeaway',
            'meal_delivery': 'Delivery',
            'cafe': 'Cafe',
            'bar': 'Bar',
            'bakery': 'Bakery'
        };
        return types?.map(type => cuisineMap[type] || type).slice(0, 3) || [];
    }

    // UX Concept 2: Swipe Stack Methods
    getStarsDisplay(rating: number | null): string {
        const fullStars = Math.floor(rating || 0);
        const hasHalfStar = (rating || 0) % 1 >= 0.5;
        return '★'.repeat(fullStars) + (hasHalfStar ? '☆' : '');
    }

    // UX Concept 3: Map + List Hybrid Methods
    getMarkerPosition(restaurant: Restaurant, index: number): { x: number; y: number } {
        // Mock positioning for demo - in real app, use actual lat/lng
        const positions = [
            { x: 30, y: 40 },
            { x: 60, y: 35 },
            { x: 45, y: 60 },
            { x: 70, y: 50 },
            { x: 20, y: 55 }
        ];
        return positions[index % positions.length];
    }

    setViewMode(mode: ViewMode): void {
        this.viewMode = mode;
    }

    // Shared Action Methods
    selectRestaurant(restaurant: Restaurant): void {
        this.restaurantSelected.emit(restaurant);
    }

    selectMarker(restaurant: Restaurant): void {
        this.selectRestaurant(restaurant);
    }

    toggleFavorite(restaurant: Restaurant, event?: Event): void {
        event?.stopPropagation();
        const key = restaurant.placeId || restaurant.name;
        if (this.favorites.has(key)) {
            this.favorites.delete(key);
        } else {
            this.favorites.add(key);
        }
        this.favoriteToggled.emit(restaurant);
    }

    getDirections(restaurant: Restaurant, event?: Event): void {
        event?.stopPropagation();
        // Open Google Maps directions
        const address = restaurant.address || restaurant.vicinity || restaurant.name;
        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
        window.open(url, '_blank');
    }

    callRestaurant(restaurant: Restaurant, event?: Event): void {
        event?.stopPropagation();
        if (restaurant.phoneNumber) {
            window.location.href = `tel:${restaurant.phoneNumber}`;
        }
    }

    viewMenu(restaurant: Restaurant, event?: Event): void {
        event?.stopPropagation();
        // Could open menu modal or navigate to menu page
        console.log('View menu for:', restaurant.name);
    }

    viewDetails(restaurant: Restaurant, event?: Event): void {
        event?.stopPropagation();
        this.selectRestaurant(restaurant);
    }

    loadMore(): void {
        this.loadMoreRequested.emit();
    }

    // Swipe actions
    swipeLeft(): void {
        this.hasSwiped = true;
        // Handle dislike/pass action
        console.log('Swipe left - pass');
    }

    swipeRight(): void {
        this.hasSwiped = true;
        // Handle like action
        console.log('Swipe right - like');
    }

    // Map controls
    centerMap(): void {
        // Center map on user location
        console.log('Center map');
    }

    toggleTraffic(): void {
        // Toggle traffic layer
        console.log('Toggle traffic');
    }
}
