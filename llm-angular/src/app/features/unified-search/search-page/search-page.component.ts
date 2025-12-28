/**
 * Search Page Component
 * Main container for unified search experience
 */

import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchFacade } from '../../../facades/search.facade';
import { SearchBarComponent } from '../components/search-bar/search-bar.component';
import { RestaurantCardComponent } from '../components/restaurant-card/restaurant-card.component';
import { RankedResultsComponent } from '../components/ranked-results/ranked-results.component';
import { AssistantBottomSheetComponent } from '../components/assistant-bottom-sheet/assistant-bottom-sheet.component';
import { AssistantDesktopPanelComponent } from '../components/assistant-desktop-panel/assistant-desktop-panel.component';
import { ClarificationBlockComponent } from '../components/clarification-block/clarification-block.component';
import { DisclosureBannerComponent } from '../components/disclosure-banner/disclosure-banner.component';
import type { Restaurant, ClarificationChoice } from '../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../domain/types/action.types';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    CommonModule,
    SearchBarComponent,
    RestaurantCardComponent,
    RankedResultsComponent,
    AssistantBottomSheetComponent,
    AssistantDesktopPanelComponent,
    ClarificationBlockComponent,
    DisclosureBannerComponent
  ],
  providers: [SearchFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss'
})
export class SearchPageComponent implements OnInit, OnDestroy {
  readonly facade = inject(SearchFacade);
  
  private cleanupInterval?: number;

  // Phase 5: Mode indicators
  readonly response = this.facade.response;
  readonly currentMode = computed(() => {
    const assist = this.response()?.assist;
    return assist?.mode || 'NORMAL';
  });
  readonly isRecoveryMode = computed(() => this.currentMode() === 'RECOVERY');
  readonly isClarifyMode = computed(() => this.currentMode() === 'CLARIFY');

  // Phase 7: Conditional assistant (UI/UX Contract - only show when needed)
  readonly showAssistant = computed(() => {
    const response = this.response();
    if (!response) return false;
    
    // Show assistant ONLY when:
    // 1. No results found (RECOVERY mode)
    if (!response.results || response.results.length === 0) {
      return true;
    }
    
    // 2. Low confidence < 60% (RECOVERY mode)
    const confidence = response.meta?.confidence || 1;
    if (confidence < 0.6) {
      return true;
    }
    
    // 3. Ambiguous query (CLARIFY mode)
    if (response.assist?.mode === 'CLARIFY') {
      return true;
    }
    
    // 4. Explicit RECOVERY mode
    if (response.assist?.mode === 'RECOVERY') {
      return true;
    }
    
    // Otherwise hide assistant (NORMAL mode = no assistant, chips only)
    return false;
  });

  // NEW: Mobile-first UX - Bottom sheet and flattened results
  readonly bottomSheetVisible = signal(false);
  
  readonly flatResults = computed(() => {
    const groups = this.response()?.groups;
    if (!groups) return [];
    // Flatten groups, preserving backend order
    return groups.flatMap(g => g.results);
  });

  readonly highlightedResults = computed(() => {
    const results = this.flatResults();
    if (results.length === 0) return [];
    
    // Pick 3: closest, highest rated, open now
    const closest = results[0]; // Already sorted by rank
    const topRated = results.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    const openNow = results.find(r => r.openNow === true);
    
    // De-duplicate and return max 3
    const unique = new Map<string, Restaurant>();
    [closest, topRated, openNow].filter(Boolean).forEach(r => {
      if (r) unique.set(r.id, r);
    });
    return Array.from(unique.values()).slice(0, 3);
  });

  // Phase 8: Disclosure banner for derived filters
  readonly showClosedDisclosure = computed(() => {
    const meta = this.facade.meta();
    if (!meta) return false;
    
    // Show disclosure when:
    // 1. Capabilities indicate derived filter is used
    // 2. openNowSummary exists with closed restaurants
    return meta.capabilities?.closedNowIsDerived === true &&
           meta.openNowSummary &&
           meta.openNowSummary.closed > 0;
  });

  readonly closedFilterActive = computed((): 'open' | 'closed' | null => {
    const response = this.response();
    if (!response) return null;
    
    // Check if openNow filter is applied
    const appliedFilters = response.meta?.appliedFilters || [];
    
    // If "open_now" is in applied filters, it's an open filter
    if (appliedFilters.includes('open_now')) {
      return 'open';
    }
    
    // If "closed_now" is in applied filters OR capabilities indicate derived filter
    if (appliedFilters.includes('closed_now') || 
        (response.meta?.capabilities?.closedNowIsDerived && response.meta?.openNowSummary?.closed)) {
      return 'closed';
    }
    
    return null;
  });

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
    // Trigger actual filtering/sorting via facade (single source of truth)
    this.facade.onChipClick(chipId);
  }

  closeBottomSheet(): void {
    this.bottomSheetVisible.set(false);
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
  
  // NEW: Handle clarification choice
  onClarificationChoice(choice: ClarificationChoice): void {
    this.facade.onClarificationChoice(choice);
  }

  trackByRestaurant(_index: number, restaurant: Restaurant): string {
    return restaurant.id;
  }

  trackByChip(_index: number, chip: any): string {
    return chip.id;
  }

  /**
   * Check if a chip is currently active (Phase 7: UI/UX Contract)
   * - SORT: Single-select - check if this chip's sort key matches current sort
   * - FILTER: Multi-select - check if chip ID is in active filters set
   * - VIEW: Single-select - check if view matches current view
   */
  isChipActive(chip: any): boolean {
    if (chip.action === 'sort') {
      return this.facade.currentSort() === this.mapChipToSortKey(chip.id);
    } else if (chip.action === 'filter') {
      return this.facade.activeFilters().includes(chip.id);
    } else if (chip.action === 'map') {
      return this.facade.currentView() === 'MAP';
    }
    return false;
  }

  /**
   * Map chip ID to sort key (matches facade logic)
   */
  private mapChipToSortKey(chipId: string): 'BEST_MATCH' | 'CLOSEST' | 'RATING_DESC' | 'PRICE_ASC' {
    switch (chipId) {
      case 'sort_best_match':
      case 'best_match':
        return 'BEST_MATCH';
      case 'sort_closest':
      case 'closest':
        return 'CLOSEST';
      case 'sort_rating':
      case 'toprated':
        return 'RATING_DESC';
      case 'sort_price':
        return 'PRICE_ASC';
      default:
        return 'BEST_MATCH';
    }
  }

  trackByAction(_index: number, action: any): string {
    return action.id;
  }
}


