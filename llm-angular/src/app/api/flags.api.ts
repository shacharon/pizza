/**
 * Feature Flags API Client
 * HTTP transport layer for feature flag operations
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class FlagsApiClient {
  private readonly apiUrl = '/api/flags';

  constructor(private http: HttpClient) {}

  /**
   * Load feature flags from backend
   * Fails gracefully if endpoint not available
   */
  loadFlags(): Observable<Record<string, boolean>> {
    return this.http.get<Record<string, boolean>>(this.apiUrl).pipe(
      catchError((error: HttpErrorResponse) => {
        console.warn('[FlagsApiClient] Failed to load flags, using defaults:', error.message);
        // Return default flags on error
        return of({
          unifiedSearch: false,
          actionProposals: false
        });
      })
    );
  }
}









