import { Injectable, signal, computed, inject } from '@angular/core';
import { FoodService } from './food.service';

@Injectable()
export class FoodFacade {
    private api = inject(FoodService);

    log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
    input = signal<string>('');
    pending = signal<boolean>(false);
    language = signal<'mirror' | 'he' | 'en' | 'ar'>('mirror'); // auto-detects from input

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
        this.log.update(list => [...list, { role: 'user', text: t }]);
        // auto-detect and set language
        const detected = this.detectLanguage(t);
        this.language.set(detected);
        this.input.set('');
        this.pending.set(true);
        const lang = this.language();
        // No regex parsing; rely on future NLU or explicit inputs.
        this.api.search({ language: lang }).subscribe({
            next: (resp) => {
                const names = Array.isArray(resp?.restaurants) ? resp.restaurants.map((r: any) => `• ${r.name} — ${r.address || ''}`).join('\n') : 'No results';
                const msg = names || 'No results';
                this.log.update(list => [...list, { role: 'assistant', text: msg }]);
            },
            error: (err) => {
                this.log.update(list => [...list, { role: 'assistant', text: 'Something went wrong. Please try again.' }]);
                console.error('food search error', err);
            },
            complete: () => this.pending.set(false)
        });
    }
}


