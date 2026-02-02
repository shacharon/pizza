/**
 * Auth API Service
 * Handles authentication-related HTTP requests
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { safeLog, safeError } from '../../shared/utils/safe-logger';

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
   * - On 503 (Redis not ready): retries with backoff (200ms, 500ms, 1s) max 3 tries
   * 
   * Dev logging:
   * - Logs ticket request start (dev only)
   * - Logs whether Authorization header is present (dev only)
   * - NEVER logs the actual token value
   */
  requestWSTicket(): Observable<WSTicketResponse> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => this.requestTicketWithRetry(token, 0))
    );
  }

  /**
   * Internal: Request ticket with 503 retry logic
   * Retries up to 3 times with exponential backoff (200ms, 500ms, 1s)
   */
  private requestTicketWithRetry(token: string, attemptNumber: number): Observable<WSTicketResponse> {
    const sessionId = this.getSessionId();

    // Dev logging (NEVER log actual token/session values)
    if (!environment.production && attemptNumber === 0) {
      safeLog('WS-Ticket', 'Requesting ticket', {
        tokenPresent: !!token,
        sessionIdPresent: !!sessionId
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
    ).pipe(
      catchError((error: unknown) => {
        // Handle 401: clear stale token and retry ONCE
        if (error instanceof HttpErrorResponse && error.status === 401) {
          if (!environment.production) {
            safeLog('WS-Ticket', '401 received, clearing token and retrying once', {
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
                safeLog('WS-Ticket-Retry', 'Retrying with fresh token', {
                  tokenPresent: !!newToken,
                  sessionIdPresent: !!sessionId
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
                safeError('WS-Ticket-Retry', 'Retry failed', { error: retryError });
              }
              return throwError(() => retryError);
            })
          );
        }

        // Handle 503: Redis not ready - retry with backoff
        if (error instanceof HttpErrorResponse && error.status === 503) {
          const errorCode = (error.error as any)?.code;
          
          // Check if this is a Redis not ready error
          if (errorCode === 'WS_TICKET_REDIS_NOT_READY' && attemptNumber < 3) {
            const backoffDelays = [200, 500, 1000]; // 200ms, 500ms, 1s
            const delay = backoffDelays[attemptNumber];

            if (!environment.production) {
              safeLog('WS-Ticket', '503 Redis not ready, retrying with backoff', {
                attemptNumber: attemptNumber + 1,
                maxAttempts: 3,
                delayMs: delay
              });
            }

            // Wait for backoff delay, then retry
            return new Observable<WSTicketResponse>(observer => {
              const timeoutId = setTimeout(() => {
                this.requestTicketWithRetry(token, attemptNumber + 1).subscribe({
                  next: (response) => observer.next(response),
                  error: (err) => observer.error(err),
                  complete: () => observer.complete()
                });
              }, delay);

              // Cleanup on unsubscribe
              return () => clearTimeout(timeoutId);
            });
          }

          // Max retries exceeded or different 503 error
          if (!environment.production) {
            safeError('WS-Ticket', '503 error - max retries exceeded or non-retryable', {
              errorCode,
              attemptNumber: attemptNumber + 1
            });
          }
          
          // Re-throw error if not retrying
          return throwError(() => error);
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
        safeLog('WS-Ticket', 'No session ID found in localStorage');
        return '';
      }
      return sessionId;
    } catch (error) {
      safeError('WS-Ticket', 'Failed to read session ID from localStorage', { error });
      return '';
    }
  }
}
