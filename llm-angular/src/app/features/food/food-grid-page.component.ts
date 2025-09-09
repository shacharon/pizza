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
  templateUrl: './food-grid-page.component.html',
  styleUrls: ['./food-grid-page.component.scss'],
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
