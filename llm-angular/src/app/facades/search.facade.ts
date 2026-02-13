/**
 * Search Facade (Thin Orchestrator)
 * Component orchestration layer - delegates to focused handler modules
 * Refactored: Extracted responsibilities into focused modules (SOLID)
 */

import { Injectable, inject, computed, signal } from '@angular/core';
import { ActionService } from '../services/action.service';
import { InputStateMachine } from '../services/input-state-machine.service';
import { RecentSearchesService } from '../services/recent-searches.service';
import { LocationService } from '../services/location.service';
import { I18nService } from '../core/services/i18n.service';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { ActionsStore } from '../state/actions.store';
import type {
  SearchFilters,
  Restaurant,
  SearchResponse,
} from '../domain/types/search.types';
import type { ActionType, ActionLevel } from '../domain/types/action.types';
import type { SearchCardState } from '../domain/types/search-card-state.types';
import type { WSServerMessage } from '../core/models/ws-protocol.types';
import { safeLog, safeError, safeWarn } from '../shared/utils/safe-logger';

// Extracted handler modules
import { SearchApiHandler } from './search-api.facade';
import { SearchWsHandler } from './search-ws.facade';
import { SearchAssistantHandler } from './search-assistant.facade';
import { SearchStateHandler } from './search-state.facade';

@Injectable()
export class SearchFacade {
  private readonly actionService = inject(ActionService);
  private readonly inputStateMachine = inject(InputStateMachine);
  private readonly recentSearchesService = inject(RecentSearchesService);
  private readonly locationService = inject(LocationService);
  private readonly i18nService = inject(I18nService);
  private readonly searchStore = inject(SearchStore);
  private readonly sessionStore = inject(SessionStore);
  private readonly actionsStore = inject(ActionsStore);

  // Extracted handler modules
  private readonly apiHandler = inject(SearchApiHandler);
  private readonly wsHandler = inject(SearchWsHandler);
  private readonly assistantHandler = inject(SearchAssistantHandler);
  private readonly stateHandler = inject(SearchStateHandler);

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
    const requestId = this.requestId();
    const results = this.results();
    const meta = this.meta();
    if (!results || !meta || !requestId) return null;

