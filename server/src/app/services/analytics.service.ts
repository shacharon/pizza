/**
 * Analytics Service
 * Tracks user events and sends to backend
 * 
 * IMPORTANT: Analytics failures must be NON-BLOCKING
 * Errors are logged but do not propagate to caller
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { SessionStore } from '../state/session.store';
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError } from '../shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly isProduction = false; // TODO: Get from environment

  /**
   * Track event (fire-and-forget, non-blocking)
   * 
   * PRODUCTION GUARDRAIL: Does not log full request body
   */
  track(event: string, data: Record<string, any> = {}): void {
    const enriched = {
      event,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionStore.conversationId(),
        userAgent: navigator.userAgent,
        locale: this.sessionStore.locale(),
        region: this.sessionStore.region()
      }
    };

    // Log to console in development (event name only, not full body)
    if (!this.isProduction) {
      console.log('[Analytics]', event, { timestamp: enriched.data.timestamp });
    }

    // Send to backend (fire and forget)
    this.http.post(ENDPOINTS.ANALYTICS_EVENTS, enriched).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError = mapApiError(error);
        
        // NON-BLOCKING: Log but do not throw
        if (apiError.traceId) {
          console.warn('[Analytics] Failed to send event:', event, 'traceId:', apiError.traceId);
        } else {
          console.warn('[Analytics] Failed to send event:', event, apiError.message);
        }
        
        return of(null);
      })
    ).subscribe();
  }

  trackError(error: Error, context?: Record<string, any>): void {
    this.track('error', {
      message: error.message,
      // PRODUCTION GUARDRAIL: Don't send full stack in production
      ...(this.isProduction ? {} : { stack: error.stack }),
      ...context
    });
  }

  trackTiming(label: string, durationMs: number, context?: Record<string, any>): void {
    this.track('timing', {
      label,
      durationMs,
      ...context
    });
  }
}













