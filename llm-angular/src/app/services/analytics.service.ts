/**
 * Analytics Service
 * Tracks user events and sends to backend
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SessionStore } from '../state/session.store';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly apiUrl = '/api/analytics/events';
  private readonly isProduction = false; // TODO: Get from environment

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

    // Log to console in development
    if (!this.isProduction) {
      console.log('[Analytics]', enriched);
    }

    // Send to backend (fire and forget)
    this.http.post(this.apiUrl, enriched).subscribe({
      next: () => {
        // Success - no action needed
      },
      error: (err) => {
        console.warn('[Analytics] Failed to send event:', err.message);
      }
    });
  }

  trackError(error: Error, context?: Record<string, any>): void {
    this.track('error', {
      message: error.message,
      stack: error.stack,
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











