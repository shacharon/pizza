/**
 * Unified Search Service
 * Orchestrates search operations with analytics and state management
 */

import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SearchApiClient } from '../api/search.api';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { AnalyticsService } from './analytics.service';
import type { SearchRequest, SearchResponse, SearchFilters } from '../domain/types/search.types';

@Injectable({ providedIn: 'root' })
export class UnifiedSearchService {
  private readonly apiClient = inject(SearchApiClient);
  private readonly searchStore = inject(SearchStore);
  private readonly sessionStore = inject(SessionStore);
  private readonly analyticsService = inject(AnalyticsService);

  search(query: string, filters?: SearchFilters): Observable<SearchResponse> {
    const startTime = Date.now();

    // Update store state
    this.searchStore.setQuery(query);
    this.searchStore.setLoading(true);

    // Track search submission
    this.analyticsService.track('search_submitted', { query, filters });

    // Add to recent searches
    this.sessionStore.addToRecentSearches(query);

    // Build request
    const request: SearchRequest = {
      query,
      sessionId: this.sessionStore.conversationId(),
      filters,
      locale: this.sessionStore.locale(),
      region: this.sessionStore.region()
    };

    return this.apiClient.search(request).pipe(
      tap(response => {
        const duration = Date.now() - startTime;

        // Update store
        this.searchStore.setResponse(response);
        this.searchStore.setLoading(false);

        // Track success
        this.analyticsService.track('results_rendered', {
          count: response.results.length,
          confidence: response.meta.confidence,
          mode: response.meta.mode,
          durationMs: duration
        });

        this.analyticsService.trackTiming('search_duration', duration, {
          query,
          resultsCount: response.results.length
        });
      }),
      catchError(error => {
        const duration = Date.now() - startTime;

        // Update store
        this.searchStore.setError(error.message);
        this.searchStore.setLoading(false);

        // Track failure
        this.analyticsService.track('search_failed', {
          error: error.message,
          query,
          durationMs: duration
        });

        this.analyticsService.trackError(error, { query, filters });

        return throwError(() => error);
      })
    );
  }

  retryLastSearch(): Observable<SearchResponse> | null {
    const lastQuery = this.searchStore.query();
    if (lastQuery) {
      return this.search(lastQuery);
    }
    return null;
  }
}


