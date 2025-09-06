import { Injectable, signal, computed, inject } from '@angular/core';
import { FoodService, type NLUResponse } from './food.service';
import { SmartChipsService, SmartChip } from './smart-chips.service';

@Injectable()
export class FoodFacade {
    private api = inject(FoodService);
    private chipsService = inject(SmartChipsService);

    log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
    input = signal<string>('');
    pending = signal<boolean>(false);
    language = signal<'mirror' | 'he' | 'en' | 'ar'>('mirror'); // auto-detects from input
    restaurants = signal<any[]>([]);
    summary = signal<string | null>(null);
    chips = signal<SmartChip[]>([]);

    private detectLanguage(text: string): 'he' | 'en' | 'ar' {
        // Simple heuristic: check first char script; default EN
        const first = (text || '').trim().charAt(0);
        if (/[\u0590-\u05FF]/.test(first)) return 'he';
        if (/[\u0600-\u06FF]/.test(first)) return 'ar';
        return 'en';
    }

    onInputChange(text: string) {
        this.input.set(text);
        const detected = this.detectLanguage(text || '');
        this.language.set(detected);
    }

    send(text?: string) {
        const t = (text ?? this.input() ?? '').trim();
        if (!t || this.pending()) return;

        // Add user message to log
        this.log.update(list => [...list, { role: 'user', text: t }]);

        // Auto-detect and set language
        const detected = this.detectLanguage(t);
        this.language.set(detected);
        this.input.set('');
        this.pending.set(true);

        // Call NLU endpoint (stable path)
        this.api.parseAndSearch({ text: t, language: detected }).subscribe({
            next: (response: NLUResponse) => {
                this.handleNLUResponse(response);
            },
            error: (err) => {
                this.log.update(list => [...list, {
                    role: 'assistant',
                    text: 'Sorry, I had trouble understanding your request. Could you try rephrasing?'
                }]);
                console.error('NLU error', err);
            },
            complete: () => this.pending.set(false)
        });
    }

    private handleNLUResponse(response: NLUResponse) {
        if (response.type === 'results') {
            // Display restaurant results
            const restaurants = response.restaurants || [];
            this.restaurants.set(restaurants);
            this.summary.set((response as any).message || null);

            // Generate smart chips from results
            const chips = this.chipsService.generateChips({
                nluSlots: (response as any).extractedSlots,
                results: response.restaurants,
                lastQuery: response.query,
                language: response.query.language as 'he' | 'en' | 'ar'
            });
            this.chips.set(chips);

            if (restaurants.length === 0) {
                this.log.update(list => [...list, {
                    role: 'assistant',
                    text: `No restaurants found in ${response.query.city}. Try another area or type?`
                }]);
            } else {
                const summary = (response as any).message
                    || `Here are places I found in ${response.query.city}. You can refine by type, price, or dietary.`;
                this.log.update(list => [...list, { role: 'assistant', text: summary }]);
            }
        } else if (response.type === 'clarify') {
            // Ask for clarification
            this.log.update(list => [...list, {
                role: 'assistant',
                text: response.message
            }]);
        }
    }

    onChipClick(chip: SmartChip) {
        // When a chip is clicked, send its label as a new user query
        this.send(chip.label);

        // Update chip state to 'active'
        const updatedChips = this.chipsService.activateChip(chip.id, this.chips());
        this.chips.set(updatedChips);
    }

    onChipDismiss(chipId: string) {
        // Dismiss the chip and update preferences
        this.chipsService.dismissChip(chipId);

        // Visually remove the chip from the current list
        this.chips.update(chips => chips.filter(c => c.id !== chipId));
    }
}


