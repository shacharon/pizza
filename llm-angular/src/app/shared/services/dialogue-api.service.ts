import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DialogueRequest, DialogueResponse } from '../../features/dialogue/dialogue.models';

/**
 * DialogueApiService
 * Handles HTTP communication with dialogue backend
 */
@Injectable({ providedIn: 'root' })
export class DialogueApiService {
    constructor(private readonly http: HttpClient) {}

    /**
     * Send message to dialogue API
     * 
     * @param request - Message and optional location
     * @param sessionId - Session ID for conversation continuity
     * @returns Observable of dialogue response
     */
    sendMessage(request: DialogueRequest, sessionId: string): Observable<DialogueResponse> {
        const headers = new HttpHeaders({ 'x-session-id': sessionId });
        
        return this.http.post<DialogueResponse>(
            '/api/dialogue',
            request,
            { headers }
        );
    }

    /**
     * Clear session (for testing/debugging)
     * 
     * @param sessionId - Session ID to clear
     */
    clearSession(sessionId: string): Observable<any> {
        return this.http.delete(`/api/dialogue/session/${sessionId}`);
    }

    /**
     * Get service stats (for monitoring)
     */
    getStats(): Observable<any> {
        return this.http.get('/api/dialogue/stats');
    }
}


