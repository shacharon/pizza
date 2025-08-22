import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../chat.service';

@Component({
    selector: 'app-chat-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chat-page.component.html',
    styleUrl: './chat-page.component.scss'
})
export class ChatPageComponent {
    input = '';
    log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
    pending = signal(false);
    error = signal<string | null>(null);
    results = signal<{ vendors: any[]; items: any[] } | null>(null);
    private controller: AbortController | null = null;
    constructor(private chat: ChatService) { }

    async send() {
        const msg = this.input.trim();
        if (!msg || this.pending()) return;
        this.log.update((l) => [...l, { role: 'user', text: msg }]);
        this.input = '';
        this.pending.set(true);
        this.error.set(null);
        this.controller?.abort();
        this.controller = new AbortController();
        try {
            const { reply, action } = await this.chat.ask(msg, this.controller.signal);
            this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
            if (action?.action === 'results') {
                this.results.set({ vendors: action.data.vendors || [], items: action.data.items || [] });
            }
        } catch (e: any) {
            this.error.set(e?.message || 'Request failed');
        } finally {
            this.pending.set(false);
            this.controller = null;
        }
    }
}


