/**
 * Auth API Service
 * Handles authentication-related HTTP requests
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap, catchError, throwError, of } from 'rxjs';
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

/** Degraded response when Redis/WS is unavailable — client should use polling or SSE */
export interface WSTicketDegradedResponse {
  wsAvailable: false;
  message?: string;
  traceId: string;
}

export type WSTicketResult = WSTicketResponse | WSTicketDegradedResponse;

export function isWSTicketAvailable(r: WSTicketResult): r is WSTicketResponse {
  return 'ticket' in r && typeof (r as WSTicketResponse).ticket === 'string';
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
   * Request session cookie
   * Protected endpoint - requires JWT Authorization header
   * Sets HttpOnly session cookie via Set-Cookie header
   * 
   * This is called automatically after JWT token is obtained
   * to enable cookie-based authentication for SSE endpoints
   */
  requestSessionCookie(token: string): Observable<{ ok: boolean; sessionId: string }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.post<{ ok: boolean; sessionId: string }>(
      `${this.baseUrl}/auth/session`,
      {},
      { headers, withCredentials: true }  // CRITICAL: withCredentials to store cookie
    );
  }

  /**
   * Request a one-time WebSocket ticket
   * Protected endpoint - requires JWT Authorization header
   * 
   * On 200 with wsAvailable: false (or 503 after retries): returns degraded result so app continues
   * with polling/SSE. Search flow must not depend on WS.
   */
  requestWSTicket(): Observable<WSTicketResult> {
    return from(this.authService.getToken()).pipe(
      switchMap(token => this.requestTicketWithRetry(token, 0))
    );
  }

  /**
   * Internal: Request ticket with 503 retry logic.
   * On 200 with wsAvailable: false or 503 after retries: emit degraded result (no throw).
   */
  private requestTicketWithRetry(token: string, attemptNumber: number): Observable<WSTicketResult> {
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

    return this.http.post<WSTicketResult>(
      `${this.baseUrl}/auth/ws-ticket`,
      {},
      { headers }
    ).pipe(
      switchMap((body) => {
        // Backend returns 200 with wsAvailable: false when Redis is down (soft fail)
        if (body && (body as any).wsAvailable === false) {
          if (!environment.production) {
            safeLog('WS-Ticket', 'WebSocket unavailable (degraded mode) — use polling/SSE', {
              message: (body as any).message
            });
          }
          return of(body as WSTicketDegradedResponse);
        }
        // Normal: ticket + ttlSeconds (backend may send wsAvailable: true or legacy shape)
        const res = body as WSTicketResponse;
        const normalized: WSTicketResponse = {
          ticket: res.ticket,
          expiresInSeconds: (res as any).ttlSeconds ?? res.expiresInSeconds ?? 60,
          traceId: res.traceId ?? (body as any).traceId
        };
        return of(normalized);
      }),
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

              return this.http.post<WSTicketResult>(
                `${this.baseUrl}/auth/ws-ticket`,
                {},
                { headers }
              ).pipe(
                switchMap((body) => {
                  if (body && (body as any).wsAvailable === false) {
                    return of(body as WSTicketDegradedResponse);
                  }
                  const res = body as WSTicketResponse;
                  return of({
                    ticket: res.ticket,
                    expiresInSeconds: (res as any).ttlSeconds ?? res.expiresInSeconds ?? 60,
                    traceId: res.traceId ?? (body as any).traceId
                  });
                })
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
            return new Observable<WSTicketResult>(observer => {
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

          // Max retries exceeded or different 503: treat as degraded (non-fatal), continue with polling
          if (!environment.production) {
            safeLog('WS-Ticket', '503 after retries — switching to polling/SSE (non-fatal)', {
              errorCode,
              attemptNumber: attemptNumber + 1
            });
          }
          return of({
            wsAvailable: false as const,
            message: 'WebSocket temporarily unavailable (Redis not ready). Use polling or SSE.',
            traceId: (error.error as any)?.traceId ?? ''
          });
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
