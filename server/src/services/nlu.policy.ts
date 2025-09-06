import type { ExtractedSlots } from './nlu.service.js';
import { promptManager } from './prompt.service.js';

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
    decide(slots: ExtractedSlots, language: 'he' | 'en' | 'ar', confidence: number): PolicyResult {
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
                intent: 'clarify_not_food',
                action: 'clarify_not_food',
                message: promptManager.get('clarify_not_food', language, slots.type),
                hasAnchor: hasCity,
                missingFields: []
            };
        }

        // If user mentioned price-related words but no specific amount
        if ((lowerText.includes('מחיר') || lowerText.includes('price') || lowerText.includes('תקציב') || lowerText.includes('budget')) && !slots.maxPrice) {
            return {
                intent: 'clarify_price',
                action: 'ask_clarification',
                message: promptManager.get('clarify_price', language),
                hasAnchor: hasCity,
                missingFields: hasCity ? ['maxPrice'] : ['city', 'maxPrice']
            };
        }

        // Default to city if missing
        if (!hasCity) {
            return {
                intent: 'clarify_city',
                action: 'ask_clarification',
                message: promptManager.get('clarify_city', language),
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
}

// Export singleton instance
export const nluPolicy = new NLUPolicy();
