/**
 * Search API Client
 * HTTP transport layer for search operations
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { retry, catchError } from 'rxjs/operators';
import type { SearchRequest, SearchResponse } from '../domain/types/search.types';

@Injectable({ providedIn: 'root' })
export class SearchApiClient {
  private readonly apiUrl = '/api/search';
  private abortController: AbortController | null = null;

  constructor(private http: HttpClient) {}

  search(request: SearchRequest): Observable<SearchResponse> {
    // Cancel previous request if exists
    this.abortController?.abort();
    this.abortController = new AbortController();

    return this.http.post<SearchResponse>(this.apiUrl, request).pipe(
      retry({ count: 2, delay: 1000 }),
      catchError(this.handleError)
    );
  }

  getStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/stats`).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message = error.error?.error || error.message || 'Search failed';
    console.error('[SearchApiClient] Error:', message);
    return throwError(() => new Error(message));
  }
}

