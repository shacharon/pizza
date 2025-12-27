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

@Injectable({ providedIn: 'root' })
export class SessionApiClient {
  private readonly apiUrl = '/api/session';

  constructor(private http: HttpClient) {}

  /**
   * Future: Create session on backend
   */
  createSession(): Observable<{ sessionId: string }> {
    return this.http.post<{ sessionId: string }>(this.apiUrl, {}).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Future: Get session from backend
   */
  getSession(sessionId: string): Observable<SessionState> {
    return this.http.get<SessionState>(`${this.apiUrl}/${sessionId}`).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message = error.error?.error || error.message || 'Session request failed';
    console.error('[SessionApiClient] Error:', message);
    return throwError(() => new Error(message));
  }
}








