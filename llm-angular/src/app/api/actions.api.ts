/**
 * Actions API Client
 * HTTP transport layer for action operations
 * Note: Backend approval endpoints are future work (Phase 2)
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { ActionProposal, ActionExecutionResult } from '../domain/types/action.types';

@Injectable({ providedIn: 'root' })
export class ActionsApiClient {
  private readonly apiUrl = '/api/actions';

  constructor(private http: HttpClient) {}

  /**
   * Future: Backend approval endpoint (Phase 2)
   * When backend implements action approval service
   */
  approveAction(actionId: string): Observable<ActionExecutionResult> {
    return this.http.post<ActionExecutionResult>(`${this.apiUrl}/${actionId}/approve`, {}).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Future: Get action status from backend
   */
  getActionStatus(actionId: string): Observable<ActionProposal> {
    return this.http.get<ActionProposal>(`${this.apiUrl}/${actionId}`).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    const message = error.error?.error || error.message || 'Action request failed';
    console.error('[ActionsApiClient] Error:', message);
    return throwError(() => new Error(message));
  }
}


