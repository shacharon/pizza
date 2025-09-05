import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResultsTableComponent } from '../../shared/components/results-table/results-table.component';
import { RefineChipsComponent } from '../../chat-widgets/refine-chips/refine-chips.component';
import { SummaryCardComponent } from '../../chat-widgets/summary-card/summary-card.component';
import { ChatComposerComponent } from '../../chat-widgets/composer/chat-composer.component';
import { GuardNoteComponent } from '../../chat-widgets/guard-note/guard-note.component';
import { ChatLogComponent } from '../../chat-widgets/chat-log/chat-log.component';
import { ChatFacade } from './chat.facade';
import { PrefsService } from '../../shared/services/prefs.service';
import { ChatService } from '../../chat.service';


@Component({
    selector: 'app-chat-page',
    standalone: true,
    imports: [CommonModule, FormsModule, ResultsTableComponent, RefineChipsComponent, SummaryCardComponent, ChatComposerComponent, GuardNoteComponent, ChatLogComponent],
    providers: [ChatFacade, PrefsService, ChatService],
    templateUrl: './chat-page.component.html',
    styleUrls: ['./chat-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPageComponent {
    input = ''; // View-only state
    facade = inject(ChatFacade);
    prefs = inject(PrefsService);

    // Expose signals for template
    log = this.facade.log;
    pending = this.facade.pending;
    error = this.facade.error;
    guard = this.facade.guard;
    results = this.facade.results;
    hints = this.facade.hints;
    cards = this.facade.cards;
    query = this.facade.query;
    chips = this.facade.chips;

    top3 = computed(() => (this.results()?.vendors || []).slice(0, 3));

    constructor() {
        // restore prefs
        const pref = this.prefs.load();
        if (pref.language) this.facade.language.set(pref.language as 'mirror' | 'he' | 'en' | 'ar');
        if (Array.isArray(pref.chips)) {
            try { this.facade.chips.set(pref.chips as any); } catch { }
        }
        if (typeof pref.lastMessage === 'string') this.input = pref.lastMessage;
    }

    send() {
        this.facade.send(this.input);
        this.input = '';
    }

    pick(h: { label: string; patch: Record<string, unknown> }) {
        this.facade.pick(h.patch);
    }

    toggleChip(idx: number) {
        this.facade.toggleChip(idx);
    }

    clearAllChips() {
        this.facade.clearAllChips();
    }

    loadMore() {
        this.facade.loadMore();
    }

    // View-only logic (delegates to facade helpers if needed)
    itemsForVendor(vendorId: string) {
        return this.facade.itemsForVendor(vendorId);
    }

    minPriceForVendor(vendorId: string): number | null {
        return this.facade.minPriceForVendor(vendorId);
    }

    countItemsForVendor(vendorId: string): number {
        return this.facade.countItemsForVendor(vendorId);
    }

    isMissing(v: any): boolean {
        return this.facade.isMissing(v);
    }

    display(v: any): string {
        return this.facade.display(v);
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


