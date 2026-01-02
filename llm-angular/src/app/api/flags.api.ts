/**
 * Feature Flags API Client
 * HTTP transport layer for feature flag operations
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError } from '../shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class FlagsApiClient {
  constructor(private http: HttpClient) {}

  /**
   * Load feature flags from backend
   * Fails gracefully if endpoint not available
   */
  loadFlags(): Observable<Record<string, boolean>> {
    return this.http.get<Record<string, boolean>>(ENDPOINTS.FLAGS).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError = mapApiError(error);
        console.warn('[FlagsApiClient] Failed to load flags, using defaults:', apiError.message);
        // Return default flags on error (graceful degradation)
        return of({
          unifiedSearch: false,
          actionProposals: false
        });
      })
    );
  }
}













