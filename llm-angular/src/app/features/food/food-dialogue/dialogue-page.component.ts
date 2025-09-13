import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FoodService } from '../food.service';

@Component({
    selector: 'app-dialogue-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './dialogue-page.component.html',
    styleUrls: ['./dialogue-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialoguePageComponent {
    private api = inject(FoodService);

    input = signal<string>('');
    pending = signal<boolean>(false);
    sessionId = signal<string>('dialogue-' + Math.random().toString(36).slice(2));

    message = signal<string>('');
    restaurants = signal<any[]>([]);
    chips = signal<{ label: string; patch: Record<string, unknown> }[]>([]);

    async send() {
        const text = (this.input() || '').trim();
        if (!text || this.pending()) return;
        this.pending.set(true);
        try {
            const res = await this.api.dialogue(text, this.sessionId()).toPromise();
            if (!res) return;
            this.message.set((res as any).message || '');
            this.restaurants.set((res as any).restaurants || []);
            this.chips.set((res as any).chips || []);
            this.input.set('');
        } finally {
            this.pending.set(false);
        }
    }

    async applyChip(patch: Record<string, unknown>) {
        if (this.pending()) return;
        this.pending.set(true);
        try {
            const res = await this.api.dialogue(JSON.stringify(patch), this.sessionId()).toPromise();
            if (!res) return;
            this.message.set((res as any).message || '');
            this.restaurants.set((res as any).restaurants || []);
            this.chips.set((res as any).chips || []);
        } finally {
            this.pending.set(false);
        }
    }
}


