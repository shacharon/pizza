import { Injectable, signal } from '@angular/core';
import { ChatService } from '../../chat.service';
import { PrefsService } from '../../shared/services/prefs.service';
import { debounceTime, Subject } from 'rxjs';

@Injectable()
export class ChatFacade {

    // State Signals
    language = signal<'mirror' | 'he' | 'en'>('mirror');
    log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
    pending = signal(false);
    error = signal<string | null>(null);
    guard = signal<string | null>(null);
    results = signal<{ vendors: any[]; items: any[]; rawLlm?: string } | null>(null);
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

    // Private state
    private page = 0;
    private limit = 20;
    private controller: AbortController | null = null;
    private chipToggle$ = new Subject<void>();

    constructor(private chat: ChatService, private prefs: PrefsService) {
        this.chipToggle$.pipe(debounceTime(300)).subscribe(() => {
            this.applyActiveChips();
            this.prefs.save({ chips: this.chips() });
        });
    }

    // Public Methods (Actions)

    async send(msg: string) {
        const message = msg.trim();
        if (!message || this.pending()) return;
        this.prefs.save({ lastMessage: message, language: this.language() });
        this.log.update((l) => [...l, { role: 'user', text: message }]);
        this.pending.set(true);
        this.error.set(null);
        this.results.set(null);
        this.controller?.abort();
        this.controller = new AbortController();
        try {
            this.page = 0;
            const { reply, action, uiHints, guard } = await this.chat.ask(message, this.language(), this.controller.signal);
            this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
            this.guard.set(guard || null);
            this.handleAction(action);
            this.hints.set(uiHints && uiHints.length ? uiHints : null);
        } catch (e: any) {
            this.error.set(e?.message || 'Request failed');
        } finally {
            this.pending.set(false);
            this.controller = null;
        }
    }

    async pick(patch: Record<string, unknown>) {
        if (this.pending()) return;
        this.pending.set(true);
        this.error.set(null);
        this.results.set(null);
        this.controller?.abort();
        this.controller = new AbortController();
        try {
            const { reply, action, uiHints, guard } = await this.chat.clarify(patch, this.language(), this.controller.signal);
            this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
            this.guard.set(guard || null);
            this.handleAction(action);
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
            // get last user message
            const userLog = this.log();
            let lastUserText = '';
            for (let i = userLog.length - 1; i >= 0; i--) {
                if (userLog[i].role === 'user') { lastUserText = userLog[i].text; break; }
            }
            const req$ = (this.chat as any)['http'].post('/api/chat', {
                message: lastUserText,
                language: this.language(),
                page: this.page,
                limit: this.limit
            });
            const res = await Promise.resolve(req$).then((obs: any) => obs.toPromise?.() || null);
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

    toggleChip(idx: number) {
        const arr = [...this.chips()];
        arr[idx] = { ...arr[idx], active: !arr[idx].active };
        this.chips.set(arr);
        this.chipToggle$.next();
    }

    clearAllChips() {
        this.chips.set(this.chips().map(c => ({ ...c, active: false })));
        this.chipToggle$.next();
    }

    // View helpers
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

    // Private Helpers

    private async applyActiveChips() {
        if (this.pending()) return;
        const active = this.chips().filter(c => c.active).map(c => c.patch);
        const patch = active.reduce((acc, p) => ({ ...acc, ...p }), {} as Record<string, unknown>);
        if (Object.keys(patch).length === 0) return; // nothing to do
        await this.pick(patch);
    }

    private handleAction(action: any) {
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
    }
}
