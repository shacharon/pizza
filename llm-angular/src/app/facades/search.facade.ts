/**
 * Search Facade
 * Component orchestration layer - simplifies component interaction with stores and services
 */

import { Injectable, inject, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UnifiedSearchService } from '../services/unified-search.service';
import { ActionService } from '../services/action.service';
import { InputStateMachine } from '../services/input-state-machine.service';
import { RecentSearchesService } from '../services/recent-searches.service';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { ActionsStore } from '../state/actions.store';
import { WsClientService } from '../core/services/ws-client.service';
import { SearchApiClient } from '../api/search.api';
import { environment } from '../../environments/environment';
import type { 
  SearchFilters, 
  Restaurant,
  SearchResponse,
  RefinementChip
} from '../domain/types/search.types';
import type { ActionType, ActionLevel } from '../domain/types/action.types';
import type { WSServerMessage, AssistantStatus, ActionDefinition } from '../core/models/ws-protocol.types';

@Injectable()
export class SearchFacade {
  private readonly searchService = inject(UnifiedSearchService);
  private readonly actionService = inject(ActionService);
  private readonly inputStateMachine = inject(InputStateMachine);
  private readonly recentSearchesService = inject(RecentSearchesService);
  private readonly searchStore = inject(SearchStore);
  private readonly sessionStore = inject(SessionStore);
  private readonly actionsStore = inject(ActionsStore);
  private readonly wsClient = inject(WsClientService);
  private readonly searchApiClient = inject(SearchApiClient);

  // Expose store state as readonly signals
  readonly loading = this.searchStore.loading;
  readonly error = this.searchStore.error;
  readonly query = this.searchStore.query;
  readonly results = this.searchStore.results;
  readonly chips = this.searchStore.chips;
  readonly meta = this.searchStore.meta;
  readonly assist = this.searchStore.assist;
  readonly proposedActions = this.searchStore.proposedActions;
  readonly hasResults = this.searchStore.hasResults;
  readonly selectedRestaurant = this.sessionStore.selectedRestaurant;
  readonly pendingActions = this.actionsStore.pending;
  readonly executedActions = this.actionsStore.executed;
  readonly conversationId = this.sessionStore.conversationId;
  readonly locale = this.sessionStore.locale;
  readonly recentSearches = this.sessionStore.preferences;
  
  // NEW: Combined response signal for convenience (Phase 5)
  readonly response = computed<SearchResponse | null>(() => {
    const results = this.results();
    const meta = this.meta();
    if (!results || !meta) return null;
    
    return {
      sessionId: this.conversationId(),
      query: {
        original: this.query() || '',
        parsed: {},
        language: this.locale()
      },
      results,
      groups: this.groups(),
      chips: this.chips(),
      assist: this.assist(),
      proposedActions: this.proposedActions(),
      clarification: this.clarification(),
      requiresClarification: this.requiresClarification(),
      meta
    };
  });

  // NEW: Phase B - Groups support
  readonly groups = this.searchStore.groups;
  readonly hasGroups = this.searchStore.hasGroups;
  readonly exactResults = this.searchStore.exactResults;
  readonly nearbyResults = this.searchStore.nearbyResults;
  readonly exactCount = this.searchStore.exactCount;
  readonly nearbyCount = this.searchStore.nearbyCount;

  // NEW: Phase B - Input state machine
  readonly inputState = this.inputStateMachine.state;
  readonly currentQuery = this.inputStateMachine.query;
  readonly showRecentSearches = this.inputStateMachine.showRecentSearches;
  readonly showClearButton = this.inputStateMachine.showClearButton;
  readonly canSubmit = this.inputStateMachine.canSubmit;

  // NEW: Phase B - Recent searches
  readonly recentSearchesList = this.recentSearchesService.searches;
  readonly hasRecentSearches = this.recentSearchesService.hasSearches;
  
  // NEW: Answer-First UX - Clarification
  readonly clarification = this.searchStore.clarification;
  readonly requiresClarification = this.searchStore.requiresClarification;