    return {
      requestId,
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

  // Current request tracking
  private readonly currentRequestId = signal<string | undefined>(undefined);
  readonly requestId = this.currentRequestId.asReadonly();

  // CARD STATE: Explicit state machine for search lifecycle
  private readonly _cardState = signal<SearchCardState>('RUNNING');
  readonly cardState = this._cardState.asReadonly();

  // Derived state queries (for backward compatibility)
  readonly isWaitingForClarification = computed(() => this.cardState() === 'CLARIFY');
  readonly isTerminalState = computed(() => this.cardState() === 'STOP');

  // Assistant state (delegated to handler)
  readonly assistantMessages = this.assistantHandler.messages; // MULTI-MESSAGE: All messages ordered by timestamp (LEGACY)
  readonly assistantLineMessages = this.assistantHandler.lineMessages; // ROUTING: Line channel (PRESENCE, WS_STATUS, PROGRESS)
  readonly assistantCardMessages = this.assistantHandler.cardMessages; // ROUTING: Card channel (SUMMARY, CLARIFY, GATE_FAIL)
  readonly assistantNarration = this.assistantHandler.narration;
  readonly assistantState = this.assistantHandler.status;
  readonly recommendations = this.assistantHandler.recommendations;
  readonly assistantError = this.assistantHandler.error;
  readonly assistantMessageRequestId = this.assistantHandler.requestId; // PLACEMENT FIX
  readonly assistantBlocksSearch = this.assistantHandler.blocksSearch; // BLOCKS SEARCH
  readonly wsConnectionStatus = this.wsHandler.connectionStatus;

  // UI state (delegated to handler)
  readonly currentSort = this.stateHandler.currentSort;
  readonly activeFilters = this.stateHandler.activeFilters;
  readonly currentView = this.stateHandler.currentView;

  constructor() {
    // Subscribe to WebSocket messages via handler
    this.wsHandler.subscribeToMessages(msg => this.handleWsMessage(msg));

    // Connect to WebSocket
    this.wsHandler.connect();
  }

  /**
   * Execute search with proper async 202 handling
   * Supports both WebSocket (fast path) and polling (fallback)
   */
  async search(query: string, filters?: SearchFilters): Promise<void> {
    try {
      // Cancel any previous polling
      this.apiHandler.cancelPolling();

      // STALE RESULTS FIX: Clear ALL state before new search
      // This prevents old results from showing during new search
      this.searchStore.clearState(); // Clear results, chips, assistant, error
      this.assistantHandler.reset(); // Clear all assistant messages

      // CRITICAL: Clear currentRequestId BEFORE starting search
      // This ensures events from previous search are ignored immediately
      this.currentRequestId.set(undefined);

      // CRITICAL: Clear all WS subscriptions to old requests
      // This prevents old events from being delivered after reconnection
      this.wsHandler.clearAllSubscriptions();

      // CARD STATE: Reset to RUNNING for fresh search
      this._cardState.set('RUNNING');

      // Update input state machine
      this.recentSearchesService.add(query);
      this.inputStateMachine.submit();

      // Set loading and query
      this.searchStore.setLoading(true);
      this.searchStore.setQuery(query);

      // Check if this is a fresh search after intent reset
      const shouldClearContext = this.inputStateMachine.intentReset();

      // Call search API (returns 202 or 200)
      const response = await this.apiHandler.executeSearch({
        query,
        filters,
        sessionId: this.conversationId(),
        userLocation: this.locationService.location() ?? undefined,
        clearContext: shouldClearContext,
        locale: this.locale()
      });

      // Check if it's a 202 Accepted (async) or 200 (sync fallback)
      if ('resultUrl' in response) {
        // HTTP 202: Async mode - start polling + WS
        const { requestId, resultUrl } = response;
        this.currentRequestId.set(requestId);

        safeLog('SearchFacade', 'Async 202 accepted', { requestId, resultUrl });

        // Subscribe to WebSocket for real-time updates
        // Note: sessionId is now fetched from JWT localStorage, not conversationId
        // This call blocks until WS is connected and authenticated
        // Pass assistantHandler for SSE routing (feature flag controlled)
        await this.wsHandler.subscribeToRequest(requestId, undefined, this.assistantHandler);

        // Defer polling start (if WS delivers first, polling never starts)
        this.apiHandler.startPolling(
          requestId,
          query,
          (response) => this.handleSearchResponse(response, query),
          (error) => {
            this.searchStore.setError(error);
            this.searchStore.setLoading(false);
            this.assistantHandler.setStatus('failed');
            this.assistantHandler.setError(error + ' - Please retry');
            this.inputStateMachine.searchFailed();
          }
        );

      } else {
        // HTTP 200: Sync mode (fallback)
        const syncResponse = response as SearchResponse;
        this.currentRequestId.set(syncResponse.requestId);
        this.handleSearchResponse(syncResponse, query);
      }

    } catch (error: any) {
      // Handle network connection errors with user-friendly message
      if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
        safeError('SearchFacade', 'Network connection error', { code: error.code, status: error.status });
        const userMessage = error?.message || 'Unable to connect to server. Please check your internet connection.';
        this.searchStore.setError(userMessage);
        this.searchStore.setLoading(false);
        this.assistantHandler.setStatus('failed');
        this.assistantHandler.setError(userMessage);
        this.inputStateMachine.searchFailed();
        // CARD STATE: Connection errors are terminal
        this._cardState.set('STOP');
        return;
      }

      // Handle other errors
      safeError('SearchFacade', 'Search error', { status: error?.status, code: error?.code, message: error?.message });
      const userMessage = error?.message || 'Search failed. Please try again.';
      this.searchStore.setError(userMessage);
      this.searchStore.setLoading(false);
      this.assistantHandler.setStatus('failed');
      this.assistantHandler.setError(userMessage);
      this.inputStateMachine.searchFailed();
      // CARD STATE: All errors are terminal
      this._cardState.set('STOP');
    }
  }

  /**
   * Handle search response (from sync, polling, or WS)
   */
  private handleSearchResponse(response: SearchResponse, query: string): void {
    // Only process if we're still on this search
    if (this.searchStore.query() !== query) {
      safeLog('SearchFacade', 'Ignoring stale response for query', { query });
      return;
    }

    safeLog('SearchFacade', 'Handling search response', {
      requestId: response.requestId,
      resultCount: response.results.length
    });

    // LANGUAGE SYNC: Update UI language from response
    const uiLanguage = (response.query as any).parsed?.languageContext?.uiLanguage;
    if (uiLanguage && this.i18nService.currentLang() !== uiLanguage) {
      safeLog('SearchFacade', 'Syncing UI language from response', {
        current: this.i18nService.currentLang(),
        new: uiLanguage
      });
      this.i18nService.setLanguage(uiLanguage);
    }

    // Store requestId if not already set
    if (!this.currentRequestId()) {
      this.currentRequestId.set(response.requestId);
    }

    // Update store with full response
    this.searchStore.setResponse(response);
    this.searchStore.setLoading(false);

    // CARD STATE: Successful results = terminal STOP state
    if (this.cardState() !== 'CLARIFY') {
      // Don't override CLARIFY state - it's explicitly non-terminal
      this._cardState.set('STOP');
    }

    // Update input state machine
    this.inputStateMachine.searchComplete();

    safeLog('SearchFacade', 'Search completed', {
      requestId: response.requestId,
      resultCount: response.results.length,
      cardState: this.cardState()
    });
  }

