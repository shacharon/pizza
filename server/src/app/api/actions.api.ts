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
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class ActionsApiClient {
  constructor(private http: HttpClient) {}

  /**
   * Future: Backend approval endpoint (Phase 2)
   * When backend implements action approval service
   * @throws ApiErrorView on failure
   */
  approveAction(actionId: string): Observable<ActionExecutionResult> {
    return this.http.post<ActionExecutionResult>(`${ENDPOINTS.ACTIONS_BY_ID(actionId)}/approve`, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('ActionsApiClient.approveAction', apiError);
        return throwError(() => apiError);
      })
    );
  }

  /**
   * Future: Get action status from backend
   * @throws ApiErrorView on failure
   */
  getActionStatus(actionId: string): Observable<ActionProposal> {
    return this.http.get<ActionProposal>(ENDPOINTS.ACTIONS_BY_ID(actionId)).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('ActionsApiClient.getActionStatus', apiError);
        return throwError(() => apiError);
      })
    );
  }
}













