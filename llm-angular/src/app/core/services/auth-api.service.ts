/**
 * Auth API Service
 * Handles authentication-related HTTP requests
 *
 * Cookie-only refactor:
 * - No JWT token endpoint usage
 * - No Authorization Bearer usage
 * - No localStorage sessionId dependency (cookie is source of truth)
 * - /auth/ws-ticket is optional; if still used, call withCredentials and no headers
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { safeLog, safeError } from '../../shared/utils/safe-logger';

export interface AuthBootstrapResponse {
  ok: boolean;
  sessionId?: string;
  traceId?: string;
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
   * Cookie-only: bootstrap session (idempotent)
   * Public endpoint - sets HttpOnly session cookie via Set-Cookie
   */
  bootstrapSession(): Observable<AuthBootstrapResponse> {
    return this.http.post<AuthBootstrapResponse>(
      `${this.baseUrl}/auth/bootstrap`,
      {},
      { withCredentials: true }
    );
  }

  /**
   * Legacy JWT token endpoint (disabled in cookie_only)
   * Kept for compatibility with older code paths.
   */
  requestToken(): Observable<never> {
    return throwError(() => new Error('Cookie-only mode: /auth/token is disabled'));
  }

  /**
   * Legacy "requestSessionCookie" (disabled in cookie_only)
   * Kept only so old call-sites fail loudly.
   */
  requestSessionCookie(): Observable<never> {
    return throwError(() => new Error('Cookie-only mode: /auth/session is not used'));
  }

  /**
   * Request a one-time WebSocket ticket (if WS still exists)
   *
   * Cookie-only rules:
   * - Ensure session cookie exists first (bootstrap)
   * - Call ws-ticket withCredentials
   * - NO Authorization header
   * - NO X-Session-Id header (server reads cookie)
   *
   * Retries:
   * - 503 WS_TICKET_REDIS_NOT_READY: retry with backoff (200ms, 500ms, 1s) max 3
   */
  requestWSTicket(): Observable<WSTicketResponse> {
    return from(this.authService.ensureSession()).pipe(
      switchMap(() => this.requestTicketCookieOnly(0))
    );
  }

  private requestTicketCookieOnly(attemptNumber: number): Observable<WSTicketResponse> {
    if (!environment.production && attemptNumber === 0) {
      safeLog('WS-Ticket', 'Requesting ticket (cookie_only)', {
        withCredentials: true
      });
    }

    return this.http.post<WSTicketResponse>(
      `${this.baseUrl}/auth/ws-ticket`,
      {},
      { withCredentials: true }
    ).pipe(
      catchError((error: unknown) => {
        // 503 retry: Redis not ready
        if (error instanceof HttpErrorResponse && error.status === 503) {
          const errorCode = (error.error as any)?.code;
          if (errorCode === 'WS_TICKET_REDIS_NOT_READY' && attemptNumber < 3) {
            const backoffDelays = [200, 500, 1000];
            const delay = backoffDelays[attemptNumber];

            if (!environment.production) {
              safeLog('WS-Ticket', '503 Redis not ready, retrying (cookie_only)', {
                attemptNumber: attemptNumber + 1,
                maxAttempts: 3,
                delayMs: delay
              });
            }

            return new Observable<WSTicketResponse>(observer => {
              const timeoutId = setTimeout(() => {
                this.requestTicketCookieOnly(attemptNumber + 1).subscribe({
                  next: (r) => observer.next(r),
                  error: (err) => observer.error(err),
                  complete: () => observer.complete()
                });
              }, delay);

              return () => clearTimeout(timeoutId);
            });
          }

          if (!environment.production) {
            safeError('WS-Ticket', '503 error - max retries exceeded or non-retryable (cookie_only)', {
              errorCode,
              attemptNumber: attemptNumber + 1
            });
          }
        }

        // 401 should not happen if cookie exists; if it does, force re-bootstrap once.
        if (error instanceof HttpErrorResponse && error.status === 401 && attemptNumber < 1) {
          if (!environment.production) {
            safeLog('WS-Ticket', '401 received (cookie_only) - re-bootstrapping once', {});
          }
          return from(this.authService.ensureSession()).pipe(
            switchMap(() => this.requestTicketCookieOnly(attemptNumber + 1))
          );
        }

        return throwError(() => error);
      })
    );
  }
}
