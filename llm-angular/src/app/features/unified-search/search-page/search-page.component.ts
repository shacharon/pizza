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
import { WsClientService } from '../../../core/services/ws-client.service';
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
  private readonly wsClient = inject(WsClientService);

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
    // CLARIFY FIX: Use derived isStopped flag from facade
    // isStopped = DONE_STOPPED OR blocksSearch (assistant requires input)
    // When stopped, NEVER show results - only assistant message
    if (this.facade.isStopped()) {
      return false;
    }

    // Legacy checks (kept for backward compatibility)
    // These should be redundant with isStopped check above
    if (this.facade.cardState() === 'CLARIFY') {
      return false;
    }

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

  // Pagination: Display limit (start with 10, increment by 5, max 20)
  private displayLimit = signal(10);
  private hasTriggeredRefinementSuggestion = signal(false);

  // CLIENT-SIDE FILTERING: Full results array (preserving backend order)
  readonly fullResults = computed(() => {
    const groups = this.response()?.groups;
    if (!groups) {
      // Fallback: Use flat results if no groups
      let results = this.facade.results();
      
      // Apply openNow filter if active
      const appliedFilters = this.response()?.meta?.appliedFilters || [];
      if (appliedFilters.includes('open_now')) {
        results = results.filter(r => r.openNow === true);
      }
      
      return results;
    }
    
    // Flatten groups, preserving backend order
    let allResults = groups.flatMap(g => g.results);

    // CLIENT-SIDE FILTERING: Apply openNow filter if active
    // This ensures closed places are never shown when "Open now" is selected
    const appliedFilters = this.response()?.meta?.appliedFilters || [];
    if (appliedFilters.includes('open_now')) {
      allResults = allResults.filter(r => r.openNow === true);
    }

    return allResults;
  });

  // Pagination: Visible results (sliced from full results)
  readonly visibleResults = computed(() => {
    return this.fullResults().slice(0, this.displayLimit());
  });

  // Pagination: Total count of fetched results
  readonly fetchedCount = computed(() => {
    return this.fullResults().length;
  });

  // Pagination: Can show more results? (max 20)
  readonly canShowMore = computed(() => {
    const limit = this.displayLimit();
    const fetched = this.fetchedCount();
    return limit < fetched && limit < 20;
  });

  // LEGACY: Keep flatResults for backward compatibility (aliased to visibleResults)
  readonly flatResults = this.visibleResults;

  // LEGACY: Keep filteredResults for backward compatibility (aliased to visibleResults)
  readonly filteredResults = this.visibleResults;

  // LEGACY: Keep hasMoreResults for backward compatibility (aliased to canShowMore)
  readonly hasMoreResults = this.canShowMore;

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
    // Reset display limit on new search (show 10 initially)
    this.displayLimit.set(10);
    this.hasTriggeredRefinementSuggestion.set(false);
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
    // Handle GET_DIRECTIONS immediately (no confirmation needed, external navigation)
    if (action.type === 'GET_DIRECTIONS') {
      this.handleGetDirections(restaurant);
      return;
    }

    // Handle CALL_RESTAURANT immediately (no confirmation needed, tel: protocol)
    if (action.type === 'CALL_RESTAURANT') {
      this.handleCallRestaurant(restaurant);
      return;
    }

    // All other actions go through confirmation flow
    this.facade.proposeAction(action.type, action.level, restaurant);
  }

  /**
   * Handle GET_DIRECTIONS action
   * Opens Google Maps in new tab (desktop) or native app (mobile)
   */
  private handleGetDirections(restaurant: Restaurant): void {
    // Validate that we have location data (placeId or coordinates)
    if (!restaurant.placeId && !restaurant.location) {
      console.warn('[SearchPage] Cannot get directions - no location data', {
        restaurantName: restaurant.name,
        restaurantId: restaurant.id
      });
      return;
    }

    // Import navigation utility dynamically (code-splitting)
    import('../../../utils/navigation.util').then(({ openNavigation }) => {
      openNavigation(
        {
          placeId: restaurant.placeId,
          lat: restaurant.location?.lat,
          lng: restaurant.location?.lng
        },
        {
          name: restaurant.name
        }
      );
    }).catch((err) => {
      console.error('[SearchPage] Failed to load navigation utility', err);
    });
  }

  /**
   * Handle CALL_RESTAURANT action
   * Opens phone dialer with tel: protocol
   */
  private handleCallRestaurant(restaurant: Restaurant): void {
    if (!restaurant.phoneNumber) {
      console.warn('[SearchPage] Cannot call - phone number not available', {
        restaurantName: restaurant.name,
        placeId: restaurant.placeId
      });
      return;
    }

    // Import navigation utility dynamically
    import('../../../utils/navigation.util').then(({ openPhoneDialer }) => {
      openPhoneDialer(restaurant.phoneNumber!);
    }).catch((err) => {
      console.error('[SearchPage] Failed to load navigation utility', err);
    });
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
    // Reset display limit when filtering/sorting (new search pool, show 10 initially)
    this.displayLimit.set(10);
    this.hasTriggeredRefinementSuggestion.set(false);
  }

  closeBottomSheet(): void {
    this.bottomSheetVisible.set(false);
  }

  loadMore(): void {
    // Increase display limit by 5 (max 20)
    const currentLimit = this.displayLimit();
    const newLimit = Math.min(currentLimit + 5, 20);
    this.displayLimit.set(newLimit);
    console.log('[SearchPage] Load more clicked, visible:', newLimit);

    // After reaching 20 results (second click: 10→15→20), show refinement suggestion
    if (newLimit >= 20 && !this.hasTriggeredRefinementSuggestion()) {
      this.hasTriggeredRefinementSuggestion.set(true);
      this.triggerRefinementSuggestion();
    }
  }

  /**
   * Trigger assistant message suggesting query refinement
   * Called when user has viewed all 20 results
   * 
   * Behavior:
   * - If WS connected: Send signal to backend → backend responds with NUDGE_REFINE
   * - If WS disconnected: Use local fallback from ws-nudge-copypack-v1.json
   */
  private async triggerRefinementSuggestion(): Promise<void> {
    const requestId = this.facade.requestId();
    const sessionId = this.facade.conversationId();
    const queryLanguage = this.facade.response()?.query?.language || 'en';
    
    if (!requestId) return;

    const wsConnected = this.wsClient.connectionStatus() === 'connected';

    if (wsConnected) {
      // Send WebSocket signal to backend (v1 protocol)
      const message = {
        v: 1,
        type: 'reveal_limit_reached' as const,
        requestId,
        channel: 'assistant' as const,
        uiLanguage: queryLanguage === 'he' ? ('he' as const) : ('en' as const)
      };

      this.wsClient.send(message);

      console.log('[SearchPage] Reveal limit reached signal sent via WS', {
        requestId,
        wsConnected: true,
        uiLanguage: message.uiLanguage
      });
    } else {
      // Use local fallback (WS not connected)
      console.log('[SearchPage] WS not connected - using local NUDGE_REFINE fallback', {
        requestId,
        wsConnected: false
      });

      const fallbackMessage = await this.getLocalNudgeMessage(requestId, queryLanguage === 'he' ? 'he' : 'en');
      
      if (fallbackMessage) {
        // Inject local assistant message via public facade method
        this.facade.addAssistantMessage(
          'NUDGE_REFINE',
          fallbackMessage,
          requestId,
          null, // no question
          false // doesn't block search
        );
      }
    }
  }

  /**
   * Get local fallback NUDGE_REFINE message from copypack
   * Uses deterministic selection based on requestId hash
   */
  private async getLocalNudgeMessage(requestId: string, language: 'he' | 'en'): Promise<string | null> {
    try {
      // Fetch copypack
      const response = await fetch('/assets/copypack/ws-nudge-copypack-v1.json');
      if (!response.ok) {
        console.warn('[SearchPage] Failed to load copypack, using hardcoded fallback');
        return this.getHardcodedFallback(language);
      }

      const copypack = await response.json();
      const messages = copypack.messages[language];

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        console.warn('[SearchPage] Invalid copypack format, using hardcoded fallback');
        return this.getHardcodedFallback(language);
      }

      // Deterministic selection: last character of requestId → index
      // Algorithm: '0-3'→0, '4-7'→1, '8-b'→2, 'c-f'→3, else→0
      const lastChar = requestId.charAt(requestId.length - 1).toLowerCase();
      let index = 0;

      if (['0', '1', '2', '3'].includes(lastChar)) {
        index = 0;
      } else if (['4', '5', '6', '7'].includes(lastChar)) {
        index = 1;
      } else if (['8', '9', 'a', 'b'].includes(lastChar)) {
        index = 2;
      } else if (['c', 'd', 'e', 'f'].includes(lastChar)) {
        index = 3;
      }

      // Ensure index is within bounds
      index = index % messages.length;

      console.log('[SearchPage] Selected local NUDGE_REFINE message', {
        requestId,
        lastChar,
        index,
        totalMessages: messages.length
      });

      return messages[index];

    } catch (error) {
      console.error('[SearchPage] Error loading copypack:', error);
      return this.getHardcodedFallback(language);
    }
  }

  /**
   * Hardcoded fallback if copypack fails to load
   */
  private getHardcodedFallback(language: 'he' | 'en'): string {
    return language === 'he'
      ? 'הצגת כל התוצאות. כדי לקבל תוצאות מדויקות יותר, נסה לחדד את החיפוש - למשל, הוסף מיקום ספציפי או סוג מטבח מסוים.'
      : 'Showing all results. For more precise matches, try refining your search - for example, add a specific location or cuisine type.';
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


