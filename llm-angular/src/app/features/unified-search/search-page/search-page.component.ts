/**
 * Search Page Component
 * Main container for unified search experience
 */

import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, computed, signal, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { rememberSearchEntry, entryFromPrefix } from '../../../core/qr-entry';
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
import { DailyLimitCardComponent } from '../daily-limit/daily-limit-card.component';
import { dailyLimitCopy } from '../daily-limit/daily-limit-copy';
import { LocationService } from '../../../services/location.service';
import { PwaInstallService } from '../../../services/pwa-install.service';
import { I18nService } from '../../../core/services/i18n.service';
import { LanguageService } from '../../../core/services/language.service';
import { heroAboutLines } from './hero-about';
import { InputStateMachine } from '../../../services/input-state-machine.service';
import {
  deserializeSearchParams,
  filterChipIdsFromParams
} from './search-params.util';
import {
  groupFiltersByEnforcement,
  getFilterDisplayLabel,
  getFilterValueLabel,
  type FiltersByEnforcement
} from './filter-enforcement.util';
import type { Restaurant, ClarificationChoice, Coordinates } from '../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../domain/types/action.types';
// DEV: Import dev tools for testing (auto-loaded)
import '../../../facades/assistant-dev-tools';

const MISSING_LOCATION_COPY = {
  en: {
    dir: 'ltr' as const,
    message: 'To search for restaurants I need a location. Enable location or type a city or area.',
    question: 'Where do you want to search? (city or area)',
    button: 'Enable location'
  },
  he: {
    dir: 'rtl' as const,
    message: 'כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.',
    question: 'איפה תרצה לחפש? (עיר או אזור)',
    button: 'אפשר מיקום'
  },
  ar: {
    dir: 'rtl' as const,
    message: 'للبحث عن مطاعم أحتاج موقعاً. فعّل الموقع أو اكتب مدينة أو منطقة.',
    question: 'أين تريد أن تبحث؟ (مدينة أو منطقة)',
    button: 'تفعيل الموقع'
  },
  ru: {
    dir: 'ltr' as const,
    message: 'Чтобы искать рестораны, мне нужно место. Включите геолокацию или напишите город или район.',
    question: 'Где искать? (город или район)',
    button: 'Включить геолокацию'
  }
};

export type MissingLocationCopy = {
  dir: 'ltr' | 'rtl';
  message: string;
  question: string;
  button: string;
};

