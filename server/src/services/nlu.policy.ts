import type { ExtractedSlots } from './nlu.service.js';

export type Intent = 'search' | 'clarify_city' | 'clarify_type' | 'clarify_price' | 'clarify_not_food';
export type Action = 'fetch_results' | 'ask_clarification' | 'clarify_not_food';

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
        return {
            intent: 'clarify_city',
            action: 'ask_clarification',
            message: this.getCityPrompt(language),
            hasAnchor: false,
            missingFields: ['city']
        };
    }

    /**
     * Contextual clarification - when user mentions price/type but we need more info
     */
    decideContextual(slots: ExtractedSlots, userText: string, language: string): PolicyResult {
        const hasCity = !!slots.city?.trim();
        const lowerText = userText.toLowerCase();

        // If a type was extracted but it's not a food, clarify with the user
        if (slots.type && slots.isFood === false) {
            return {
                intent: 'clarify_not_food',
                action: 'clarify_not_food',
                message: this.getNotFoodPrompt(language, slots.type),
                hasAnchor: hasCity,
                missingFields: []
            };
        }

        // If user mentioned price-related words but no specific amount
        if ((lowerText.includes('מחיר') || lowerText.includes('price') || lowerText.includes('תקציב') || lowerText.includes('budget')) && !slots.maxPrice) {
            return {
                intent: 'clarify_price',
                action: 'ask_clarification',
                message: this.getPricePrompt(language),
                hasAnchor: hasCity,
                missingFields: hasCity ? ['maxPrice'] : ['city', 'maxPrice']
            };
        }

        // Default to city if missing
        if (!hasCity) {
            return {
                intent: 'clarify_city',
                action: 'ask_clarification',
                message: this.getCityPrompt(language),
                hasAnchor: false,
                missingFields: ['city']
            };
        }

        // Has city, can search
        return {
            intent: 'search',
            action: 'fetch_results',
            hasAnchor: true,
            missingFields: []
        };
    }

    private getCityPrompt(language: string): string {
        switch (language) {
            case 'he':
                return 'באיזה עיר לחפש? למשל: תל אביב, ירושלים, חיפה. אפשר לכתוב כל עיר.';
            case 'ar':
                return 'في أي مدينة أبحث؟ مثلاً: تل أبيب، القدس، حيفا. يمكنك كتابة أي مدينة.';
            case 'en':
            default:
                return 'In which city should I search? For example: Tel Aviv, Jerusalem, Haifa. You can type any city.';
        }
    }

    private getPricePrompt(language: string): string {
        switch (language) {
            case 'he':
                return 'איזה תקציב? למשל: עד 60 שקל, עד 100 שקל.';
            case 'ar':
                return 'ما هي الميزانية؟ مثلاً: حتى 60 شيكل، حتى 100 شيكل.';
            case 'en':
            default:
                return 'What\'s your budget? For example: up to ₪60, up to ₪100.';
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

    private getNotFoodPrompt(language: string, type: string): string {
        switch (language) {
            case 'he':
                return `"${type}" לא נשמע כמו אוכל. התכוונתי לחפש את זה, אבל עצרתי. אפשר לנסות סוג אוכל אחר?`;
            case 'ar':
                return `"${type}" لا يبدو طعامًا. كنت سأبحث عنه، لكنني توقفت. هل يمكنك تجربة نوع آخر من الطعام؟`;
            case 'en':
            default:
                return `"${type}" doesn't sound like a food. I was going to search for it, but I stopped. Could you try a different type of food?`;
        }
    }
}

// Export singleton instance
export const nluPolicy = new NLUPolicy();
