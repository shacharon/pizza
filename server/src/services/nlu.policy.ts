import type { ExtractedSlots } from './nlu.service.js';

export type Intent = 'search' | 'clarify_city' | 'clarify_type';
export type Action = 'fetch_results' | 'ask_clarification';

export interface PolicyResult {
    intent: Intent;
    action: Action;
    message?: string;
    hasAnchor: boolean;
    missingFields: string[];
}

export class NLUPolicy {

    /**
     * Determine intent and action based on extracted slots
     * Anchor = city/location is required. Everything else is optional enhancement.
     */
    decide(slots: ExtractedSlots, language: string, confidence: number): PolicyResult {
        const hasCity = !!slots.city?.trim();
        const hasType = !!slots.type;
        const hasPrice = !!slots.maxPrice;

        // City is the anchor - if we have it, we can search
        if (hasCity) {
            return {
                intent: 'search',
                action: 'fetch_results',
                hasAnchor: true,
                missingFields: []
            };
        }

        // No city = no anchor = need clarification
        if (!hasCity) {
            return {
                intent: 'clarify_city',
                action: 'ask_clarification',
                message: this.getCityPrompt(language),
                hasAnchor: false,
                missingFields: ['city']
            };
        }

        // Fallback (shouldn't reach here with current logic)
        return {
            intent: 'clarify_city',
            action: 'ask_clarification',
            message: this.getCityPrompt(language),
            hasAnchor: false,
            missingFields: ['city']
        };
    }

    private getCityPrompt(language: string): string {
        switch (language) {
            case 'he':
                return 'באיזה עיר אתה רוצה לחפש?';
            case 'ar':
                return 'في أي مدينة تريد البحث؟';
            case 'en':
            default:
                return 'In which city should I search?';
        }
    }

    private getTypePrompt(language: string): string {
        switch (language) {
            case 'he':
                return 'איזה סוג אוכל אתה מעדיף - פיצה, סושי, המבורגרים, או משהו אחר?';
            case 'ar':
                return 'ما نوع الطعام الذي تفضل - بيتزا، سوشي، برجر، أم شيء آخر؟';
            case 'en':
            default:
                return 'What kind of food do you prefer — pizza, sushi, burgers, or something else?';
        }
    }
}

// Export singleton instance
export const nluPolicy = new NLUPolicy();
