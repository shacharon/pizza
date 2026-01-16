/**
 * Search Page Component
 * Main container for unified search experience
 */

import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchFacade } from '../../../facades/search.facade';
import { SearchBarComponent } from '../components/search-bar/search-bar.component';
import { RestaurantCardComponent } from '../components/restaurant-card/restaurant-card.component';
import { AssistantBottomSheetComponent } from '../components/assistant-bottom-sheet/assistant-bottom-sheet.component';
import { AssistantDesktopPanelComponent } from '../components/assistant-desktop-panel/assistant-desktop-panel.component';
import { ClarificationBlockComponent } from '../components/clarification-block/clarification-block.component';
import { DisclosureBannerComponent } from '../components/disclosure-banner/disclosure-banner.component';
import { AssistantSummaryComponent } from '../components/assistant-summary/assistant-summary.component';
import { WsStatusBannerComponent } from '../../../shared/components/ws-status-banner/ws-status-banner.component';
import type { Restaurant, ClarificationChoice } from '../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../domain/types/action.types';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    CommonModule,
    SearchBarComponent,
    RestaurantCardComponent,
    AssistantBottomSheetComponent,
    AssistantDesktopPanelComponent,
    ClarificationBlockComponent,
    DisclosureBannerComponent,
    AssistantSummaryComponent,
    WsStatusBannerComponent
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
    // Phase 6: Show async assistant if in async mode
    if (this.facade.isAsyncMode()) {
      const status = this.facade.assistantState();
      return status !== 'idle';
    }
    
    // Legacy sync mode assistant logic
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
  
  // Phase 6: Async assistant display
  readonly asyncAssistantMessage = computed(() => {
    const text = this.facade.assistantNarration();
    // Truncate long messages (max 500 chars)
    return text.length > 500 ? text.substring(0, 500) + '…' : text;
  });
  
  readonly hasAsyncRecommendations = computed(() => {
    return this.facade.recommendations().length > 0;
  });

  // NEW: Mobile-first UX - Bottom sheet and flattened results
  readonly bottomSheetVisible = signal(false);
  
  // Pagination: Display limit
  private displayLimit = signal(10);
  
  readonly flatResults = computed(() => {
    const groups = this.response()?.groups;
    if (!groups) return [];
    // Flatten groups, preserving backend order
    const allResults = groups.flatMap(g => g.results);
    // Apply display limit
    return allResults.slice(0, this.displayLimit());
  });
  
  readonly hasMoreResults = computed(() => {
    const groups = this.response()?.groups;
    if (!groups) return false;
    const totalResults = groups.flatMap(g => g.results).length;
    return totalResults > this.displayLimit();
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
  
  // Phase 6: Recommendation click handler
  onRecommendationClick(actionId: string): void {
    console.log('[SearchPage] Recommendation clicked:', actionId);
    // Future: Send action_clicked to WebSocket
  }

  onSearch(query: string): void {
    this.facade.search(query);
    // Reset display limit on new search
    this.displayLimit.set(10);
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
    // Reset display limit when filtering/sorting (new search pool)
    this.displayLimit.set(10);
  }

  closeBottomSheet(): void {
    this.bottomSheetVisible.set(false);
  }

  loadMore(): void {
    // Increase display limit by 10
    this.displayLimit.update(limit => limit + 10);
    console.log('[SearchPage] Load more clicked, new limit:', this.displayLimit());
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


