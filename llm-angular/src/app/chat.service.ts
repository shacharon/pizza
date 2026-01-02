import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, fromEvent, throwError } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import type { ChatAction } from '@api';
import { ENDPOINTS } from './shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from './shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private http = inject(HttpClient);
    private sessionId: string | null = null;

    /**
     * Ask chat endpoint
     * Note: x-session-id is automatically added by apiSessionInterceptor
     * 
     * @throws ApiErrorView (not Error) for API failures
     */
    async ask(message: string, language: 'mirror' | 'he' | 'en' | 'ar', signal?: AbortSignal): Promise<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string; guard?: string | null }> {
        const input = message.trim();
        if (!input) throw new Error('Please enter a message.');
        if (input.length > 4000) throw new Error('Message is too long.');
        
        const req$ = this.http.post<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string }>(
            ENDPOINTS.CHAT,
            { message: input, language },
            { observe: 'response' as const }
        ).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('ChatService.ask', apiError);
                return throwError(() => apiError);
            })
        );
        
        const res = await firstValueFrom(
            signal ? req$.pipe(takeUntil(fromEvent(signal, 'abort'))) : req$
        );
        
        const sid = res.headers.get('x-session-id');
        if (sid) this.sessionId = sid;
        const guard = res.headers.get('x-guard');
        return { ...(res.body as any), guard };
    }

    /**
     * Clarify chat endpoint
     * Note: x-session-id is automatically added by apiSessionInterceptor
     * 
     * @throws ApiErrorView (not Error) for API failures
     */
    async clarify(patch: Record<string, unknown>, language: 'mirror' | 'he' | 'en' | 'ar', signal?: AbortSignal): Promise<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string; guard?: string | null }> {
        const req$ = this.http.post<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string }>(
            ENDPOINTS.CHAT,
            { patch, language },
            { observe: 'response' as const }
        ).pipe(
            catchError((error: HttpErrorResponse) => {
                const apiError: ApiErrorView = mapApiError(error);
                logApiError('ChatService.clarify', apiError);
                return throwError(() => apiError);
            })
        );
        
        const res = await firstValueFrom(
            signal ? req$.pipe(takeUntil(fromEvent(signal, 'abort'))) : req$
        );
        
        const sid = res.headers.get('x-session-id');
        if (sid) this.sessionId = sid;
        const guard = res.headers.get('x-guard');
        return { ...(res.body as any), guard };
    }
}
