import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
    private http = inject(HttpClient);

    async ask(message: string): Promise<string> {
        const res = await firstValueFrom(
            this.http.post<{ reply: string }>('/api/chat', { message })
        );
        return res.reply;
    }
}
