/**
 * Search Store
 * Reactive state management for search operations using Angular signals
 */

import { Injectable, signal, computed } from '@angular/core';
import type { SearchResponse, ResultGroup } from '../domain/types/search.types';

@Injectable({ providedIn: 'root' })
export class SearchStore {
  // Private state signals
  private readonly _query = signal<string>('');
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _response = signal<SearchResponse | null>(null);

  // Public readonly signals
  readonly query = this._query.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly response = this._response.asReadonly();

  // Computed signals
  readonly requestId = computed(() => this._response()?.requestId);
  readonly results = computed(() => this._response()?.results || []);
  readonly chips = computed(() => this._response()?.chips || []);
  readonly meta = computed(() => this._response()?.meta);
  readonly proposedActions = computed(() => this._response()?.proposedActions);
  readonly hasResults = computed(() => this.results().length > 0);
  readonly assist = computed(() => this._response()?.assist);

  // NEW: Groups support (Phase B)
  readonly groups = computed(() => this._response()?.groups);
  readonly hasGroups = computed(() => {
    const groups = this.groups();
    return groups !== undefined && groups.length > 0;
  });
  readonly exactResults = computed(() =>
    this.groups()?.find((g: ResultGroup) => g.kind === 'EXACT')?.results || []
  );
  readonly nearbyResults = computed(() =>
    this.groups()?.find((g: ResultGroup) => g.kind === 'NEARBY')?.results || []
  );
  readonly exactCount = computed(() => this.exactResults().length);
  readonly nearbyCount = computed(() => this.nearbyResults().length);

  // NEW: Clarification support (Answer-First UX)
  readonly clarification = computed(() => this._response()?.clarification);
  readonly requiresClarification = computed(() => this._response()?.requiresClarification ?? false);

  // Mutations
  setQuery(query: string): void {
    this._query.set(query);
  }

  setLoading(loading: boolean): void {
    this._loading.set(loading);
  }

  setError(error: string | null): void {
    this._error.set(error);
  }

  setResponse(response: SearchResponse): void {
    this._response.set(response);
    this._error.set(null); // Clear error on successful response
  }

  reset(): void {
    this._query.set('');
    this._loading.set(false);
    this._error.set(null);
    this._response.set(null);
  }

  /**
   * Clear all search state (for new search submission)
   * Keeps query but clears results, assistant, chips, etc.
   */
  clearState(): void {
    this._loading.set(false);
    this._error.set(null);
    this._response.set(null);
  }

  /**
   * Patch a restaurant by placeId with new data (for WS RESULT_PATCH events)
   * Mutates the response in-place to trigger change detection
   * Handles both new providers.wolt and legacy wolt fields
   */
  patchRestaurant(placeId: string, patch: Partial<import('../domain/types/search.types').Restaurant>): void {
    const currentResponse = this._response();
    if (!currentResponse) {
      console.warn('[SearchStore] Cannot patch restaurant - no response loaded');
      return;
    }

    // Find and update restaurant in results
    let updated = false;
    const updatedResults = currentResponse.results?.map(restaurant => {
      if (restaurant.placeId === placeId) {
        updated = true;
        // Deep merge providers field to preserve other providers
        const mergedProviders = patch.providers 
          ? { ...restaurant.providers, ...patch.providers }
          : restaurant.providers;
        return { ...restaurant, ...patch, providers: mergedProviders };
      }
      return restaurant;
    });

    // Find and update restaurant in groups if present
    let updatedGroups = currentResponse.groups;
    if (updatedGroups && updatedGroups.length > 0) {
      updatedGroups = updatedGroups.map(group => ({
        ...group,
        results: group.results.map(restaurant => {
          if (restaurant.placeId === placeId) {
            updated = true;
            // Deep merge providers field to preserve other providers
            const mergedProviders = patch.providers 
              ? { ...restaurant.providers, ...patch.providers }
              : restaurant.providers;
            return { ...restaurant, ...patch, providers: mergedProviders };
          }
          return restaurant;
        })
      }));
    }

    if (!updated) {
      console.warn('[SearchStore] Restaurant not found for patch', { placeId });
      return;
    }

    // Create new response object to trigger signal update
    this._response.set({
      ...currentResponse,
      results: updatedResults || [],
      groups: updatedGroups
    });

    console.log('[SearchStore] Restaurant patched', { placeId, patch });
  }
}


