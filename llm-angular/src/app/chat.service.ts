import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ChatAction } from '@api';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private http = inject(HttpClient);
    private sessionId: string | null = null;

    async ask(message: string, language: 'mirror' | 'he' | 'en', signal?: AbortSignal): Promise<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string; guard?: string | null }> {
        const input = message.trim();
        if (!input) throw new Error('Please enter a message.');
        if (input.length > 4000) throw new Error('Message is too long.');
        const req$ = this.http.post<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string }>(
            '/api/chat',
            { message: input, language },
            { observe: 'response' as const }
        );
        const res = await firstValueFrom(
            signal ? req$.pipe(takeUntil(fromEvent(signal, 'abort'))) : req$
        );
        const sid = res.headers.get('x-session-id');
        if (sid) this.sessionId = sid;
        const guard = res.headers.get('x-guard');
        return { ...(res.body as any), guard };
    }

    async clarify(patch: Record<string, unknown>, language: 'mirror' | 'he' | 'en', signal?: AbortSignal): Promise<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string; guard?: string | null }> {
        const req$ = this.http.post<{ reply: string; action?: ChatAction; uiHints?: { label: string; patch: Record<string, unknown> }[]; state?: string }>(
            '/api/chat',
            { patch, language },
            { observe: 'response' as const, headers: this.sessionId ? { 'x-session-id': this.sessionId } : undefined }
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
