/**
 * Session Bootstrap Service
 * Handles server-authoritative session initialization
 * 
 * Flow:
 * 1. POST /api/v1/auth/bootstrap (public endpoint)
 * 2. Server creates session in Redis
 * 3. Server sets HttpOnly session cookie
 * 4. Frontend can now make authenticated requests
 * 
 * No localStorage usage - purely server-managed sessions
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface BootstrapResponse {
  ok: boolean;
  sessionId?: string;
  traceId?: string;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SessionBootstrapService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;
  private bootstrapping = false;
  private bootstrapPromise: Promise<void> | null = null;

  /**
   * Bootstrap session with server
   * Creates new session and receives HttpOnly cookie
   * 
   * @throws Error if Redis unavailable (503)
   * @throws Error if bootstrap fails
   */
  async bootstrap(): Promise<void> {
    // Prevent concurrent bootstrap calls
    if (this.bootstrapPromise) {
      console.debug('[SessionBootstrap] bootstrap_already_in_progress - waiting', {
        timestamp: new Date().toISOString()
      });
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = this.doBootstrap();
    
    try {
      await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
  }

  /**
   * Internal bootstrap implementation
   */
  private async doBootstrap(): Promise<void> {
    console.debug('[SessionBootstrap] bootstrap_triggered', {
      timestamp: new Date().toISOString()
    });

    try {
      const response = await firstValueFrom(
        this.http.post<BootstrapResponse>(
          `${this.baseUrl}/auth/bootstrap`,
          {},
          { 
            withCredentials: true // CRITICAL: enables cookie storage
          }
        )
      );

      if (response.ok) {
        console.debug('[SessionBootstrap] bootstrap_success', {
          sessionIdPreview: response.sessionId,
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(`Bootstrap failed: ${response.error || 'unknown'}`);
      }

    } catch (error: any) {
      // Handle Redis unavailability (503)
      if (error?.status === 503) {
        const errorCode = error?.error?.error;
        if (errorCode === 'REDIS_UNAVAILABLE') {
          console.error('[SessionBootstrap] bootstrap_failed_redis_unavailable', {
            status: 503,
            error: error?.error?.message
          });
          throw new Error('REDIS_UNAVAILABLE');
        }
      }

      // Other errors
      console.error('[SessionBootstrap] bootstrap_failed', {
        status: error?.status,
        error: error?.message || error
      });
      throw error;
    }
  }

  /**
   * Check if currently bootstrapping
   */
  isBootstrapping(): boolean {
    return this.bootstrapping;
  }
}
