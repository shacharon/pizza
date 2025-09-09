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
  imports: [
    CommonModule
  ],
  template: `
    <div class="food-results-grid" *ngIf="restaurants?.length">
      <div class="grid-container">
        <div class="restaurant-card"
             *ngFor="let restaurant of restaurants; trackBy: trackByPlaceId"
             [class.featured]="isTopRated(restaurant)"
             (click)="selectRestaurant(restaurant)">

          <!-- Hero Image with Price Overlay -->
          <div class="card-image-container">
            <img *ngIf="restaurant.photoUrl"
                 [src]="restaurant.photoUrl"
                 [alt]="restaurant.name"
                 loading="lazy"
                 class="card-hero-image" />
            <div class="image-overlay">
              <div class="price-indicator" *ngIf="restaurant.priceLevel">
                <span class="price-dots">{{ getPriceDots(restaurant.priceLevel) }}</span>
                <span class="price-text">{{ getPriceText(restaurant.priceLevel) }}</span>
              </div>
              <button class="favorite-btn" (click)="toggleFavorite(restaurant, $event)">{{ isFavorite(restaurant) ? '♥' : '♡' }}</button>
            </div>
          </div>

          <!-- Card Content -->
          <div class="card-content">
            <div class="restaurant-header">
              <h3 class="restaurant-name">{{ restaurant.name }}</h3>
              <div class="rating-section">
                <div class="stars">{{ (restaurant.rating || 0) >= 1 ? '★' : '☆' }}{{ (restaurant.rating || 0) >= 2 ? '★' : '☆' }}{{ (restaurant.rating || 0) >= 3 ? '★' : '☆' }}{{ (restaurant.rating || 0) >= 4 ? '★' : '☆' }}{{ (restaurant.rating || 0) >= 5 ? '★' : '☆' }}</div>
                <span class="rating-number">{{ restaurant.rating | number:'1.1-1' }}</span>
                <span class="review-count">({{ restaurant.userRatingsTotal || 0 }})</span>
              </div>
            </div>

            <div class="restaurant-meta">
              <div class="location-info">
                <span class="location-icon">📍</span>
                <span class="address">{{ restaurant.address || restaurant.vicinity }}</span>
                <span class="distance" *ngIf="restaurant.distance">• {{ restaurant.distance }}km</span>
              </div>

              <div class="cuisine-badges" *ngIf="restaurant.types && restaurant.types.length > 0">
                <span class="cuisine-chip" *ngFor="let type of getCuisineTypes(restaurant.types)">{{ type }}</span>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="card-actions">
              <button class="action-btn directions" (click)="getDirections(restaurant, $event)">🧭 Directions</button>
              <button class="action-btn call" (click)="callRestaurant(restaurant, $event)" *ngIf="restaurant.phoneNumber">📞 Call</button>
              <button class="action-btn menu" (click)="viewMenu(restaurant, $event)">📋 Menu</button>
            </div>
          </div>

          <!-- Status Indicators -->
          <div class="status-badges">
            <span class="status-chip open" *ngIf="restaurant.openingHours?.openNow">Open</span>
            <span class="status-chip delivery" *ngIf="restaurant.delivery">Delivery</span>
            <span class="status-chip takeaway" *ngIf="restaurant.takeaway">Takeaway</span>
          </div>
        </div>
      </div>

      <!-- Load More Button -->
      <div class="load-more-container" *ngIf="hasMoreResults">
        <button class="load-more-btn" (click)="loadMoreRequested.emit()">▼ Load More Restaurants</button>
      </div>
    </div>
  `,
  styles: [`
    .food-results-grid {
      padding: 20px;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    }

    .grid-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .restaurant-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      cursor: pointer;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
      }

      &.featured {
        border: 2px solid #ff6b35;
        box-shadow: 0 6px 24px rgba(255, 107, 53, 0.2);
      }
    }

    .card-image-container {
      position: relative;
      height: 200px;
      overflow: hidden;

      .card-hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      &:hover .card-hero-image {
        transform: scale(1.05);
      }
    }

    .image-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, transparent 60%, rgba(0, 0, 0, 0.6));
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 12px;
    }

    .price-indicator {
      background: rgba(255, 255, 255, 0.9);
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .price-dots {
      font-size: 14px;
    }

    .favorite-btn {
      background: rgba(255, 107, 53, 0.9);
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(255, 107, 53, 1);
        transform: scale(1.1);
      }
    }

    .card-content {
      padding: 16px;
    }

    .restaurant-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .restaurant-name {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0;
      flex: 1;
      line-height: 1.3;
    }

    .rating-section {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }

    .stars {
      display: flex;
      gap: 2px;
    }

    .star-icon {
      font-size: 14px;
      color: #ddd;

      &.filled {
        color: #ffb400;
      }
    }

    .rating-number {
      font-size: 14px;
      font-weight: 600;
      color: #666;
    }

    .review-count {
      font-size: 12px;
      color: #999;
    }

    .restaurant-meta {
      margin-bottom: 16px;
    }

    .location-info {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 14px;
      color: #666;
    }

    .location-icon {
      font-size: 16px;
      color: #999;
    }

    .address {
      flex: 1;
      line-height: 1.4;
    }

    .distance {
      color: #ff6b35;
      font-weight: 500;
    }

    .cuisine-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .cuisine-chip {
      font-size: 11px;
      height: 24px;
      background: #f0f0f0;
      color: #666;

      &:hover {
        background: #e0e0e0;
      }
    }

    .card-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .action-btn {
      flex: 1;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: none;
      min-height: 36px;

      &.directions {
        background: #4285f4;
        color: white;
      }

      &.call {
        background: #34a853;
        color: white;
      }

      &.menu {
        background: #ea4335;
        color: white;
      }

      &:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    }

    .status-badges {
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      gap: 6px;
      flex-direction: column;
    }

    .status-chip {
      font-size: 10px;
      height: 20px;
      min-height: 20px;

      &.open {
        background: #34a853;
        color: white;
      }

      &.delivery {
        background: #ff6b35;
        color: white;
      }

      &.takeaway {
        background: #9c27b0;
        color: white;
      }
    }

    .load-more-container {
      text-align: center;
      margin-top: 32px;
    }

    .load-more-btn {
      background: linear-gradient(135deg, #ff6b35, #ff8f65);
      color: white;
      border-radius: 24px;
      padding: 12px 24px;
      font-weight: 600;
      text-transform: none;
      box-shadow: 0 4px 16px rgba(255, 107, 53, 0.3);
      transition: all 0.3s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(255, 107, 53, 0.4);
      }

      mat-icon {
        margin-right: 8px;
      }
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .grid-container {
        grid-template-columns: 1fr;
        gap: 16px;
        padding: 16px;
      }

      .restaurant-card {
        &:hover {
          transform: none;
        }
      }

      .card-actions {
        flex-direction: column;
        gap: 8px;
      }

      .action-btn {
        width: 100%;
      }

      .status-badges {
        flex-direction: row;
        top: 8px;
        left: 8px;
      }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .food-results-grid {
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      }

      .restaurant-card {
        background: #2d2d2d;
        color: white;
      }

      .restaurant-name {
        color: white;
      }

      .cuisine-chip {
        background: #404040;
        color: #ccc;
      }
    }

    /* Loading animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .restaurant-card {
      animation: fadeInUp 0.4s ease-out;
    }

    .restaurant-card:nth-child(1) { animation-delay: 0.1s; }
    .restaurant-card:nth-child(2) { animation-delay: 0.2s; }
    .restaurant-card:nth-child(3) { animation-delay: 0.3s; }
    .restaurant-card:nth-child(4) { animation-delay: 0.4s; }
    .restaurant-card:nth-child(5) { animation-delay: 0.5s; }
    .restaurant-card:nth-child(6) { animation-delay: 0.6s; }
  `],
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