  // Phase 6: WebSocket/Async state
  private readonly currentRequestId = signal<string | undefined>(undefined);
  private readonly assistantText = signal<string>('');
  private readonly assistantStatus = signal<AssistantStatus>('idle');
  private readonly wsRecommendations = signal<ActionDefinition[]>([]);
  private readonly wsError = signal<string | undefined>(undefined);
  private readonly useAsyncMode = signal<boolean>(environment.features?.asyncSearch ?? false);
  
  // Expose WebSocket state as readonly
  readonly requestId = this.currentRequestId.asReadonly();
  readonly assistantNarration = this.assistantText.asReadonly();
  readonly assistantState = this.assistantStatus.asReadonly();
  readonly recommendations = this.wsRecommendations.asReadonly();
  readonly assistantError = this.wsError.asReadonly();
  readonly isAsyncMode = this.useAsyncMode.asReadonly();
  readonly wsConnectionStatus = this.wsClient.connectionStatus;

  // Phase 7: UI/UX Contract - State Management
  // Sort state (single-select)
  private sortState = signal<'BEST_MATCH' | 'CLOSEST' | 'RATING_DESC' | 'PRICE_ASC'>('BEST_MATCH');
  readonly currentSort = this.sortState.asReadonly();

  // Filter state (multi-select)
  private filterState = signal<Set<string>>(new Set());
  readonly activeFilters = computed(() => Array.from(this.filterState()));

  // View state (single-select)
  private viewState = signal<'LIST' | 'MAP'>('LIST');
  readonly currentView = this.viewState.asReadonly();
  
  constructor() {
    // Phase 6: Subscribe to WebSocket messages
    this.wsClient.messages$.subscribe(msg => this.handleWsMessage(msg));
    
    // Ensure WebSocket is connected
    if (this.useAsyncMode()) {
      this.wsClient.connect();
    }
  }

  // Public actions
  search(query: string, filters?: SearchFilters): void {
    const useAsync = this.useAsyncMode();
    
    if (useAsync) {
      this.searchAsync(query, filters);
    } else {
      this.searchSync(query, filters);
    }
  }
  
  /**
   * Async search (Phase 6)
   * Fast path with WebSocket assistant streaming
   */
  private async searchAsync(query: string, filters?: SearchFilters): Promise<void> {
    try {
      // Reset assistant state
      this.assistantText.set('');
      this.assistantStatus.set('pending');
      this.wsRecommendations.set([]);
      this.wsError.set(undefined);
      
      // Update input state machine
      this.recentSearchesService.add(query);
      this.inputStateMachine.submit();
      
      // Set loading
      this.searchStore.setLoading(true);
      this.searchStore.setQuery(query);
      
      // Check if this is a fresh search after intent reset
      const shouldClearContext = this.inputStateMachine.intentReset();
      
      // Call async API
      const response = await firstValueFrom(
        this.searchApiClient.searchAsync({
          query,
          filters,
          sessionId: this.conversationId(),
          clearContext: shouldClearContext,
          locale: this.locale()
        })
      );
      
      // Store requestId
      this.currentRequestId.set(response.requestId);
      
      // Convert CoreSearchResult to SearchResponse (partial)
      // This maintains compatibility with existing SearchStore
      const partialResponse: SearchResponse = {
        sessionId: response.sessionId || this.conversationId(),
        query: response.query || {
          original: query,
          parsed: {},
          language: this.locale()
        },
        results: response.results,
        groups: response.groups,
        chips: response.chips,
        meta: response.meta as any,
        // No assist or proposedActions - will come via WebSocket
      };
      
      // Update store with partial response
      this.searchStore.setResponse(partialResponse);
      this.searchStore.setLoading(false);
      
      // Update input state machine
      this.inputStateMachine.searchComplete();
      
      // Subscribe to WebSocket for assistant
      this.wsClient.subscribe(response.requestId);
      
      console.log('[SearchFacade] Async search completed', {
        requestId: response.requestId,
        resultCount: response.results.length,
        tookMs: response.meta.tookMs
      });
      
    } catch (error) {
      console.error('[SearchFacade] Async search error:', error);
      this.searchStore.setError(error as any);
      this.searchStore.setLoading(false);
      this.assistantStatus.set('failed');
      this.wsError.set('Search failed. Please try again.');
      this.inputStateMachine.searchFailed();
    }
  }
  
