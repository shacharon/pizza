/**
 * Search Page Component
 * Main container for unified search experience
 */

import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchFacade } from '../../../facades/search.facade';
import { SearchApiHandler } from '../../../facades/search-api.facade';
import { SearchWsHandler } from '../../../facades/search-ws.facade';
import { SearchAssistantHandler } from '../../../facades/search-assistant.facade';
import { SearchStateHandler } from '../../../facades/search-state.facade';
import { AssistantDedupService } from '../../../facades/assistant-dedup.service';
import { SearchBarComponent } from '../components/search-bar/search-bar.component';
import { RestaurantCardComponent } from '../components/restaurant-card/restaurant-card.component';
import { AssistantBottomSheetComponent } from '../components/assistant-bottom-sheet/assistant-bottom-sheet.component';
import { AssistantLineComponent } from '../components/assistant-line/assistant-line.component';
import { ClarificationBlockComponent } from '../components/clarification-block/clarification-block.component';
import { AssistantSummaryComponent } from '../components/assistant-summary/assistant-summary.component';
import { LocationService } from '../../../services/location.service';
import type { Restaurant, ClarificationChoice, Coordinates } from '../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../domain/types/action.types';
import { mapChipToSortKey } from '../../../domain/mappers/chip.mapper';
// DEV: Import dev tools for testing (auto-loaded)
import '../../../facades/assistant-dev-tools';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [
    CommonModule,
    SearchBarComponent,
    RestaurantCardComponent,
    AssistantBottomSheetComponent,
    AssistantLineComponent,
    ClarificationBlockComponent,
    AssistantSummaryComponent
  ],
  providers: [
    SearchFacade,
    SearchApiHandler,
    SearchWsHandler,
    SearchAssistantHandler,
    SearchStateHandler,
    AssistantDedupService
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss'
})
export class SearchPageComponent implements OnInit, OnDestroy {
  readonly facade = inject(SearchFacade);
  private readonly locationService = inject(LocationService);

  private cleanupInterval?: number;

  // Location state
  readonly locationState = this.locationService.state;
  readonly locationCoords = this.locationService.location;

  // Phase 5: Mode indicators
  readonly response = this.facade.response;
  readonly currentMode = computed(() => {
    const assist = this.response()?.assist;
    return assist?.mode || 'NORMAL';
  });

  /**
   * Get location tooltip text
   */
  getLocationTooltip(): string {
    const state = this.locationState();
    const coords = this.locationCoords();

    if (state === 'ON' && coords) {
      return `Location: On (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`;
    } else if (state === 'DENIED') {
      return 'Location: Denied';
    } else if (state === 'ERROR') {
      return 'Location: Error';
    } else if (state === 'REQUESTING') {
      return 'Requesting location...';
    } else {
      return 'Click to enable location';
    }
  }
  readonly isRecoveryMode = computed(() => this.currentMode() === 'RECOVERY');
  readonly isClarifyMode = computed(() => this.currentMode() === 'CLARIFY');

