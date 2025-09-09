import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
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

@Component({
  selector: 'app-food-grid-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './food-grid-results.component.html',
  styleUrls: ['./food-grid-results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FoodGridResultsComponent {
  @Input() restaurants: Restaurant[] = [];
  @Input() hasMoreResults = false;

  @Output() restaurantSelected = new EventEmitter<Restaurant>();
  @Output() favoriteToggled = new EventEmitter<Restaurant>();
  @Output() loadMoreRequested = new EventEmitter<void>();

  private favorites = new Set<string>();

  trackByPlaceId(index: number, restaurant: Restaurant): string {
    return restaurant.placeId || restaurant.name + index;
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
    const cuisineMap: { [key: string]: string } = {
      'restaurant': 'Restaurant',
      'food': 'Food',
      'meal_takeaway': 'Takeaway',
      'meal_delivery': 'Delivery',
      'cafe': 'Cafe',
      'bar': 'Bar',
      'bakery': 'Bakery',
      'italian_restaurant': 'Italian',
      'chinese_restaurant': 'Chinese',
      'japanese_restaurant': 'Japanese',
      'pizza_restaurant': 'Pizza',
      'fast_food_restaurant': 'Fast Food'
    };

    return types
      ?.map(type => cuisineMap[type] || type)
      .filter(type => type !== 'restaurant' && type !== 'food')
      .slice(0, 2) || [];
  }

  selectRestaurant(restaurant: Restaurant): void {
    this.restaurantSelected.emit(restaurant);
  }

  toggleFavorite(restaurant: Restaurant, event: Event): void {
    event.stopPropagation();
    const key = restaurant.placeId || restaurant.name;

    if (this.favorites.has(key)) {
      this.favorites.delete(key);
    } else {
      this.favorites.add(key);
    }

    this.favoriteToggled.emit(restaurant);
  }

  getDirections(restaurant: Restaurant, event: Event): void {
    event.stopPropagation();
    const address = restaurant.address || restaurant.vicinity || restaurant.name;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  }

  callRestaurant(restaurant: Restaurant, event: Event): void {
    event.stopPropagation();
    if (restaurant.phoneNumber) {
      window.location.href = `tel:${restaurant.phoneNumber}`;
    }
  }

  viewMenu(restaurant: Restaurant, event: Event): void {
    event.stopPropagation();
    // Could open menu modal or navigate to menu page
    console.log('View menu for:', restaurant.name);
  }

  loadMore(): void {
    this.loadMoreRequested.emit();
  }
}
