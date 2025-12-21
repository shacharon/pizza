/**
 * Search Page Component
 * Main container for unified search experience
 */

import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchFacade } from '../../../facades/search.facade';
import { SearchBarComponent } from '../components/search-bar/search-bar.component';
import { RestaurantCardComponent } from '../components/restaurant-card/restaurant-card.component';
import { GroupedResultsComponent } from '../components/grouped-results/grouped-results.component';
import type { Restaurant } from '../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../domain/types/action.types';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    CommonModule,
    SearchBarComponent,
    RestaurantCardComponent,
    GroupedResultsComponent
  ],
  providers: [SearchFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss'
})
export class SearchPageComponent implements OnInit, OnDestroy {
  readonly facade = inject(SearchFacade);
  
  private cleanupInterval?: number;

  readonly popularSearches = [
    { emoji: '🍕', label: 'Pizza', query: 'pizza' },
    { emoji: '🍣', label: 'Sushi', query: 'sushi' },
    { emoji: '🍔', label: 'Burgers', query: 'burgers' },
    { emoji: '🍝', label: 'Italian', query: 'italian restaurant' },
    { emoji: '🌮', label: 'Mexican', query: 'mexican food' },
    { emoji: '🍜', label: 'Asian', query: 'asian cuisine' }
  ];

  ngOnInit(): void {
    // Setup periodic cleanup of expired actions (every minute)
    this.cleanupInterval = window.setInterval(() => {
      this.facade.cleanupExpiredActions();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  onSearch(query: string): void {
    this.facade.search(query);
  }

  onClear(): void {
    this.facade.onClear();
  }

  // NEW: Phase B - Input change handler
  onInputChange(text: string): void {
    this.facade.onInput(text);
  }

  // NEW: Phase B - Recent search selection
  onRecentSearchClick(query: string): void {
    this.facade.onSelectRecent(query);
  }

  // NEW: Phase B - Clear recent searches
  onClearRecentSearches(): void {
    this.facade.clearRecentSearches();
  }

  onCardClick(restaurant: Restaurant): void {
    this.facade.selectRestaurant(restaurant);
  }

  onActionClick(action: {type: ActionType; level: ActionLevel}, restaurant: Restaurant): void {
    this.facade.proposeAction(action.type, action.level, restaurant);
  }

  onPopularSearchClick(query: string): void {
    this.facade.search(query);
  }

  onChipClick(chipId: string): void {
    this.facade.onChipClick(chipId);
  }

  onAssistActionClick(query: string): void {
    this.facade.onAssistActionClick(query);
  }

  onApproveAction(actionId: string): void {
    this.facade.approveAction(actionId);
  }

  onRejectAction(actionId: string): void {
    this.facade.rejectAction(actionId);
  }

  retry(): void {
    this.facade.retry();
  }

  trackByRestaurant(_index: number, restaurant: Restaurant): string {
    return restaurant.id;
  }

  trackByChip(_index: number, chip: any): string {
    return chip.id;
  }

  trackByAction(_index: number, action: any): string {
    return action.id;
  }
}


