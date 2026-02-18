/**
 * Authentication Service
 * Manages JWT tokens for API authentication
 * 
 * Responsibilities:
 * - Fetch JWT token from backend on first request
 * - Store token in localStorage
 * - Provide token to HTTP interceptor
 * - Handle token refresh on 401 errors
 * 
 * Token Format:
 * - JWT (HS256) signed by backend
 * - Payload: { sessionId: string }
 * - Expiry: 30 days
 */

import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ENDPOINTS } from '../../shared/api/api.config';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const TOKEN_STORAGE_KEY = 'g2e_jwt';
const SESSION_STORAGE_KEY = 'api-session-id';

interface TokenResponse {
  token: string;
  sessionId: string;
  traceId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokenCache = signal<string | null>(null);
  private fetchPromise: Promise<string> | null = null;

  constructor(private http: HttpClient) {
    // Load token from localStorage on startup
    const stored = this.loadTokenFromStorage();
    if (stored) {
      this.tokenCache.set(stored);
      
      // DUAL MODE ONLY: Request session cookie for SSE
      // In cookie_only mode, bootstrap service handles session creation
      if (environment.authMode === 'dual') {
        this.requestSessionCookie(stored).catch((error: unknown) => {
          console.warn('[Auth] Failed to obtain session cookie on startup:', error);
        });
      } else {
        console.debug('[Auth] AUTH_MODE=cookie_only - skipping requestSessionCookie on startup');
      }
    }
  }

  /**
   * Get current JWT token (async)
   * Fetches from backend if not available
   * 
   * @returns Promise<string> - JWT token
   */
  async getToken(): Promise<string> {
    // Return cached token if available
    const cached = this.tokenCache();
    if (cached) {
      return cached;
    }

    // If already fetching, return existing promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch new token
    this.fetchPromise = this.fetchTokenFromBackend();

    try {
      const token = await this.fetchPromise;
      return token;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Clear token and refetch (used on 401 INVALID_TOKEN)
   */
  async refreshToken(): Promise<string> {
    console.log('[Auth] Refreshing token due to 401');
    this.clearToken();
    return this.getToken();
  }

  /**
   * Clear token from memory and storage
   */
  clearToken(): void {
    this.tokenCache.set(null);
    this.fetchPromise = null;
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      console.warn('[Auth] Failed to clear token from localStorage', error);
    }
  }

  /**
   * Load token from localStorage
   */
  private loadTokenFromStorage(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      console.warn('[Auth] Failed to load token from localStorage', error);
      return null;
    }
  }

  /**
   * Save token to localStorage
   */
  private saveTokenToStorage(token: string): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch (error) {
      console.warn('[Auth] Failed to save token to localStorage', error);
    }
  }

  /**
   * Get current sessionId from localStorage (PUBLIC API)
   * This is the same sessionId used by HTTP requests and should be used for WS subscriptions
   * @returns sessionId or empty string if not available
   */
  getSessionId(): string {
    return this.getExistingSessionId() || '';
  }

  /**
   * Get existing sessionId from localStorage
   * This is the same sessionId used by api-session.interceptor
   */
  private getExistingSessionId(): string | null {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  /**
   * Request session cookie from backend
   * Called after JWT token is obtained to enable SSE authentication
   */
  private async requestSessionCookie(token: string): Promise<void> {
    try {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      await firstValueFrom(
        this.http.post<{ ok: boolean; sessionId: string }>(
          ENDPOINTS.AUTH_TOKEN.replace('/token', '/session'),
          {},
          { headers, withCredentials: true }  // CRITICAL: withCredentials to store cookie
        )
      );

      console.log('[Auth] ✅ Session cookie obtained');
    } catch (error) {
      console.error('[Auth] Failed to obtain session cookie:', error);
      throw error;
    }
  }

  /**
   * Fetch JWT token from backend
   * Sends existing sessionId if available
   */
  private async fetchTokenFromBackend(): Promise<string> {
    try {
      console.log('[Auth] Fetching JWT token from backend...');

      // Include existing sessionId if available (for continuity)
      const existingSessionId = this.getExistingSessionId();
      const body = existingSessionId ? { sessionId: existingSessionId } : {};

      // Use proper auth token endpoint
      let response: TokenResponse;
      try {
        response = await firstValueFrom(
          this.http.post<TokenResponse>(ENDPOINTS.AUTH_TOKEN, body)
        );
      } catch (error: any) {
        // Handle EmptyError as retryable
        if (error?.name === 'EmptyError' || error?.message?.includes('no elements in sequence')) {
          console.warn('[Auth] EmptyError fetching token - treating as transient failure');
          throw new Error('Failed to fetch token: no response from server');
        }
        throw error; // Re-throw other errors
      }

      const { token, sessionId } = response;

      // Update cache and storage
      this.tokenCache.set(token);
      this.saveTokenToStorage(token);

      // Update sessionId in localStorage if backend provided a new one
      if (sessionId && sessionId !== existingSessionId) {
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
          console.log('[Auth] Updated sessionId:', sessionId.substring(0, 20) + '...');
        } catch (error) {
          console.warn('[Auth] Failed to save sessionId', error);
        }
      }

      console.log('[Auth] ✅ JWT token acquired');

      // Request session cookie for SSE authentication
      // This is done in background - don't block token return
      this.requestSessionCookie(token).catch((error: unknown) => {
        console.warn('[Auth] Failed to obtain session cookie (SSE auth may fail):', error);
      });

      return token;

    } catch (error) {
      console.error('[Auth] Failed to fetch token from backend', error);

      // Re-throw with better context
      if (error instanceof HttpErrorResponse) {
        throw new Error(`Failed to authenticate: ${error.status} ${error.statusText}`);
      }
      throw error;
    }
  }
}
