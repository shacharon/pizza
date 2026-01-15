import type { ExtractedSlots } from './nlu.service.js';
import { promptManager } from './prompt.service.js';

export const Intent = {
    Search: 'search',
    ClarifyCity: 'clarify_city',
    ClarifyType: 'clarify_type',
    ClarifyPrice: 'clarify_price',
    ClarifyNotFood: 'clarify_not_food',
} as const;
export type Intent = typeof Intent[keyof typeof Intent];

export const Action = {
    FetchResults: 'fetch_results',
    AskClarification: 'ask_clarification',
    ClarifyNotFood: 'clarify_not_food',
} as const;
export type Action = typeof Action[keyof typeof Action];

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
    decide(slots: ExtractedSlots, language: 'he' | 'en' | 'ar', confidence: number): PolicyResult {
        const hasCity = !!slots.city?.trim();
        const hasType = !!slots.type;
        const hasPrice = !!slots.maxPrice;

        // City is the anchor - if we have it, we can search
        if (hasCity) {
            return {
                intent: Intent.Search,
                action: Action.FetchResults,
                hasAnchor: true,
                missingFields: []
            };
        }

        // No city = no anchor = need clarification
        return {
            intent: Intent.ClarifyCity,
            action: Action.AskClarification,
            message: promptManager.get('clarify_city', language),
            hasAnchor: false,
            missingFields: ['city']
        };
    }

    /**
     * Contextual clarification - when user mentions price/type but we need more info
     */
    decideContextual(slots: ExtractedSlots, userText: string, language: 'he' | 'en' | 'ar'): PolicyResult {
        const hasCity = !!slots.city?.trim();
        const lowerText = userText.toLowerCase();

        // If a type was extracted but it's not a food, clarify with the user
        if (slots.type && slots.isFood === false) {
            return {
                intent: Intent.ClarifyNotFood,
                action: Action.ClarifyNotFood,
                message: promptManager.get('clarify_not_food', language, slots.type),
                hasAnchor: hasCity,
                missingFields: []
            };
        }

        // If user mentioned price-related words but no specific amount
        if ((lowerText.includes('מחיר') || lowerText.includes('price') || lowerText.includes('תקציב') || lowerText.includes('budget')) && !slots.maxPrice) {
            return {
                intent: Intent.ClarifyPrice,
                action: Action.AskClarification,
                message: promptManager.get('clarify_price', language),
                hasAnchor: hasCity,
                missingFields: hasCity ? ['maxPrice'] : ['city', 'maxPrice']
            };
        }

        // Default to city if missing
        if (!hasCity) {
            return {
                intent: Intent.ClarifyCity,
                action: Action.AskClarification,
                message: promptManager.get('clarify_city', language),
                hasAnchor: false,
                missingFields: ['city']
            };
        }

        // Has city, can search
        return {
            intent: Intent.Search,
            action: Action.FetchResults,
            hasAnchor: true,
            missingFields: []
        };
    }
}

// Export singleton instance
export const nluPolicy = new NLUPolicy();
