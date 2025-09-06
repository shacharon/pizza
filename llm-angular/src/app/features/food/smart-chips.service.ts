import { Injectable, signal } from '@angular/core';

export interface SmartChip {
    id: string;
    label: string;
    type: 'city' | 'cuisine' | 'price' | 'dietary' | 'time';
    value: any;
    state: 'suggested' | 'active' | 'dismissed';
    priority: number; // higher = more important
}

@Injectable({ providedIn: 'root' })
export class SmartChipsService {
    private preferences = this.loadPreferences();

    generateChips(context: {
        nluSlots?: any;
        results?: any[];
        lastQuery?: any;
        language?: 'he' | 'en' | 'ar';
    }): SmartChip[] {
        const chips: SmartChip[] = [];
        const { nluSlots, results, lastQuery, language = 'en' } = context;

        // From NLU slots
        if (nluSlots?.city && !lastQuery?.city) {
            chips.push({
                id: `city-${nluSlots.city}`,
                label: nluSlots.city,
                type: 'city',
                value: nluSlots.city,
                state: 'suggested',
                priority: 100
            });
        }

        // Cuisine suggestions
        if (!lastQuery?.type) {
            const cuisines = this.getCuisineSuggestions(language);
            cuisines.forEach((cuisine, i) => {
                chips.push({
                    id: `cuisine-${cuisine.value}`,
                    label: cuisine.label,
                    type: 'cuisine',
                    value: cuisine.value,
                    state: 'suggested',
                    priority: 80 - i * 10
                });
            });
        }

        // Price suggestions
        if (!lastQuery?.maxPrice) {
            const prices = this.getPriceSuggestions(language);
            prices.forEach((price, i) => {
                chips.push({
                    id: `price-${price.value}`,
                    label: price.label,
                    type: 'price',
                    value: price.value,
                    state: 'suggested',
                    priority: 70 - i * 5
                });
            });
        }

        // Dietary suggestions
        const dietary = this.getDietarySuggestions(language);
        dietary.forEach((diet, i) => {
            chips.push({
                id: `dietary-${diet.value}`,
                label: diet.label,
                type: 'dietary',
                value: diet.value,
                state: 'suggested',
                priority: 60 - i * 5
            });
        });

        // Time-based
        chips.push({
            id: 'open-now',
            label: language === 'he' ? 'פתוח עכשיו' : language === 'ar' ? 'مفتوح الآن' : 'Open now',
            type: 'time',
            value: { openNow: true },
            state: 'suggested',
            priority: 50
        });

        // Sort by priority, take top 6
        return chips
            .filter(c => !this.preferences.dismissed.includes(c.id))
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 6);
    }

    activateChip(chipId: string, chips: SmartChip[]): SmartChip[] {
        return chips.map(c =>
            c.id === chipId ? { ...c, state: 'active' as const } : c
        );
    }

    dismissChip(chipId: string): void {
        this.preferences.dismissed.push(chipId);
        this.savePreferences();
    }

    private getCuisineSuggestions(language: 'he' | 'en' | 'ar') {
        const cuisines = {
            he: [
                { label: 'פיצה', value: 'pizza' },
                { label: 'סושי', value: 'sushi' },
                { label: 'המבורגר', value: 'burger' }
            ],
            ar: [
                { label: 'بيتزا', value: 'pizza' },
                { label: 'سوشي', value: 'sushi' },
                { label: 'برجر', value: 'burger' }
            ],
            en: [
                { label: 'Pizza', value: 'pizza' },
                { label: 'Sushi', value: 'sushi' },
                { label: 'Burger', value: 'burger' }
            ]
        };
        return cuisines[language] || cuisines.en;
    }

    private getPriceSuggestions(language: 'he' | 'en' | 'ar') {
        return [
            { label: '≤₪60', value: 60 },
            { label: '≤₪100', value: 100 }
        ];
    }

    private getDietarySuggestions(language: 'he' | 'en' | 'ar') {
        const dietary = {
            he: [
                { label: 'כשר', value: 'kosher' },
                { label: 'טבעוני', value: 'vegan' }
            ],
            ar: [
                { label: 'حلال', value: 'halal' },
                { label: 'نباتي', value: 'vegan' }
            ],
            en: [
                { label: 'Kosher', value: 'kosher' },
                { label: 'Vegan', value: 'vegan' }
            ]
        };
        return dietary[language] || dietary.en;
    }

    private loadPreferences(): { dismissed: string[] } {
        try {
            const stored = localStorage.getItem('smart-chips-prefs');
            return stored ? JSON.parse(stored) : { dismissed: [] };
        } catch {
            return { dismissed: [] };
        }
    }

    private savePreferences(): void {
        try {
            localStorage.setItem('smart-chips-prefs', JSON.stringify(this.preferences));
        } catch { }
    }
}
