/**
 * Active Request ID Service
 * Central store for the current search requestId. Used to drop SSE/WS/HTTP
 * events that belong to a previous search (non-active requestId).
 */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ActiveRequestIdService {
  private readonly _activeRequestId = signal<string | undefined>(undefined);

  readonly activeRequestId = this._activeRequestId.asReadonly();

  set(requestId: string | undefined): void {
    this._activeRequestId.set(requestId);
  }
}
