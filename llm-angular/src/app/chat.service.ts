import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ChatAction } from '@api';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private http = inject(HttpClient);

    async ask(message: string, signal?: AbortSignal): Promise<{ reply: string; action?: ChatAction }> {
        const input = message.trim();
        if (!input) throw new Error('Please enter a message.');
        if (input.length > 4000) throw new Error('Message is too long.');
        const req$ = this.http.post<{ reply: string; action?: ChatAction }>(
            '/api/chat',
            { message: input }
        );
        const res = await firstValueFrom(
            signal ? req$.pipe(takeUntil(fromEvent(signal, 'abort'))) : req$
        );
        return res;
    }
}
