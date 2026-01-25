/**
 * Auth API Service
 * Handles authentication-related HTTP requests
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
   * Protected endpoint - requires JWT via auth interceptor
   */
  requestWSTicket(): Observable<WSTicketResponse> {
    return this.http.get<WSTicketResponse>(`${this.baseUrl}/ws-ticket`);
  }
}
