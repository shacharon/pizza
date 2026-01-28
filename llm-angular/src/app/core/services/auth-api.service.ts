/**
 * Auth API Service
 * Handles authentication-related HTTP requests
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

const SESSION_STORAGE_KEY = 'api-session-id';

export interface AuthTokenResponse {
  token: string;
  sessionId: string;
  traceId: string;
}

export interface WSTicketResponse {
  ticket: string;
  expiresInSeconds: number;
  traceId: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  // apiUrl + apiBasePath (e.g. http://localhost:3000 + /api/v1)
  private readonly baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;

  /**
   * Request a new JWT token
   * Public endpoint - no auth required
   */
  requestToken(sessionId?: string): Observable<AuthTokenResponse> {
    return this.http.post<AuthTokenResponse>(
      `${this.baseUrl}/auth/token`,
      sessionId ? { sessionId } : {}
    );
  }

  /**
   * Request a one-time WebSocket ticket
   * Protected endpoint - requires JWT Authorization header
   * 
   * Security:
   * - MUST await JWT token before making request
   * - Explicitly includes Authorization Bearer header
   * - Explicitly includes X-Session-Id header
   * - On 401 (stale/invalid JWT): clears token and retries ONCE
   * 
   * Dev logging:
   * - Logs ticket request start (dev only)
   * - Logs whether Authorization header is present (dev only)
   * - NEVER logs the actual token value
   */
  requestWSTicket(): Observable<WSTicketResponse> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => {
        const sessionId = this.getSessionId();
        
        // Dev logging (no token value)
        if (!environment.production) {
          console.log('[WS-Ticket] Requesting ticket', {
            hasAuthorization: !!token,
            hasSessionId: !!sessionId
          });
        }

        const headers = new HttpHeaders({
          'Authorization': `Bearer ${token}`,
          'X-Session-Id': sessionId
        });

        return this.http.post<WSTicketResponse>(
          `${this.baseUrl}/auth/ws-ticket`,
          {},
          { headers }
        );
      }),
      catchError((error: unknown) => {
        // Handle 401: clear stale token and retry ONCE
        if (error instanceof HttpErrorResponse && error.status === 401) {
          if (!environment.production) {
            console.warn('[WS-Ticket] 401 received, clearing token and retrying once', {
              errorCode: (error.error as any)?.code
            });
          }

          // Clear stale token
          this.authService.clearToken();

          // Retry once with fresh token
          return from(this.authService.getToken()).pipe(
            switchMap(newToken => {
              const sessionId = this.getSessionId();
              
              if (!environment.production) {
                console.log('[WS-Ticket] Retrying with fresh token', {
                  hasAuthorization: !!newToken,
                  hasSessionId: !!sessionId
                });
              }

              const headers = new HttpHeaders({
                'Authorization': `Bearer ${newToken}`,
                'X-Session-Id': sessionId
              });

              return this.http.post<WSTicketResponse>(
                `${this.baseUrl}/auth/ws-ticket`,
                {},
                { headers }
              );
            }),
            catchError(retryError => {
              if (!environment.production) {
                console.error('[WS-Ticket] Retry failed', retryError);
              }
              return throwError(() => retryError);
            })
          );
        }

        // Re-throw other errors
        return throwError(() => error);
      })
    );
  }

  /**
   * Get session ID from localStorage
   * Same key used by api-session.interceptor
   */
  private getSessionId(): string {
    try {
      const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!sessionId) {
        console.warn('[WS-Ticket] No session ID found in localStorage');
        return '';
      }
      return sessionId;
    } catch (error) {
      console.warn('[WS-Ticket] Failed to read session ID from localStorage', error);
      return '';
    }
  }
}