  /**
   * Sync search (legacy - deprecated)
   */
  private searchSync(query: string, filters?: SearchFilters): void {
    // Check if this is a fresh search after intent reset
    const shouldClearContext = this.inputStateMachine.intentReset();
    
    // NEW: Phase B - Add to recent searches and update state machine
    this.recentSearchesService.add(query);
    this.inputStateMachine.submit();

    this.searchService.search(query, filters, shouldClearContext).subscribe({
      next: () => {
        this.inputStateMachine.searchComplete();
      },
      error: (error) => {
        this.inputStateMachine.searchFailed();
        console.error('[SearchFacade] Search error:', error);
      }
    });
  }
  
  /**
   * Handle incoming WebSocket messages
   * Race-safe: ignores messages for old requestIds
   */
  private handleWsMessage(msg: WSServerMessage): void {
    // Ignore messages for old requests
    if (msg.requestId !== this.currentRequestId()) {
      console.warn('[SearchFacade] Ignoring WS message for old request', msg.requestId);
      return;
    }
    
    switch (msg.type) {
      case 'status':
        this.assistantStatus.set(msg.status);
        console.log('[SearchFacade] Assistant status:', msg.status);
        break;
        
      case 'stream.delta':
        // Append chunk
        this.assistantText.update(text => text + msg.text);
        this.assistantStatus.set('streaming');
        break;
        
      case 'stream.done':
        // Finalize text
        this.assistantText.set(msg.fullText);
        console.log('[SearchFacade] Assistant stream complete');
        break;
        
      case 'recommendation':
        this.wsRecommendations.set(msg.actions);
        console.log('[SearchFacade] Recommendations received:', msg.actions.length);
        break;
        
      case 'error':
        console.error('[SearchFacade] Assistant error', msg);
        this.wsError.set(msg.message);
        this.assistantStatus.set('failed');
        break;
    }
  }
  
  /**
   * Toggle async/sync mode (dev/testing only)
   */
  setAsyncMode(enabled: boolean): void {
    this.useAsyncMode.set(enabled);
    console.log(`[SearchFacade] Async mode: ${enabled ? 'ON' : 'OFF'}`);
    
    if (enabled) {
      this.wsClient.connect();
    }
  }

  retry(): void {
    const result = this.searchService.retryLastSearch();
    if (result) {
      result.subscribe({
        error: (error) => {
          console.error('[SearchFacade] Retry error:', error);
        }
      });
    }
  }
  
  // NEW: Handle clarification choice
  onClarificationChoice(choice: import('../domain/types/search.types').ClarificationChoice): void {
    // Re-run search with the patched constraints
    const currentQuery = this.query();
    this.search(currentQuery, choice.constraintPatch);
  }

  selectRestaurant(restaurant: Restaurant | null): void {
    this.sessionStore.selectRestaurant(restaurant);
  }

  proposeAction(type: ActionType, level: ActionLevel, restaurant: Restaurant): void {
    this.actionService.proposeAction(type, level, restaurant).subscribe({
      error: (error) => {
        console.error('[SearchFacade] Action proposal error:', error);
      }
    });
  }

  approveAction(actionId: string): void {
    this.actionService.approveAction(actionId).subscribe({
      error: (error) => {
        console.error('[SearchFacade] Action approval error:', error);
      }
    });
  }

  rejectAction(actionId: string): void {
    this.actionService.rejectAction(actionId);
  }

