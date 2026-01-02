import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DialogueRequest, DialogueResponse } from '../../features/dialogue/dialogue.models';
import { ENDPOINTS } from '../api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../http/api-error.mapper';

/**
 * DialogueApiService
 * Handles HTTP communication with dialogue backend
 * 
 * Session Semantics:
 * - x-session-id is auto-attached by interceptor (for analytics/debugging)
 * - Dialogue conversation state is backend-managed separately
 */
@Injectable({ providedIn: 'root' })
export class DialogueApiService {
    constructor(private readonly http: HttpClient) {}

    /**
     * Send message to dialogue API
     * Note: x-session-id is automatically added by apiSessionInterceptor
     * 
     * @param request - Message and optional location
     * @param sessionId - Kept for backward compatibility, but unused (interceptor handles it)
     * @returns Observable of dialogue response or ApiErrorView
     */
    sendMessage(request: DialogueRequest, sessionId: string): Observable<DialogueResponse> {
        return this.http.post<DialogueResponse>(ENDPOINTS.DIALOGUE, request).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('DialogueApiService.sendMessage', apiError);
                return throwError(() => apiError);
            })
        );
    }

    /**
     * Clear session (for testing/debugging)
     * 
     * @param sessionId - Session ID to clear
     * @returns Observable or ApiErrorView
     */
    clearSession(sessionId: string): Observable<any> {
        return this.http.delete(ENDPOINTS.DIALOGUE_SESSION(sessionId)).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('DialogueApiService.clearSession', apiError);
                return throwError(() => apiError);
            })
        );
    }

    /**
     * Get service stats (for monitoring)
     * @returns Observable or ApiErrorView
     */
    getStats(): Observable<any> {
        return this.http.get(ENDPOINTS.DIALOGUE_STATS).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('DialogueApiService.getStats', apiError);
                return throwError(() => apiError);
            })
        );
    }
}


