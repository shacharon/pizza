/**
 * Search API Client
 * HTTP transport layer for search operations
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import type { SearchRequest, SearchResponse } from '../domain/types/search.types';
import type { AsyncSearchAccepted, AsyncSearchPending } from '../core/models/async-search.types';
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../shared/http/api-error.mapper';

/**
 * Union type for async search responses
 */
export type AsyncSearchResponse = AsyncSearchAccepted | SearchResponse;

/**
 * Union type for polling responses
 */
export type AsyncPollResponse = AsyncSearchPending | SearchResponse;

@Injectable({ providedIn: 'root' })
export class SearchApiClient {
  constructor(private http: HttpClient) {}

  /**
   * Execute async search request
   * Returns 202 with requestId + resultUrl, or 200 with full results (sync fallback)
   */
  searchAsync(request: SearchRequest): Observable<AsyncSearchResponse> {
    return this.http.post<AsyncSearchAccepted | SearchResponse>(
      `${ENDPOINTS.SEARCH}?mode=async`,
      request,
      { observe: 'response' }
    ).pipe(
      map((response: HttpResponse<AsyncSearchAccepted | SearchResponse>) => {
        const body = response.body!;
        
        // Check if it's a 202 Accepted (async) or 200 (sync fallback)
        if (response.status === 202) {
          console.log('[SearchAPI] Async 202 accepted:', body);
          return body as AsyncSearchAccepted;
        } else {
          console.log('[SearchAPI] Sync 200 response:', body);
          return body as SearchResponse;
        }
      }),
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SearchApiClient.searchAsync', apiError);
        return throwError(() => apiError);
      })
    );
  }

  /**
   * Poll async search result
   * Returns 202 PENDING or 200 DONE or throws on error
   */
  pollResult(resultUrl: string): Observable<AsyncPollResponse> {
    const fullUrl = resultUrl.startsWith('/api') ? resultUrl : `/api/v1/search/${resultUrl}/result`;
    
    return this.http.get<AsyncSearchPending | SearchResponse>(fullUrl, { observe: 'response' }).pipe(
      map((response: HttpResponse<AsyncSearchPending | SearchResponse>) => {
        const body = response.body!;
        
        if (response.status === 202) {
          console.log('[SearchAPI] Poll PENDING:', body);
          return body as AsyncSearchPending;
        } else {
          console.log('[SearchAPI] Poll DONE:', body);
          return body as SearchResponse;
        }
      }),
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SearchApiClient.pollResult', apiError);
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