  /**
   * Handle incoming WebSocket messages
   * Delegates to wsHandler for routing
   */
  private handleWsMessage(msg: WSServerMessage): void {
    // Handle SEARCH_RESULTS events (final results from backend)
    if ((msg as any).type === 'SEARCH_RESULTS') {
      this.handleSearchResults(msg as any);
      return;
    }

    // Handle RESULT_PATCH events (Wolt enrichment)
    if ((msg as any).type === 'RESULT_PATCH') {
      this.handleResultPatch(msg as any);
      return;
    }

    this.wsHandler.handleMessage(
      msg,
      this.currentRequestId(),
      {
        onSubNack: (nack) => {
          if (nack.channel === 'assistant') {
            safeLog('SearchFacade', 'Assistant subscription rejected - continuing with search channel only');
          }
        },
        onAssistantMessage: (msg) => {
          const narratorMsg = msg as any;
          const narrator = narratorMsg.payload;

          // DEDUP FIX: Strict type validation - only LLM assistant messages
          // System notifications MUST NOT render as assistant messages
          const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
          if (!narrator || !narrator.type || !validTypes.includes(narrator.type)) {
            safeLog('SearchFacade', 'Ignoring non-LLM assistant message', { type: narrator?.type || 'unknown' });
            return;
          }

          safeLog('SearchFacade', 'Valid LLM assistant message', { type: narrator.type, message: narrator.message });

          // MULTI-MESSAGE: Add to message collection (accumulates, doesn't overwrite)
          const assistMessage = narrator.message || narrator.question || '';
          if (assistMessage) {
            // Extract language from payload (fallback to 'en' if not present)
            const language = narrator.language || 'en';

            this.assistantHandler.routeMessage(
              narrator.type as 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL',
              assistMessage,
              narratorMsg.requestId,
              {
                question: narrator.question || null,
                blocksSearch: narrator.blocksSearch || false,
                language: language
              }
            );
          }

          // CARD STATE: Map assistant message type to card state
          if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
            safeLog('SearchFacade', 'DONE_CLARIFY - stopping search, waiting for user input');

            // Stop loading immediately
            this.searchStore.setLoading(false);

            // CARD STATE: Set to CLARIFY (non-terminal, card stays active)
            this._cardState.set('CLARIFY');

            // Cancel any pending polling
            this.apiHandler.cancelPolling();

            // Set status for CLARIFY
            this.assistantHandler.setStatus('completed');
          } else if (narrator.type === 'GATE_FAIL') {
            // CARD STATE: GATE_FAIL is terminal (STOP)
            safeLog('SearchFacade', 'GATE_FAIL - terminal state');
            this._cardState.set('STOP');
            this.searchStore.setLoading(false);
            this.apiHandler.cancelPolling();
            this.assistantHandler.setStatus('completed');
          } else {
            // CARD STATE: SUMMARY, DIETARY_HINT, or other non-blocking types
            // Do NOT change card state - search continues normally
            this.assistantHandler.setStatus('completed');

            // DEDUPE FIX: Clear any legacy error/status messages when SUMMARY arrives
            // SUMMARY from WS is the only result announcement - no duplicate banners
            if (narrator.type === 'SUMMARY') {
              this.searchStore.setError(null);
              safeLog('SearchFacade', 'SUMMARY received - cleared legacy status messages');
            }
          }
        },
        onSearchEvent: (event) => this.handleSearchEvent(event),
        onLegacyMessage: (msg) => this.assistantHandler.handleLegacyMessage(msg)
      }
    );
  }

  /**
   * Handle SEARCH_RESULTS WebSocket event (final results from backend)
   */
  private handleSearchResults(msg: import('../core/models/ws-protocol.types').WSServerSearchResults): void {
    console.log('[SearchFacade] SEARCH_RESULTS received', {
      requestId: msg.requestId,
      resultCount: msg.resultCount,
      resultsLen: msg.results.length,
      servedFrom: msg.servedFrom
    });

    // Verify this is for the current search
    if (msg.requestId !== this.currentRequestId()) {
      console.debug('[SearchFacade] Ignoring SEARCH_RESULTS for old request', {
        msgRequestId: msg.requestId,
        currentRequestId: this.currentRequestId()
      });
      return;
    }

    // Cancel polling - we have results via WebSocket
    this.apiHandler.cancelPolling();

    // Map WS results to SearchResponse format
    // This ensures compatibility with existing UI code that expects SearchResponse
    const searchResponse: SearchResponse = {
      requestId: msg.requestId,
      sessionId: this.conversationId(),
      query: {
        original: this.query() || '',
        parsed: {},
        language: this.locale()
      },
      results: msg.results,
      chips: [],
      assist: { type: 'guide', message: '' },
      meta: {
        tookMs: 0,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 1.0,
        source: msg.servedFrom === 'cache' ? 'cache' : 'route2',
        failureReason: 'NONE'
      }
    };

    // Use existing handleSearchResponse to update store (same path as HTTP polling)
    this.handleSearchResponse(searchResponse, this.query());
  }

  /**
   * Handle RESULT_PATCH WebSocket event (Wolt enrichment)
   * Patches both new providers.wolt and legacy wolt fields
   */
  private handleResultPatch(msg: import('../core/models/ws-protocol.types').WSServerResultPatch): void {
    console.log('[SearchFacade] RESULT_PATCH received', {
      requestId: msg.requestId,
      placeId: msg.placeId,
      providers: msg.patch.providers,
      legacyWolt: msg.patch.wolt
    });

    // Verify this patch is for the current search
    if (msg.requestId !== this.currentRequestId()) {
      console.debug('[SearchFacade] Ignoring RESULT_PATCH for old request', {
        msgRequestId: msg.requestId,
        currentRequestId: this.currentRequestId()
      });
      return;
    }

    // Build patch object with both new and legacy fields
    const patch: Partial<Restaurant> = {};

    // NEW: Patch providers.wolt field (primary)
    if (msg.patch.providers) {
      patch.providers = msg.patch.providers;
    }

    // DEPRECATED: Patch legacy wolt field (backward compatibility)
    if (msg.patch.wolt) {
      patch.wolt = msg.patch.wolt;
    }

    // Apply patch if we have any data
    if (patch.providers || patch.wolt) {
      this.searchStore.patchRestaurant(msg.placeId, patch);
    }
  }

  /**
   * Handle search contract events (progress, ready, error)
   */
  private handleSearchEvent(event: import('../contracts/search.contracts').WsSearchEvent): void {
    // CARD STATE: Ignore search events if in CLARIFY state (non-terminal)
    if (this.cardState() === 'CLARIFY') {
      safeLog('SearchFacade', 'Ignoring search event - waiting for clarification');
      return;
    }

    // CARD STATE: Map backend event to card state
    if (event.type === 'ready') {
      if (event.decision === 'STOP' || event.ready === 'stop') {
        // Terminal state: search stopped/failed
        this._cardState.set('STOP');
      } else if (event.decision === 'ASK_CLARIFY' || event.ready === 'ask') {
        // Non-terminal: needs clarification (handled by assistant message)
        this._cardState.set('CLARIFY');
      }
      // 'results' ready with 'CONTINUE' decision stays RUNNING until response processed
    } else if (event.type === 'error') {
      // Errors are terminal
      this._cardState.set('STOP');
    }

    this.wsHandler.handleSearchEvent(
      event,
      {
        onSearchResponse: (response, query) => this.handleSearchResponse(response, query),
        onError: (message) => {
          this.searchStore.setError(message);
          this.searchStore.setLoading(false);
          this.assistantHandler.setStatus('failed');
          this.assistantHandler.setError(message);
        },
        onProgress: () => {
          // Keep showing loading state
        }
      },
      (requestId) => this.apiHandler.fetchResult(requestId),
      () => this.apiHandler.cancelPollingStart(),
      () => this.apiHandler.cancelPolling(),
      this.searchStore.query()
    );
  }

  retry(): void {
    const lastQuery = this.searchStore.query();
    if (lastQuery) {
      this.search(lastQuery);
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
        safeError('SearchFacade', 'Action proposal error', { error });
      }
    });
  }

  approveAction(actionId: string): void {
    this.actionService.approveAction(actionId).subscribe({
      error: (error) => {
        safeError('SearchFacade', 'Action approval error', { error });
      }
    });
  }

  rejectAction(actionId: string): void {
    this.actionService.rejectAction(actionId);
  }

  /**
   * Handle chip click - delegates to state handler
   */
  onChipClick(chipId: string): void {
    const chip = this.chips().find(c => c.id === chipId);
    const currentQuery = this.query();

    if (!currentQuery) {
      safeWarn('SearchFacade', 'No current query to re-search');
      return;
    }

    const result = this.stateHandler.handleChipClick(chipId, chip, this.chips());

    if (result.shouldSearch) {
      this.search(currentQuery, result.filters);
    }
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


