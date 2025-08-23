import { Component, signal, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../chat.service';

@Component({
    selector: 'app-chat-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chat-page.component.html',
    styleUrl: './chat-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPageComponent {
    input = '';
    language: 'mirror' | 'he' | 'en' = 'mirror';
    log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
    pending = signal(false);
    error = signal<string | null>(null);
    results = signal<{ vendors: any[]; items: any[]; rawLlm?: string } | null>(null);
    page = 0;
    limit = 20;
    hints = signal<{ label: string; patch: Record<string, unknown> }[] | null>(null);
    cards = signal<{ title: string; subtitle?: string; url: string; source?: string; imageUrl?: string }[] | null>(null);
    query = signal<any | null>(null);
    chips = signal<{ label: string; active: boolean; patch: Record<string, unknown> }[]>([
        { label: 'Vegan', active: false, patch: { dietary: ['vegan'] } },
        { label: '≤ ₪60', active: false, patch: { maxPrice: 60 } },
        { label: '≤ 30m ETA', active: false, patch: { deliveryEtaMinutes: 30 } },
        { label: 'Near', active: false, patch: {} },
        { label: 'Kosher', active: false, patch: { dietary: ['kosher'] } }
    ]);

    top3 = computed(() => (this.results()?.vendors || []).slice(0, 3));
    private controller: AbortController | null = null;
    constructor(private chat: ChatService) { }

    async send() {
        const msg = this.input.trim();
        if (!msg || this.pending()) return;
        this.log.update((l) => [...l, { role: 'user', text: msg }]);
        this.input = '';
        this.pending.set(true);
        this.error.set(null);
        // prevent stale results while awaiting new response
        this.results.set(null);
        this.controller?.abort();
        this.controller = new AbortController();
        try {
            this.page = 0;
            const { reply, action, uiHints } = await this.chat.ask(msg, this.language, this.controller.signal);
            this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
            this.debugResponse(action);
            if (action?.action === 'results') {
                this.results.set({ vendors: action.data.vendors || [], items: action.data.items || [], rawLlm: (action.data as any).rawLlm });
                this.query.set(action.data.query || null);
                this.cards.set(null);
            }
            if ((action as any)?.action === 'card') {
                const cards = (action as any).data?.cards || [];
                this.results.set(null); // clear any prior stub results
                this.cards.set(cards);
            }
            this.hints.set(uiHints && uiHints.length ? uiHints : null);
        } catch (e: any) {
            this.error.set(e?.message || 'Request failed');
        } finally {
            this.pending.set(false);
            this.controller = null;
        }
    }

    async pick(h: { label: string; patch: Record<string, unknown> }) {
        if (this.pending()) return;
        this.pending.set(true);
        this.error.set(null);
        this.results.set(null);
        this.controller?.abort();
        this.controller = new AbortController();
        try {
            const { reply, action, uiHints } = await this.chat.clarify(h.patch, this.language, this.controller.signal);
            this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
            this.debugResponse(action);
            if (action?.action === 'results') {
                this.results.set({ vendors: action.data.vendors || [], items: action.data.items || [], rawLlm: (action.data as any).rawLlm });
                this.query.set(action.data.query || null);
                this.cards.set(null);
            }
            if ((action as any)?.action === 'card') {
                const cards = (action as any).data?.cards || [];
                this.results.set(null); // clear any prior stub results
                this.cards.set(cards);
            }
            this.hints.set(uiHints && uiHints.length ? uiHints : null);
        } catch (e: any) {
            this.error.set(e?.message || 'Request failed');
        } finally {
            this.pending.set(false);
            this.controller = null;
        }
    }

    async loadMore() {
        if (this.pending()) return;
        this.pending.set(true);
        this.controller?.abort();
        this.controller = new AbortController();
        try {
            this.page += 1;
            const userLog = this.log();
            let lastUserText = '';
            for (let i = userLog.length - 1; i >= 0; i--) {
                if (userLog[i].role === 'user') { lastUserText = userLog[i].text; break; }
            }
            const req$ = this.chat['http'].post<any>('/api/chat', {
                message: lastUserText,
                language: this.language,
                page: this.page,
                limit: this.limit
            });
            const res = await Promise.resolve(req$).then(obs => obs.toPromise?.() || null);
            if (res && res['action']?.action === 'results') {
                const prev = this.results();
                const nextV = [...(prev?.vendors || []), ...(res.action.data.vendors || [])];
                this.results.set({ vendors: nextV, items: prev?.items || [], rawLlm: res.action.data.rawLlm || prev?.rawLlm });
            }
        } catch { }
        finally {
            this.pending.set(false);
            this.controller = null;
        }
    }

    itemsForVendor(vendorId: string) {
        const r = this.results();
        return (r?.items || []).filter(i => i.vendorId === vendorId);
    }

    minPriceForVendor(vendorId: string): number | null {
        const items = this.itemsForVendor(vendorId);
        if (!items.length) return null;
        return items.reduce((min, i) => Math.min(min, Number(i.price) || Infinity), Infinity);
    }

    countItemsForVendor(vendorId: string): number {
        return this.itemsForVendor(vendorId).length;
    }

    isMissing(v: any): boolean {
        if (Array.isArray(v)) return v.length === 0;
        return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    }

    display(v: any): string {
        if (this.isMissing(v)) return '-';
        if (Array.isArray(v)) return v.join(', ');
        return String(v);
    }

    private debugResponse(action: any) {
        try {
            if (!action) return;
            const kind = action.action;
            const meta = kind === 'results'
                ? { vendors: action.data?.vendors?.length ?? 0, items: action.data?.items?.length ?? 0 }
                : kind === 'card'
                    ? { cards: action.data?.cards?.length ?? 0 }
                    : {};
            // Simple alert for quick debugging as requested
            // alert(`action=${kind} ${JSON.stringify(meta)}`);
            // Also log full action to console
            // eslint-disable-next-line no-console
            console.log('API action', action);
        } catch { }
    }

    toggleChip(idx: number) {
        const arr = [...this.chips()];
        arr[idx] = { ...arr[idx], active: !arr[idx].active };
        this.chips.set(arr);
        this.applyActiveChips();
    }

    private async applyActiveChips() {
        if (this.pending()) return;
        const active = this.chips().filter(c => c.active).map(c => c.patch);
        const patch = active.reduce((acc, p) => ({ ...acc, ...p }), {} as Record<string, unknown>);
        if (Object.keys(patch).length === 0) return; // nothing to do
        await this.pick({ label: 'refine', patch });
    }

    trackByVendor = (_: number, v: any) => v.id || v.name || _;

    vendorUrl(v: any): string {
        const q = encodeURIComponent(`${v.name || ''} ${v.address || ''}`.trim());
        return `https://www.google.com/search?q=${q}`;
    }

    mapsUrl(v: any): string {
        const q = encodeURIComponent(`${v.name || ''} ${v.address || ''}`.trim());
        return `https://www.google.com/maps/search/${q}`;
    }
}


