/**
 * Session API Client
 * HTTP transport layer for session operations
 * Note: Session management is currently client-side
 * These endpoints are for future backend session management
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { SessionState } from '../domain/types/session.types';
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class SessionApiClient {
  constructor(private http: HttpClient) {}

  /**
   * Future: Create session on backend
   * @throws ApiErrorView on failure
   */
  createSession(): Observable<{ sessionId: string }> {
    return this.http.post<{ sessionId: string }>(ENDPOINTS.SESSION, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SessionApiClient.createSession', apiError);
        return throwError(() => apiError);
      })
    );
  }

  /**
   * Future: Get session from backend
   * @throws ApiErrorView on failure
   */
  getSession(sessionId: string): Observable<SessionState> {
    return this.http.get<SessionState>(ENDPOINTS.SESSION_BY_ID(sessionId)).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('SessionApiClient.getSession', apiError);
        return throwError(() => apiError);
      })
    );
  }
}













