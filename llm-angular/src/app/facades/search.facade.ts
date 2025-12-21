/**
 * Search Facade
 * Component orchestration layer - simplifies component interaction with stores and services
 */

import { Injectable, inject } from '@angular/core';
import { UnifiedSearchService } from '../services/unified-search.service';
import { ActionService } from '../services/action.service';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { ActionsStore } from '../state/actions.store';
import type { 
  SearchFilters, 
  Restaurant 
} from '../domain/types/search.types';
import type { ActionType, ActionLevel } from '../domain/types/action.types';

@Injectable()
export class SearchFacade {
  private readonly searchService = inject(UnifiedSearchService);
  private readonly actionService = inject(ActionService);
  private readonly searchStore = inject(SearchStore);
  private readonly sessionStore = inject(SessionStore);
  private readonly actionsStore = inject(ActionsStore);

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

  // Public actions
  search(query: string, filters?: SearchFilters): void {
    this.searchService.search(query, filters).subscribe({
      error: (error) => {
        // Error already handled in service, just log for component awareness
        console.error('[SearchFacade] Search error:', error);
      }
    });
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

  onChipClick(chipId: string): void {
    const chip = this.chips().find(c => c.id === chipId);
    if (!chip) return;

    switch (chip.action) {
      case 'filter':
        // Apply filter - would need to parse chip.filter and re-search
        console.log('[SearchFacade] Apply filter:', chip.filter);
        // TODO: Implement filter parsing and application
        break;
      case 'sort':
        // Sort results - would need to implement sorting
        console.log('[SearchFacade] Sort by:', chip.filter);
        // TODO: Implement client-side sorting
        break;
      case 'map':
        // Open map view
        console.log('[SearchFacade] Show map view');
        // TODO: Implement map view
        break;
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
}