  /**
   * Handle chip click - implements UI/UX Contract state management
   * - SORT: Re-search with sort parameter (creates new pool)
   * - FILTER: Re-search with filter parameter (creates new pool)
   * - VIEW: Switch view mode (no new pool)
   * 
   * Per SEARCH_POOL_PAGINATION_RULES.md:
   * - Filter/sort changes MUST create a new pool via re-search
   * - Never filter/sort client-side (breaks pagination truth)
   */
  onChipClick(chipId: string): void {
    const chip = this.chips().find(c => c.id === chipId);
    if (!chip) return;

    const currentQuery = this.query();
    if (!currentQuery) {
      console.warn('[SearchFacade] No current query to re-search');
      return;
    }

    switch (chip.action) {
      case 'sort':
        // Single-select: re-search with sort (creates new pool)
        const sortKey = this.mapChipToSortKey(chipId);
        this.sortState.set(sortKey);
        console.log('[SearchFacade] ✅ Sort chip clicked, re-searching with sort:', sortKey);
        
        // TODO: Pass sort to backend when API supports it
        // For now, backend always returns best match
        console.warn('[SearchFacade] ⚠️ Sort not yet sent to backend');
        break;
        
      case 'filter':
        // Multi-select: toggle filter and re-search (creates new pool)
        const filters = new Set(this.filterState());
        const isRemoving = filters.has(chipId);
        
        if (isRemoving) {
          filters.delete(chipId);
          console.log('[SearchFacade] ✅ Filter chip removed, re-searching without filter:', chipId);
        } else {
          filters.add(chipId);
          console.log('[SearchFacade] ✅ Filter chip added, re-searching with filter:', chipId);
        }
        
        this.filterState.set(filters);
        
        // Parse all active filters into SearchFilters
        const searchFilters = this.buildSearchFilters(filters);
        console.log('[SearchFacade] 🔄 Re-searching with filters:', searchFilters);
        
        // Re-search creates a new pool (per pool rules)
        this.search(currentQuery, searchFilters);
        break;
        
      case 'map':
        // Single-select: switch to map view (no new pool)
        this.viewState.set('MAP');
        console.log('[SearchFacade] View changed to: MAP');
        // TODO: Implement map view
        break;
    }
  }

  /**
   * Map chip ID to sort key enum
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

  /**
   * Build SearchFilters from active filter chip IDs
   * Parses chip.filter strings like "price<=2", "opennow", "delivery"
   * 
   * Per SEARCH_POOL_PAGINATION_RULES.md:
   * - These filters create a new search pool
   * - Backend must receive and apply them
   */
  private buildSearchFilters(activeFilterIds: Set<string>): SearchFilters {
    const filters: SearchFilters = {};
    const allChips = this.chips();

    for (const chipId of activeFilterIds) {
      const chip = allChips.find(c => c.id === chipId);
      if (!chip || chip.action !== 'filter') continue;

      const filterStr = chip.filter || '';

      // Parse filter string
      if (filterStr === 'opennow') {
        filters.openNow = true;
      } else if (filterStr === 'closednow') {
        filters.openNow = false;
      } else if (filterStr.startsWith('price<=')) {
        // Parse "price<=2" → priceLevel: 2
        const maxPrice = parseInt(filterStr.replace('price<=', ''), 10);
        if (!isNaN(maxPrice) && maxPrice >= 1 && maxPrice <= 4) {
          filters.priceLevel = maxPrice;
        }
      } else if (filterStr === 'delivery') {
        // Delivery is a mustHave constraint
        filters.mustHave = filters.mustHave || [];
        filters.mustHave.push('delivery');
      } else if (filterStr === 'kosher' || filterStr === 'vegan' || filterStr === 'glutenfree') {
        // Dietary constraints
        filters.dietary = filters.dietary || [];
        filters.dietary.push(filterStr);
      }
      // Add more filter types as needed
    }

    return filters;
  }

  onAssistActionClick(query: string): void {
    this.search(query);
  }

  reset(): void {
    this.searchStore.reset();
  }

  setLocale(locale: string): void {
    this.sessionStore.setLocale(locale);
  }

  setRegion(region: string): void {
    this.sessionStore.setRegion(region);
  }

  cleanupExpiredActions(): void {
    this.actionService.cleanupExpired();
  }

  // NEW: Phase B - Input state management
  onInput(text: string): void {
    this.inputStateMachine.input(text);
  }

  onClear(): void {
    this.inputStateMachine.clear();
    this.searchStore.reset();
  }

  onSelectRecent(query: string): void {
    this.inputStateMachine.selectRecent(query);
    this.search(query);
  }

  onSelectChip(newQuery: string): void {
    this.inputStateMachine.selectChip(newQuery);
    this.search(newQuery);
  }

  clearRecentSearches(): void {
    this.recentSearchesService.clear();
  }
}


