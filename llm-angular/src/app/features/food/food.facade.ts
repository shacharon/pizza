import { Injectable, signal, computed, inject } from '@angular/core';
import { FoodService, type NLUResponse } from './food.service';

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

        // Add user message to log
        this.log.update(list => [...list, { role: 'user', text: t }]);

        // Auto-detect and set language
        const detected = this.detectLanguage(t);
        this.language.set(detected);
        this.input.set('');
        this.pending.set(true);

        // Call NLU endpoint
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
            if (restaurants.length === 0) {
                this.log.update(list => [...list, {
                    role: 'assistant',
                    text: `No restaurants found in ${response.query.city}. Try another area or type?`
                }]);
            } else {
                const resultText = restaurants
                    .map((r: any) => `• ${r.name} — ${r.address || ''}`)
                    .join('\n');

                const confidence = response.meta.nluConfidence;
                const confidenceText = confidence > 0.8 ? '' : ' (let me know if this isn\'t what you meant)';

                this.log.update(list => [...list, {
                    role: 'assistant',
                    text: `Here are restaurants in ${response.query.city}:\n\n${resultText}${confidenceText}`
                }]);
            }
        } else if (response.type === 'clarify') {
            // Ask for clarification
            this.log.update(list => [...list, {
                role: 'assistant',
                text: response.message
            }]);
        }
    }
}


