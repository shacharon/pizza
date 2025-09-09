import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';

import { FoodService } from './food.service';
import { Restaurant } from './food-results-strip.component';
import { FoodGridResultsComponent } from './food-grid-results.component';

@Component({
  selector: 'app-food-grid-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FoodGridResultsComponent
  ],
  template: `
    <div class="food-grid-page">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <button class="icon-btn back-btn" (click)="goBack()" aria-label="Back">←</button>
          <h1 class="page-title">🍕 Restaurant Grid</h1>
          <div class="header-actions">
            <button class="icon-btn" (click)="toggleViewMode()" aria-label="Toggle view">{{ viewMode === 'grid' ? '☰' : '▦' }}</button>
            <button class="icon-btn" (click)="navigateToSwipe()" aria-label="Swipe view">👆</button>
            <button class="icon-btn" (click)="navigateToMap()" aria-label="Map view">🗺️</button>
          </div>
        </div>
      </div>

      <!-- Search Section -->
      <div class="search-section">
        <div class="search-container">
          <div class="search-field">
            <span class="search-prefix">🔎</span>
            <input
              [(ngModel)]="searchQuery"
              (input)="onSearchInput($event)"
              placeholder="Search for restaurants, cuisine, or location..."
              autocomplete="off">
            <button *ngIf="searchQuery" class="icon-btn" (click)="clearSearch()" aria-label="Clear">✖</button>
          </div>

          <button class="btn primary search-btn px-4 py-2 rounded-lg shadow-sm"
                  (click)="performSearch()"
                  [disabled]="!searchQuery.trim() || isSearching">
            <span *ngIf="!isSearching">Search</span>
            <span *ngIf="isSearching" class="spinner small" aria-label="loading"></span>
          </button>
        </div>

        <!-- Quick Filters -->
        <div class="quick-filters" *ngIf="restaurants.length > 0">
          <div class="chip-set flex flex-wrap gap-2 justify-center">
            <button class="chip px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-sm"
                    [class.selected]="activeFilter === 'all'" (click)="setFilter('all')">All ({{ restaurants.length }})</button>
            <button class="chip px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-sm"
                    [class.selected]="activeFilter === 'open'" (click)="setFilter('open')">Open Now</button>
            <button class="chip px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-sm"
                    [class.selected]="activeFilter === 'rating'" (click)="setFilter('rating')">Top Rated</button>
            <button class="chip px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-sm"
                    [class.selected]="activeFilter === 'price'" (click)="setFilter('price')">Budget Friendly</button>
            <button class="chip px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-sm"
                    [class.selected]="activeFilter === 'delivery'" (click)="setFilter('delivery')">Delivery</button>
          </div>
        </div>

        <!-- Search Suggestions -->
        <div class="suggestions" *ngIf="showSuggestions && suggestions.length > 0">
          <div class="suggestion-item" *ngFor="let suggestion of suggestions"
               (click)="selectSuggestion(suggestion)">
            <span class="suggestion-icon">🍽️</span>
            <span>{{ suggestion.text }}</span>
          </div>
        </div>
      </div>

      <!-- Results Section -->
      <div class="results-section" *ngIf="!isSearching">
        <div class="results-header" *ngIf="restaurants.length > 0">
          <h2 class="results-title">
            {{ getResultsTitle() }}
          </h2>
          <div class="results-meta">
            <span class="results-count">{{ filteredRestaurants.length }} restaurants</span>
            <span class="results-location" *ngIf="lastSearchLocation">
              in {{ lastSearchLocation }}
            </span>
          </div>
        </div>

        <!-- Loading State -->
        <div class="loading-state" *ngIf="isSearching">
          <div class="spinner"></div>
          <p>Finding the best restaurants...</p>
        </div>

        <!-- Empty State -->
        <div class="empty-state" *ngIf="!isSearching && restaurants.length === 0 && hasSearched">
          <div class="empty-icon">🍽️</div>
          <h3>No restaurants found</h3>
          <p>Try adjusting your search terms or location</p>
          <button class="btn primary" (click)="showSuggestions = true">
            Get Suggestions
          </button>
        </div>

        <!-- Results Grid -->
        <app-food-grid-results
          *ngIf="filteredRestaurants.length > 0"
          [restaurants]="filteredRestaurants"
          [hasMoreResults]="hasMoreResults"
          (restaurantSelected)="onRestaurantSelected($event)"
          (loadMoreRequested)="loadMore()">
        </app-food-grid-results>
      </div>

      <!-- Floating Action Button for Quick Search -->
      <button class="fab-search fab" (click)="toggleQuickSearch()" aria-label="Quick Search">{{ showQuickSearch ? '✖' : '🔎' }}</button>

      <!-- Quick Search Overlay -->
      <div class="quick-search-overlay" *ngIf="showQuickSearch">
        <div class="quick-search-content">
          <h3>Quick Search</h3>
          <div class="quick-options">
            <button class="btn quick-btn" (click)="quickSearch('pizza')">
              🍕 Pizza
            </button>
            <button class="btn quick-btn" (click)="quickSearch('sushi')">
              🍣 Sushi
            </button>
            <button class="btn quick-btn" (click)="quickSearch('burger')">
              🍔 Burgers
            </button>
            <button class="btn quick-btn" (click)="quickSearch('italian')">
              🍝 Italian
            </button>
            <button class="btn quick-btn" (click)="quickSearch('chinese')">
              🥡 Chinese
            </button>
            <button class="btn quick-btn" (click)="quickSearch('coffee')">
              ☕ Coffee
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .food-grid-page {
      min-height: 100vh;
      background: #f8f9fa;
      display: flex;
      flex-direction: column;
    }

    .page-header {
      background: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-btn {
      color: #666;
    }

    .page-title {
      flex: 1;
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: #1a1a1a;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .search-section {
      background: white;
      padding: 24px 20px;
      border-bottom: 1px solid #e0e0e0;
    }

    .search-container {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .search-field {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      padding: 8px 12px;
      background: #fff;
    }

    .search-field input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 14px;
      background: transparent;
    }

    .search-prefix { opacity: 0.7; }

    .search-btn {
      min-width: 120px;
      font-weight: 600;
      text-transform: none;
    }

    .quick-filters {
      max-width: 800px;
      margin: 20px auto 0;
      text-align: center;
    }

    .suggestions {
      max-width: 800px;
      margin: 16px auto 0;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .suggestion-item {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;

      &:hover {
        background: #f8f9fa;
      }

      &:last-child {
        border-bottom: none;
      }

      .suggestion-icon { font-size: 18px; }

      span {
        font-weight: 500;
        color: #333;
      }
    }

    .results-section {
      flex: 1;
      padding: 24px 20px;
    }

    .results-header {
      max-width: 1200px;
      margin: 0 auto 24px;
      text-align: center;
    }

    .results-title {
      margin: 0 0 8px 0;
      font-size: 2rem;
      font-weight: 700;
      color: #1a1a1a;
    }

    .results-meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 1rem;
      color: #666;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #eee;
      border-top-color: #ff6b35;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }

    .spinner.small { width: 18px; height: 18px; border-width: 3px; margin: 0; }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-state p {
      color: #666;
      font-size: 1.1rem;
      margin: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;

      .empty-icon {
        width: 80px;
        height: 80px;
        background: #f0f0f0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 24px;

        mat-icon {
          font-size: 40px;
          color: #ccc;
        }
      }

      h3 {
        margin: 0 0 8px 0;
        color: #333;
        font-size: 1.5rem;
      }

      p {
        color: #666;
        margin: 0 0 24px 0;
        font-size: 1rem;
      }
    }

    .fab-search {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1000;
    }

    .fab {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #ff6b35;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      box-shadow: 0 6px 18px rgba(0,0,0,0.2);
      font-size: 20px;
      cursor: pointer;
    }

    .quick-search-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
      backdrop-filter: blur(4px);
    }

    .quick-search-content {
      background: white;
      padding: 32px;
      border-radius: 16px;
      max-width: 500px;
      width: 90%;
      text-align: center;

      h3 {
        margin: 0 0 24px 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: #1a1a1a;
      }
    }

    .quick-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
    }

    .quick-btn {
      height: 48px;
      font-weight: 600;
      text-transform: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .header-content {
        padding: 12px 16px;
      }

      .page-title {
        font-size: 1.25rem;
      }

      .header-actions {
        gap: 4px;
      }

      .search-container {
        flex-direction: column;
        gap: 12px;
      }

      .search-field {
        width: 100%;
      }

      .search-btn {
        width: 100%;
        min-width: auto;
      }

      .quick-filters {
        margin-top: 16px;
      }

      .results-title {
        font-size: 1.5rem;
      }

      .quick-options {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FoodGridPageComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  // State
  restaurants: Restaurant[] = [];
  filteredRestaurants: Restaurant[] = [];
  isSearching = false;
  hasSearched = false;
  hasMoreResults = false;
  searchQuery = '';
  activeFilter = 'all';
  viewMode: 'grid' | 'list' = 'grid';
  showSuggestions = false;
  showQuickSearch = false;
  lastSearchLocation = '';

  // Search suggestions
  suggestions = [
    { text: 'Pizza near me', icon: 'local_pizza' },
    { text: 'Italian restaurants', icon: 'restaurant' },
    { text: 'Coffee shops', icon: 'local_cafe' },
    { text: 'Fast food', icon: 'fastfood' },
    { text: 'Vegetarian options', icon: 'grass' },
    { text: 'Delivery available', icon: 'delivery_dining' }
  ];

  constructor(
    private foodService: FoodService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    // Debounce search input
    this.searchSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(query => {
        if (query.trim()) {
          this.performSearch();
        }
      });
  }

  ngOnInit(): void {
    // Check for initial query parameter
    this.route.queryParams.subscribe(params => {
      if (params['q']) {
        this.searchQuery = params['q'];
        this.performSearch();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Search Methods
  onSearchInput(event: any): void {
    this.searchQuery = event.target.value;
    this.showSuggestions = true;
    this.searchSubject.next(this.searchQuery);
  }

  performSearch(): void {
    if (!this.searchQuery?.trim()) return;

    this.isSearching = true;
    this.hasSearched = true;
    this.showSuggestions = false;
    this.cdr.markForCheck();

    this.foodService.search(this.searchQuery.trim()).subscribe({
      next: (response) => {
        this.restaurants = response.restaurants || [];
        this.filteredRestaurants = [...this.restaurants];
        this.hasMoreResults = response.meta?.nextPageToken ? true : false;
        this.lastSearchLocation = this.extractLocationFromQuery(this.searchQuery);
        this.isSearching = false;
        this.cdr.markForCheck();

        // TODO: optional toast notification replacement
      },
      error: (error) => {
        console.error('Search error:', error);
        this.isSearching = false;
        // TODO: optional toast notification replacement
        this.cdr.markForCheck();
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.showSuggestions = false;
    this.restaurants = [];
    this.filteredRestaurants = [];
    this.hasSearched = false;
  }

  selectSuggestion(suggestion: any): void {
    this.searchQuery = suggestion.text;
    this.showSuggestions = false;
    this.performSearch();
  }

  quickSearch(query: string): void {
    this.searchQuery = query;
    this.showQuickSearch = false;
    this.performSearch();
  }

  // Filter Methods
  setFilter(filter: string): void {
    this.activeFilter = filter;

    switch (filter) {
      case 'open':
        this.filteredRestaurants = this.restaurants.filter(r => r.openingHours?.openNow);
        break;
      case 'rating':
        this.filteredRestaurants = this.restaurants.filter(r => (r.rating || 0) >= 4.0);
        break;
      case 'price':
        this.filteredRestaurants = this.restaurants.filter(r => (r.priceLevel || 0) <= 2);
        break;
      case 'delivery':
        this.filteredRestaurants = this.restaurants.filter(r => r.delivery);
        break;
      default:
        this.filteredRestaurants = [...this.restaurants];
    }

    this.cdr.markForCheck();
  }

  // Navigation Methods
  goBack(): void {
    this.router.navigate(['/food']);
  }

  navigateToSwipe(): void {
    this.router.navigate(['/food/swipe'], {
      queryParams: this.searchQuery ? { q: this.searchQuery } : {}
    });
  }

  navigateToMap(): void {
    this.router.navigate(['/food/map'], {
      queryParams: this.searchQuery ? { q: this.searchQuery } : {}
    });
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    // Note: This would affect the child component's display mode
  }

  toggleQuickSearch(): void {
    this.showQuickSearch = !this.showQuickSearch;
  }

  // Event Handlers
  onRestaurantSelected(restaurant: Restaurant): void {
    // Handle restaurant selection (could navigate to detail page or open modal)
    console.log('Selected:', restaurant.name);
  }

  loadMore(): void {
    if (!this.hasMoreResults) return;

    this.isSearching = true;
    this.cdr.markForCheck();

    this.foodService.loadMore('nextPageToken').subscribe({
      next: (response) => {
        const newRestaurants = response.restaurants || [];
        this.restaurants = [...this.restaurants, ...newRestaurants];
        this.setFilter(this.activeFilter); // Re-apply current filter
        this.hasMoreResults = response.meta?.nextPageToken ? true : false;
        this.isSearching = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Load more error:', error);
        this.isSearching = false;
        // TODO: optional toast notification replacement
        this.cdr.markForCheck();
      }
    });
  }

  // Utility Methods
  getResultsTitle(): string {
    if (this.filteredRestaurants.length === 0) return '';

    const count = this.filteredRestaurants.length;
    const cuisine = this.extractCuisineFromQuery(this.searchQuery);

    if (cuisine) {
      return `${cuisine} Restaurants`;
    }

    if (count === 1) {
      return '1 Restaurant Found';
    }

    return `${count} Restaurants Found`;
  }

  private extractLocationFromQuery(query: string): string {
    // Simple extraction - could be enhanced with NLP
    const locationKeywords = ['in', 'near', 'at', 'ב', 'ליד'];
    const words = query.split(' ');

    for (let i = 0; i < words.length; i++) {
      if (locationKeywords.includes(words[i].toLowerCase())) {
        return words.slice(i + 1).join(' ');
      }
    }

    return '';
  }

  private extractCuisineFromQuery(query: string): string {
    // Simple cuisine extraction
    const cuisines = ['pizza', 'italian', 'chinese', 'japanese', 'sushi', 'burger', 'coffee', 'cafe'];
    const lowerQuery = query.toLowerCase();

    for (const cuisine of cuisines) {
      if (lowerQuery.includes(cuisine)) {
        return cuisine.charAt(0).toUpperCase() + cuisine.slice(1);
      }
    }

    return '';
  }
}
