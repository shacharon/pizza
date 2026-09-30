import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { ENDPOINTS } from '../shared/api/api.config';
import { ActiveRequestIdService } from '../state/active-request-id.service';

export type ResultAction = 'open' | 'navigate' | 'call' | 'wolt' | 'tenbis' | 'mishloha';

@Injectable({ providedIn: 'root' })
export class ResultActionLogService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly activeRequestId = inject(ActiveRequestIdService, { optional: true });

  track(action: ResultAction, name: string | undefined): void {
    const safeName = String(name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
    if (!this.http || !safeName) return;
    this.http.post(ENDPOINTS.ANALYTICS_EVENTS, {
      event: 'result_action',
      data: {
        action,
        name: safeName,
        requestId: this.activeRequestId?.activeRequestId() || ''
      }
    }).pipe(catchError(() => of(null))).subscribe();
  }
}
