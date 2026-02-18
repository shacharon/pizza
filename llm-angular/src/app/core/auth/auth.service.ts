/**
 * Cookie-Only Authentication Service
 * - No JWT
 * - No localStorage
 * - Ensures HttpOnly session cookie exists via POST /api/v1/auth/bootstrap
 */

import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface BootstrapResponse {
  ok: boolean;
  sessionId?: string; // optional debug
  traceId?: string;
}

const BOOTSTRAP_PATH = '/auth/bootstrap';
/** Relative path for same-origin (e.g. dev proxy). Use apiUrl + apiBasePath + path when apiUrl is set (prod). */
function getBootstrapUrl(): string {
  const base = (environment as { apiUrl?: string }).apiUrl;
  const apiBasePath = (environment as { apiBasePath?: string }).apiBasePath ?? '/api/v1';
  if (base) return `${base.replace(/\/$/, '')}${apiBasePath}${BOOTSTRAP_PATH}`;
  return `${apiBasePath}${BOOTSTRAP_PATH}`;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private bootstrapped = signal(false);
  private bootstrapPromise: Promise<void> | null = null;
  /** Session ID from bootstrap response; used for WS subscribe (matches HttpOnly cookie session). */
  private sessionIdFromBootstrap = signal<string>('');

  constructor(private http: HttpClient) { }

  /** Cookie-only: ensure session cookie exists (idempotent). */
  async ensureSession(): Promise<void> {
    // If you still keep env.authMode for transition, respect it:
    if ((environment as { authMode?: string }).authMode && (environment as { authMode?: string }).authMode !== 'cookie_only') {
      return; // non-cookie-only mode handled elsewhere
    }

    if (this.bootstrapped()) return;
    if (this.bootstrapPromise) return this.bootstrapPromise;

    this.bootstrapPromise = (async () => {
      try {
        const url =
          (globalThis as any)?.ENDPOINTS?.AUTH_BOOTSTRAP ??
          (environment as any)?.endpoints?.authBootstrap ??
          getBootstrapUrl();

        const res = await firstValueFrom(
          this.http.post<BootstrapResponse>(url, {}, { withCredentials: true })
        );

        if (!res?.ok) throw new Error('Bootstrap failed: ok=false');
        if (res.sessionId) this.sessionIdFromBootstrap.set(res.sessionId);
        this.bootstrapped.set(true);
      } catch (e) {
        this.bootstrapped.set(false);
        if (e instanceof HttpErrorResponse) {
          throw new Error(`Auth bootstrap failed: ${e.status} ${e.statusText}`);
        }
        throw e;
      } finally {
        this.bootstrapPromise = null;
      }
    })();

    return this.bootstrapPromise;
  }

  /** Compatibility: in cookie-only there is no token. */
  async getToken(): Promise<string> {
    return '';
  }

  /** Compatibility no-op. */
  async refreshToken(): Promise<string> {
    return '';
  }

  /** Compatibility no-op. */
  clearToken(): void { }

  /** Cookie-only: return sessionId from bootstrap response (for WS subscribe); matches HttpOnly cookie. */
  getSessionId(): string {
    return this.sessionIdFromBootstrap() ?? '';
  }
}
