import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { ENDPOINTS } from '../shared/api/api.config';

const SENT_KEY = 'g2eLandingSent';

/**
 * Logs that someone opened a tracked link (`/q` or `/p/<name>`), even if they never search.
 * Sent once per entry per browser tab, so a refresh does not count twice.
 */
@Injectable({ providedIn: 'root' })
export class LandingOpenLogService {
  private readonly http = inject(HttpClient, { optional: true });

  track(entry: string): void {
    if (!this.http || !entry || this.alreadySent(entry)) return;
    this.markSent(entry);
    this.http.post(ENDPOINTS.ANALYTICS_EVENTS, {
      event: 'landing_open',
      data: { entry }
    }).pipe(catchError(() => of(null))).subscribe();
  }

  private alreadySent(entry: string): boolean {
    try {
      return (sessionStorage.getItem(SENT_KEY) || '').split(',').includes(entry);
    } catch {
      return false;
    }
  }

  private markSent(entry: string): void {
    try {
      const sent = (sessionStorage.getItem(SENT_KEY) || '').split(',').filter(Boolean);
      sessionStorage.setItem(SENT_KEY, [...sent, entry].join(','));
    } catch {
      /* private mode */
    }
  }
}