/** Prompt language follows the letters in the search: Hebrew, Arabic, Russian, or English. */
export function missingLocationCopy(query: string): MissingLocationCopy {
  let hebrew = 0;
  let arabic = 0;
  let cyrillic = 0;
  let latin = 0;
  for (const char of query) {
    if (/[\u0590-\u05FF]/.test(char)) hebrew++;
    else if (/[\u0600-\u06FF]/.test(char)) arabic++;
    else if (/[\u0400-\u04FF]/.test(char)) cyrillic++;
    else if (/[A-Za-z]/.test(char)) latin++;
  }
  const top = Math.max(hebrew, arabic, cyrillic, latin);
  if (top > 0 && hebrew === top) return MISSING_LOCATION_COPY.he;
  if (top > 0 && arabic === top) return MISSING_LOCATION_COPY.ar;
  if (top > 0 && cyrillic === top) return MISSING_LOCATION_COPY.ru;
  return MISSING_LOCATION_COPY.en;
}

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
    AssistantSummaryComponent,
    DailyLimitCardComponent
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
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly stateHandler = inject(SearchStateHandler);
  private readonly inputStateMachine = inject(InputStateMachine);
  private readonly locationService = inject(LocationService);
  readonly pwaInstall = inject(PwaInstallService);
  readonly i18n = inject(I18nService);
  private readonly language = inject(LanguageService);
  readonly heroLines = computed(() => heroAboutLines(this.language.currentLang()));
  readonly dailyLimitNotice = computed(() => dailyLimitCopy(this.facade.query()));
  readonly heroDir = computed(() => this.language.textDirection());

  private cleanupInterval?: number;
  private paramMapSub?: { unsubscribe(): void };

  constructor() {
    // Reset SUMMARY toggle when search request changes so new SUMMARY starts collapsed
    effect(() => {
      this.facade.requestId();
      this.assistantSummaryExpanded.set(false);
    });
  }

  // Scroll collapse state
  readonly isHeroCollapsed = signal(false);

  // Location state
  readonly locationState = this.locationService.state;
  readonly locationCoords = this.locationService.location;
  readonly locationBlockedRetries = this.locationService.blockedRetries;

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

    const shouldShow = hasCardMessages || legacyActive;

    // TEMP DEBUG: Log assistant visibility
    if (hasCardMessages || legacyActive) {
      console.log('[SearchPage][DEBUG] Contextual assistant visibility:', {
        shouldShow,
        hasCardMessages,
        legacyActive,
        cardMessagesCount: this.contextualCardMessages().length
      });
    }

    return shouldShow;
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

  /** True when contextual cards are only SUMMARY (toggleable); CLARIFY/GATE_FAIL stay always visible */
  readonly isContextualAssistantSummaryOnly = computed(() => {
    const cards = this.contextualCardMessages();
    return cards.length > 0 && cards.every(c => c.type === 'SUMMARY');
  });

  /** True when global cards are only SUMMARY (toggleable) */
  readonly isGlobalAssistantSummaryOnly = computed(() => {
    const cards = this.globalCardMessages();
    return cards.length > 0 && cards.every(c => c.type === 'SUMMARY');
  });

  /** Toggle state for SUMMARY-only assistant: collapsed by default, user expands to push results down */
  readonly assistantSummaryExpanded = signal(false);

  /** Show full assistant block for contextual: when not SUMMARY-only (always show) or SUMMARY-only and expanded */
  readonly showContextualAssistantExpanded = computed(() => {
    if (!this.showContextualAssistant()) return false;
    if (!this.isContextualAssistantSummaryOnly()) return true;
    return this.assistantSummaryExpanded();
  });

  /** Show only the "Show why" toggle button for contextual SUMMARY-only when collapsed */
  readonly showContextualAssistantToggle = computed(() => {
    return this.showContextualAssistant() && this.isContextualAssistantSummaryOnly() && !this.assistantSummaryExpanded();
  });

  /** Show full assistant block for global (same logic as contextual) */
  readonly showGlobalAssistantExpanded = computed(() => {
    if (!this.showGlobalAssistant()) return false;
    if (!this.isGlobalAssistantSummaryOnly()) return true;
    return this.assistantSummaryExpanded();
  });

  readonly showGlobalAssistantToggle = computed(() => {
    return this.showGlobalAssistant() && this.isGlobalAssistantSummaryOnly() && !this.assistantSummaryExpanded();
  });

  toggleAssistantSummary(): void {
    this.assistantSummaryExpanded.update(v => !v);
  }

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

  // Pagination: Visible count (starts at 10, increments by 5)
  private visibleCount = signal(10);

  /** True when the next results grid should fade in. Chips turn this off. */
  readonly fadeOnAppear = signal(true);

  /** Location row under the search box. Hidden when GPS is on or the assist is absent. */
  readonly showMissingLocationQuestion = computed(() => {
    const response = this.response();
    const assist = response?.assist;
    if (!response?.results?.length || !assist) {
      return false;
    }
    if (this.locationState() === 'ON') {
      return false;
    }
    return assist.type === 'clarify'
      && assist.reason === 'MISSING_LOCATION'
      && assist.suggestedAction === 'ASK_LOCATION'
      && !!assist.message
      && !!assist.question;
  });

  readonly missingLocationPrompt = computed(() =>
    missingLocationCopy(this.facade.query() || this.response()?.query?.original || '')
  );

  // All results after filtering (not paginated)
  private readonly allResults = computed(() => {
    let results = this.facade.results();

    // CLIENT-SIDE FILTERING: Apply openNow filter if active
    const appliedFilters = this.response()?.meta?.appliedFilters || [];
    if (appliedFilters.includes('open_now')) {
      results = results.filter(r => r.openNow === true);
    }

    return results;
  });

  // Visible results (paginated)
  readonly filteredResults = computed(() => {
    const all = this.allResults();
    const count = this.visibleCount();
    return all.slice(0, Math.min(count, all.length));
  });

  // Flat results with pagination (for grouped view)
  readonly flatResults = computed(() => {
    const groups = this.response()?.groups;
    if (!groups) return [];
    // Flatten groups, preserving backend order
    let allResults = groups.flatMap(g => g.results);

    // CLIENT-SIDE FILTERING: Apply openNow filter if active
    const appliedFilters = this.response()?.meta?.appliedFilters || [];
    if (appliedFilters.includes('open_now')) {
      allResults = allResults.filter(r => r.openNow === true);
    }

    // Apply pagination
    const count = this.visibleCount();
    return allResults.slice(0, Math.min(count, allResults.length));
  });

  // Check if there are more results to show
  readonly hasMoreResults = computed(() => {
    const totalResults = this.allResults().length;
    const visible = this.visibleCount();
    return visible < totalResults;
  });

  // Count of remaining results
  readonly remainingResults = computed(() => {
    const totalResults = this.allResults().length;
    const visible = this.visibleCount();
    const remaining = totalResults - visible;
    return Math.min(remaining, 5); // Show +5 or remainder if less
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

  // NEW: Gluten-free SOFT hint filter active (fallback when filtersWithMeta missing)
  readonly glutenFreeFilterActive = computed(() => {
    const response = this.response();
    if (!response) return false;
    const withMeta = response.meta?.filtersWithMeta;
    if (withMeta?.length) {
      return withMeta.some(f => f.key === 'glutenFree' && f.enforcement === 'hint');
    }
    const appliedFilters = response.meta?.appliedFilters || [];
    return appliedFilters.includes('gluten-free:soft');
  });

  /** Filters grouped by enforcement for UI sections (Enforced / Preferences / AI hints / Not enforced). */
  readonly filtersByEnforcement = computed((): FiltersByEnforcement => {
    const meta = this.response()?.meta;
    return groupFiltersByEnforcement(meta?.filtersWithMeta);
  });

  readonly getFilterDisplayLabel = getFilterDisplayLabel;
  readonly getFilterValueLabel = getFilterValueLabel;

  /** Whether any filter section has items to show. */
  readonly hasAnyFilterSections = computed(() => {
    const g = this.filtersByEnforcement();
    return g.hard.length > 0 || g.soft.length > 0 || g.hint.length > 0 || g.not_applied.length > 0;
  });

  // Bottom placeholder: All card messages (contextual + global)
  // TEMPORARILY DISABLED - see template comment
  readonly allCardMessages = computed(() => {
    return this.facade.assistantCardMessages();
  });

  // Cuisine chips removed - discovery via free-text search + assistant only

  ngOnInit(): void {
    const path = this.activatedRoute.snapshot.routeConfig?.path;
    if (path === 'q') {
      rememberSearchEntry('qr');
    }
    if (path === 'p/:prefix') {
      const entry = entryFromPrefix(this.activatedRoute.snapshot.paramMap.get('prefix'));
      if (entry) rememberSearchEntry(entry);
    }
    if (typeof window !== 'undefined') {
      this.paramMapSub = this.activatedRoute.queryParamMap.subscribe(paramMap => {
        const q = paramMap.get('q')?.trim();
        if (q) {
          const deserialized = deserializeSearchParams(paramMap);
          this.stateHandler.setSort(deserialized.sort ?? 'BEST_MATCH');
          this.stateHandler.setActiveFilterIds(filterChipIdsFromParams(deserialized));
          // Restore the box once from an old link. The search itself is the POST body.
          this.facade.restoreStateFromParams(q);
        }
        if (paramMap.keys.length === 0) return;
        void this.router.navigate([], {
          relativeTo: this.activatedRoute,
          queryParams: {},
          replaceUrl: true
        });
      });
    }
    // Setup periodic cleanup of expired actions (every minute)
    this.cleanupInterval = typeof window !== 'undefined' ? window.setInterval(() => {
      this.facade.cleanupExpiredActions();
    }, 60000) : undefined;
  }

  ngOnDestroy(): void {
    if (this.cleanupInterval != null) {
      clearInterval(this.cleanupInterval);
    }
    this.paramMapSub?.unsubscribe();
  }

  // Phase 6: Recommendation click handler
  onRecommendationClick(actionId: string): void {
    console.log('[SearchPage] Recommendation clicked:', actionId);
    // Future: Send action_clicked to WebSocket
  }

  onSearch(query: string): void {
    this.fadeOnAppear.set(true);
    this.facade.search(query);
    // Reset visible count on new search
    this.visibleCount.set(10);
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
    this.fadeOnAppear.set(true);
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
    this.fadeOnAppear.set(false);
    // Trigger actual filtering/sorting via facade (single source of truth)
    this.facade.onChipClick(chipId);
    // Reset visible count when filtering/sorting (new search pool)
    this.visibleCount.set(10);
  }

  closeBottomSheet(): void {
    this.bottomSheetVisible.set(false);
  }

  loadMore(): void {
    // Increase visible count by 5 (or show remaining if less than 5)
    const totalResults = this.allResults().length;
    this.visibleCount.update(current => Math.min(current + 5, totalResults));
    console.log('[SearchPage] Load more clicked, new count:', this.visibleCount());
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

  /**
   * Handle PWA install button click
   * Triggers the browser's install prompt
   */
  async onInstallPwa(): Promise<void> {
    const accepted = await this.pwaInstall.promptInstall();
    if (accepted) {
      console.log('[SearchPage] PWA install accepted');
    }
  }

  /**
   * Dismiss PWA install prompt
   */
  onDismissInstall(): void {
    this.pwaInstall.hidePrompt();
  }

  /**
   * Handle window scroll to collapse hero
   */
  @HostListener('window:scroll', ['$event'])
  onWindowScroll(): void {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    
    // Keep the logo and headline on screen through a short scroll, then ease them away.
    this.isHeroCollapsed.set(scrollTop > 160);
  }
}


