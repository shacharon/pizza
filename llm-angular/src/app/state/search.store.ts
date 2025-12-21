/**
 * Search Store
 * Reactive state management for search operations using Angular signals
 */

import { Injectable, signal, computed } from '@angular/core';
import type { SearchResponse } from '../domain/types/search.types';

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
  readonly results = computed(() => this._response()?.results || []);
  readonly chips = computed(() => this._response()?.chips || []);
  readonly meta = computed(() => this._response()?.meta);
  readonly proposedActions = computed(() => this._response()?.proposedActions);
  readonly hasResults = computed(() => this.results().length > 0);
  readonly assist = computed(() => this._response()?.assist);

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
}