  // Conditional assistant (UI/UX Contract - only show when needed)
  readonly showAssistant = computed(() => {
    // Show assistant if WebSocket assistant is active
    const status = this.facade.assistantState();
    if (status !== 'idle') {
      return true;
    }

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

  // CANONICAL ROUTING: Get card messages from facade
  readonly contextualCardMessages = computed(() => {
    const activeRequestId = this.facade.requestId();
    const allCards = this.facade.assistantCardMessages();

    if (!activeRequestId) {
      return [];
    }

    // Return only card messages for current search
    return allCards.filter(msg => msg.requestId === activeRequestId);
  });

  readonly globalCardMessages = computed(() => {
    const activeRequestId = this.facade.requestId();
    const allCards = this.facade.assistantCardMessages();

    if (activeRequestId) {
      return []; // No global messages when search is active
    }

    // Return card messages without requestId (system messages)
    return allCards.filter(msg => !msg.requestId);
  });

  // LEGACY: Filter messages by current requestId (for backward compatibility)
  readonly contextualMessages = computed(() => {
    const activeRequestId = this.facade.requestId();
    const allMessages = this.facade.assistantMessages();

    if (!activeRequestId) {
      return [];
    }

    // Return only messages for current search
    return allMessages.filter(msg => msg.requestId === activeRequestId);
  });

  readonly globalMessages = computed(() => {
    const activeRequestId = this.facade.requestId();
    const allMessages = this.facade.assistantMessages();

    if (activeRequestId) {
      return []; // No global messages when search is active
    }

    // Return messages without requestId (system messages)
    return allMessages.filter(msg => !msg.requestId);
  });

  // PLACEMENT FIX: Determine if assistant is bound to a requestId (contextual) vs. global/system
  // Check BOTH the active search requestId AND the assistant message's requestId
  readonly assistantHasRequestId = computed(() => {
    const activeRequestId = this.facade.requestId();
    const assistantRequestId = this.facade.assistantMessageRequestId();

    // If EITHER has a requestId, treat as contextual (never global)
    // Rule: Assistant messages with requestId MUST NEVER render globally
    return !!activeRequestId || !!assistantRequestId;
  });

  // CANONICAL ROUTING: Mutually exclusive rendering (prevent double display)
  readonly showContextualAssistant = computed(() => {
    // Card messages: show if we have card messages for current request
    const hasCardMessages = this.contextualCardMessages().length > 0;

    // Legacy: show if requestId exists and assistant state is active
    const legacyActive = this.showAssistant() && this.assistantHasRequestId();

    return hasCardMessages || legacyActive;
  });

  readonly showGlobalAssistant = computed(() => {
    // CRITICAL: Must be mutually exclusive with contextual
    // If contextual is shown, NEVER show global (prevents duplication)
    if (this.showContextualAssistant()) {
      return false;
    }

    // Card messages: show if we have global card messages (no requestId)
    const hasGlobalCards = this.globalCardMessages().length > 0;

    // Legacy: show if NO requestId and assistant state is active
    const legacyGlobal = this.showAssistant() && !this.assistantHasRequestId();

    return hasGlobalCards || legacyGlobal;
  });

  readonly hasAsyncRecommendations = computed(() => {
    return this.facade.recommendations().length > 0;
  });

  // GATE_FAIL UX: Check if current state is GATE_FAIL with no results
  readonly isGateFail = computed(() => {
    const cards = this.contextualCardMessages();
    const hasGateFail = cards.some(msg => msg.type === 'GATE_FAIL');
    const hasResults = this.facade.hasResults();

    // GATE_FAIL is terminal: if present, hide results section
    return hasGateFail && !hasResults;
  });

  // DONE_STOPPED UX: Check if pipeline stopped (not food related)
  readonly isDoneStopped = computed(() => {
    const meta = this.facade.meta();
    return meta?.source === 'route2_gate_stop' ||
      meta?.failureReason === 'LOW_CONFIDENCE';
  });

  // GATE_FAIL + DONE_STOPPED UX: Should show results section
  readonly shouldShowResults = computed(() => {
    // Hide results if DONE_STOPPED (pipeline stopped, no results by design)
    if (this.isDoneStopped()) {
      return false;
    }

    // Hide results if GATE_FAIL with no results
    if (this.isGateFail()) {
      return false;
    }

    // Otherwise show if we have results
    return this.facade.hasResults();
  });

  // NEW: Mobile-first UX - Bottom sheet and flattened results
  readonly bottomSheetVisible = signal(false);

  // Pagination: Display limit
  private displayLimit = signal(10);

  readonly flatResults = computed(() => {
    const groups = this.response()?.groups;
    if (!groups) return [];
    // Flatten groups, preserving backend order
    let allResults = groups.flatMap(g => g.results);

    // CLIENT-SIDE FILTERING: Apply openNow filter if active
    // This ensures closed places are never shown when "Open now" is selected
    const appliedFilters = this.response()?.meta?.appliedFilters || [];
    if (appliedFilters.includes('open_now')) {
      allResults = allResults.filter(r => r.openNow === true);
    }

    // Apply display limit
    return allResults.slice(0, this.displayLimit());
  });

  // CLIENT-SIDE FILTERING: Filter results for non-grouped view
  readonly filteredResults = computed(() => {
    let results = this.facade.results();

    // Apply openNow filter if active
    const appliedFilters = this.response()?.meta?.appliedFilters || [];
    if (appliedFilters.includes('open_now')) {
      results = results.filter(r => r.openNow === true);
    }

    return results;
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

  // NEW: Gluten-free SOFT hint filter active
  readonly glutenFreeFilterActive = computed(() => {
    const response = this.response();
    if (!response) return false;

    const appliedFilters = response.meta?.appliedFilters || [];
    return appliedFilters.includes('gluten-free:soft');
  });

  // Cuisine chips removed - discovery via free-text search + assistant only

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

  onActionClick(action: { type: ActionType; level: ActionLevel }, restaurant: Restaurant): void {
    this.facade.proposeAction(action.type, action.level, restaurant);
  }

  // onPopularSearchClick removed with cuisine chips

  async onLocationToggle(): Promise<void> {
    const currentState = this.locationState();

    if (currentState === 'ON') {
      this.locationService.disableLocation();
    } else if (currentState === 'OFF' || currentState === 'DENIED' || currentState === 'ERROR') {
      await this.locationService.requestLocation();
    }
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
      return this.facade.currentSort() === mapChipToSortKey(chip.id);
    } else if (chip.action === 'filter') {
      return this.facade.activeFilters().includes(chip.id);
    } else if (chip.action === 'map') {
      return this.facade.currentView() === 'MAP';
    }
    return false;
  }

  trackByAction(_index: number, action: any): string {
    return action.id;
  }
}


