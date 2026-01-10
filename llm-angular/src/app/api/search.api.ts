/**
 * Search API Client
 * HTTP transport layer for search operations
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { SearchRequest, SearchResponse } from '../domain/types/search.types';
import type { CoreSearchResult } from '../core/models/async-search.types';
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class SearchApiClient {
  constructor(private http: HttpClient) {}

  /**
   * Execute async search request (Phase 6)
   * Returns CoreSearchResult with requestId for WebSocket subscription
   * Fast path: < 1 second response time
   */
  searchAsync(request: SearchRequest): Observable<CoreSearchResult> {
    return this.http.post<CoreSearchResult>(
      `${ENDPOINTS.SEARCH}?mode=async`,
      request
    ).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SearchApiClient.searchAsync', apiError);
        return throwError(() => apiError);
      })
    );
  }

  /**
   * Execute search request (sync mode - legacy)
   * @deprecated Use searchAsync() for better performance
   * Returns ApiErrorView on failure (not Error)
   */
  search(request: SearchRequest): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(ENDPOINTS.SEARCH, request).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SearchApiClient.search', apiError);
        return throwError(() => apiError);
      })
    );
  }

  /**
   * Get search statistics
   * Returns ApiErrorView on failure (not Error)
   */
  getStats(): Observable<any> {
    return this.http.get(ENDPOINTS.SEARCH_STATS).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SearchApiClient.getStats', apiError);
        return throwError(() => apiError);
      })
    );
  }
}













