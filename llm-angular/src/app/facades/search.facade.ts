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
  readonly isStopped = this.searchStore.isStopped;
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

  // P0 Scale Safety: Idempotency key for retry protection during ECS autoscaling
  // Generated once per user search action, reused for retries within same action
  private currentIdempotencyKey?: string;

  // CARD STATE: Explicit state machine for search lifecycle
  private readonly _cardState = signal<SearchCardState>('RUNNING');
  readonly cardState = this._cardState.asReadonly();

  // Deduplication: Track in-flight search to prevent duplicates
  private inFlightQuery: string | null = null;
  private lastSubmitTime: number = 0;
  private readonly DEBOUNCE_MS = 400;

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

    // Subscribe to ticket unavailable events (503 Redis unavailable)
    // Triggers immediate polling fallback without waiting for deferred polling
    this.wsHandler.ticketUnavailable$.subscribe(() => {
      const requestId = this.currentRequestId();
      const query = this.query();

      if (requestId && query) {
        safeLog('SearchFacade', 'ws-ticket unavailable - starting immediate polling fallback', { requestId });

        // Cancel deferred polling start and start immediately
        this.apiHandler.cancelPollingStart();

        // Start polling immediately (no delay)
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
          },
          undefined, // onProgress
          { delayMs: 0, fastIntervalBase: 500, slowInterval: 2000, backoffAt: 10000, maxDuration: 30000, fastJitter: 200 } // immediate start
        );
      }
    });

    // Connect to WebSocket
    this.wsHandler.connect();
  }

  /**
   * Normalize query for deduplication (lowercase, trim, collapse whitespace)
   */
  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Execute search with proper async 202 handling
   * Supports both WebSocket (fast path) and polling (fallback)
   * 
   * P0 Scale Safety: Generates idempotency key for retry protection during ECS autoscaling.
   * Key is reused for retries within same user action (via retry() method).
   * 
   * Deduplication: Prevents duplicate searches for the same query via debounce + in-flight check.
   */
  async search(query: string, filters?: SearchFilters): Promise<void> {
    const normalizedQuery = this.normalizeQuery(query);
    const now = Date.now();

    // Block duplicate submission if same query is already in-flight
    if (this.inFlightQuery === normalizedQuery) {
      safeLog('SearchFacade', 'Blocked duplicate search - already in-flight', {
        query: normalizedQuery,
        inFlightQuery: this.inFlightQuery
      });
      return;
    }

    // Debounce: Block rapid repeated submissions (< 400ms since last submit)
    const timeSinceLastSubmit = now - this.lastSubmitTime;
    if (timeSinceLastSubmit < this.DEBOUNCE_MS) {
      safeLog('SearchFacade', 'Blocked rapid duplicate submission (debounce)', {
        query: normalizedQuery,
        timeSinceLastMs: timeSinceLastSubmit,
        debounceMs: this.DEBOUNCE_MS
      });
      return;
    }

    // Mark query as in-flight and update submit time
    this.inFlightQuery = normalizedQuery;
    this.lastSubmitTime = now;

    try {
      // Cancel any previous polling
      this.apiHandler.cancelPolling();

      // FRESH SEARCH FIX: Clear ALL assistant messages on new search (no carry-over)
      // Each search starts with a clean slate
      this.assistantHandler.reset();

      // CARD STATE: Reset to RUNNING for fresh search
      this._cardState.set('RUNNING');

      // NEW: Clear requestId before search (will be set when response arrives)
      this.currentRequestId.set(undefined);

      // P0 Scale Safety: Idempotency key management
      // - Fresh search (query changed): Generate NEW key, clear old one
      // - Retry (same query): Reuse EXISTING key to prevent duplicates during ECS autoscaling
      const isRetry = this.searchStore.query() === query && !!this.currentIdempotencyKey;

      if (!isRetry) {
        // Fresh search: Generate new key
        this.currentIdempotencyKey = this.generateIdempotencyKey();
        safeLog('SearchFacade', 'Generated new idempotency key for fresh search', {
          query,
          idempotencyKey: this.currentIdempotencyKey
        });
      } else {
        // Retry: Reuse existing key
        safeLog('SearchFacade', 'Reusing idempotency key for retry', {
          query,
          idempotencyKey: this.currentIdempotencyKey
        });
      }

      // Update input state machine
      this.recentSearchesService.add(query);
      this.inputStateMachine.submit();

      // Set loading
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
        //  debug: { stopAfter: 'intent' },
        clearContext: shouldClearContext,
        uiLanguage: this.locale() as 'he' | 'en',  // UI language for assistant messages ONLY
        idempotencyKey: this.currentIdempotencyKey
      });

      // Check if it's a 202 Accepted (async) or 200 (sync fallback)
      if ('resultUrl' in response) {
        // HTTP 202: Async mode - start polling + WS
        const { requestId, resultUrl } = response;
        this.currentRequestId.set(requestId);

        safeLog('SearchFacade', 'Async 202 accepted', { requestId, resultUrl });

        // Subscribe to WebSocket for real-time updates
        this.wsHandler.subscribeToRequest(requestId, this.conversationId());

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
    } finally {
      // Clear in-flight marker when search completes (success or error)
      this.inFlightQuery = null;
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

    // CLARIFY FIX: If in CLARIFY state, don't store results
    // User must answer clarification question first - results are not valid
    if (this.cardState() === 'CLARIFY') {
      safeLog('SearchFacade', 'Ignoring results - waiting for clarification', {
        requestId: response.requestId,
        cardState: 'CLARIFY'
      });
      // Cancel any further polling attempts
      this.apiHandler.cancelPolling();
      return;
    }

    // INVARIANT CHECK: Validate DONE_STOPPED responses have no results
    // This should never trigger (backend enforces it), but defensive check
    const isDoneStopped = response.meta?.failureReason !== 'NONE';
    const isClarify = response.assist?.type === 'clarify';
    if ((isDoneStopped || isClarify) && response.results.length > 0) {
      safeLog('SearchFacade', 'WARNING: CLARIFY/STOPPED response had results - sanitizing', {
        requestId: response.requestId,
        resultCount: response.results.length,
        assistType: response.assist?.type,
        failureReason: response.meta?.failureReason
      });
      // FAIL-SAFE: Force empty results (defensive)
      response.results = [];
      response.groups = undefined;
    }

    safeLog('SearchFacade', 'Handling search response', {
      requestId: response.requestId,
      resultCount: response.results.length,
      isStopped: isDoneStopped || isClarify
    });

    // Store requestId if not already set
    if (!this.currentRequestId()) {
      this.currentRequestId.set(response.requestId);
    }

    // Update store with full response
    this.searchStore.setResponse(response);
    this.searchStore.setLoading(false);

    // Clear in-flight marker when results arrive
    this.inFlightQuery = null;

    // CARD STATE: Successful results = terminal STOP state
    this._cardState.set('STOP');

    // Update input state machine
    this.inputStateMachine.searchComplete();

    safeLog('SearchFacade', 'Search completed', {
      requestId: response.requestId,
      resultCount: response.results.length,
      cardState: this.cardState(),
      isStopped: this.searchStore.isStopped()
    });
  }

  /**
   * Handle incoming WebSocket messages
   * Delegates to wsHandler for routing
   */
  private handleWsMessage(msg: WSServerMessage): void {
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
          const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL', 'NUDGE_REFINE'];
          if (!narrator || !narrator.type || !validTypes.includes(narrator.type)) {
            safeLog('SearchFacade', 'Ignoring non-LLM assistant message', { type: narrator?.type || 'unknown' });
            return;
          }

          // LANGUAGE FIX: Extract language from envelope fields (priority) or payload.language (backward compat)
          // Priority: envelope.assistantLanguage > envelope.uiLanguage > payload.language > uiStore fallback
          const language = narratorMsg.assistantLanguage ?? narratorMsg.uiLanguage ?? narrator.language ?? this.locale();
          
          safeLog('SearchFacade', 'Valid LLM assistant message', {
            type: narrator.type,
            requestId: narratorMsg.requestId,
            language,
            assistantLanguage: narratorMsg.assistantLanguage ?? null,
            uiLanguage: narratorMsg.uiLanguage ?? null,
            payloadLanguage: narrator.language ?? null
          });

          // MULTI-MESSAGE: Add to message collection (accumulates, doesn't overwrite)
          const assistMessage = narrator.message || narrator.question || '';
          if (assistMessage) {
            this.assistantHandler.addMessage(
              narrator.type as 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL' | 'NUDGE_REFINE',
              assistMessage,
              narratorMsg.requestId,
              narrator.question || null,
              narrator.blocksSearch || false,
              language // Pass language from envelope
            );
          }

          // CARD STATE: Map assistant message type to card state
          if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
            safeLog('SearchFacade', 'DONE_CLARIFY - stopping search, waiting for user input');

            // Stop loading immediately
            this.searchStore.setLoading(false);

            // CLARIFY FIX: Clear previous results to prevent stale data from rendering
            // User must answer clarification question - old results are not valid
            this.searchStore.reset();
            this.searchStore.setQuery(this.searchStore.query()); // Preserve query text

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

  /**
   * Retry last search
   * P0 Scale Safety: Reuses idempotency key from original search for retry protection.
   * This ensures retries within same user action don't create duplicate jobs during ECS autoscaling.
   */
  retry(): void {
    const lastQuery = this.searchStore.query();
    if (lastQuery) {
      safeLog('SearchFacade', 'Retrying search with same idempotency key', {
        query: lastQuery,
        idempotencyKey: this.currentIdempotencyKey
      });
      // Reuse current idempotency key for retry (no new key generation)
      // search() will use this.currentIdempotencyKey if already set
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

  /**
   * Add assistant message (public wrapper for assistantHandler)
   * Used for local fallback messages when WS is not connected
   */
  addAssistantMessage(
    type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL' | 'NUDGE_REFINE',
    message: string,
    requestId: string,
    question: string | null,
    blocksSearch: boolean
  ): void {
    this.assistantHandler.addMessage(type, message, requestId, question, blocksSearch);
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

  /**
   * Generate idempotency key (UUID v4 format)
   * P0 Scale Safety: Ensures uniqueness across browser sessions
   */
  private generateIdempotencyKey(): string {
    // Simple UUID v4 implementation (browser-safe)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
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


