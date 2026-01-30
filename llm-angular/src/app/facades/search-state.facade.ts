/**
 * Search State Handler
 * Manages sort, filter, and view state
 */

import { Injectable, signal, computed } from '@angular/core';
import type { SearchFilters, RefinementChip } from '../domain/types/search.types';
import type { ViewMode } from './search.facade.types';
import { mapChipToSortKey, buildSearchFilters, type SortKey } from '../domain/mappers/chip.mapper';

@Injectable()
export class SearchStateHandler {
  // Sort state (single-select)
  private sortState = signal<SortKey>('BEST_MATCH');
  readonly currentSort = this.sortState.asReadonly();

  // Filter state (multi-select)
  private filterState = signal<Set<string>>(new Set());
  readonly activeFilters = computed(() => Array.from(this.filterState()));

  // View state (single-select)
  private viewState = signal<ViewMode>('LIST');
  readonly currentView = this.viewState.asReadonly();

  /**
   * Handle chip click
   * Returns: { shouldSearch: boolean, filters?: SearchFilters }
   */
  handleChipClick(
    chipId: string,
    chip: RefinementChip | undefined,
    allChips: RefinementChip[]
  ): { shouldSearch: boolean; filters?: SearchFilters } {
    if (!chip) return { shouldSearch: false };

    switch (chip.action) {
      case 'sort':
        // Single-select: update sort state
        const sortKey = mapChipToSortKey(chipId);
        this.sortState.set(sortKey);
        console.log('[SearchStateHandler] Sort chip clicked:', sortKey);

        // TODO: Pass sort to backend when API supports it
        console.warn('[SearchStateHandler] Sort not yet sent to backend');
        return { shouldSearch: false };

      case 'filter':
        // Multi-select: toggle filter
        const filters = new Set(this.filterState());
        const isRemoving = filters.has(chipId);

        if (isRemoving) {
          filters.delete(chipId);
          console.log('[SearchStateHandler] Filter removed:', chipId);
        } else {
          filters.add(chipId);
          console.log('[SearchStateHandler] Filter added:', chipId);
        }

        this.filterState.set(filters);

        // Build search filters using pure mapper
        const searchFilters = buildSearchFilters(filters, allChips);
        console.log('[SearchStateHandler] Re-searching with filters:', searchFilters);

        return { shouldSearch: true, filters: searchFilters };

      case 'map':
        // Single-select: switch to map view
        this.viewState.set('MAP');
        console.log('[SearchStateHandler] View changed to: MAP');
        return { shouldSearch: false };

      default:
        return { shouldSearch: false };
    }
  }
}
