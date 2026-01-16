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
   * Execute search request with WebSocket assistant streaming
   * Returns CoreSearchResult with requestId for WebSocket subscription
   */
  search(request: SearchRequest): Observable<CoreSearchResult> {
    return this.http.post<CoreSearchResult>(
      `${ENDPOINTS.SEARCH}?mode=async`,
      request
    ).pipe(
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













