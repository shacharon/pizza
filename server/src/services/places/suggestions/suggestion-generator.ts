/**
 * SuggestionGenerator
 * Generates contextual refinement suggestions based on search results
 * 
 * Philosophy: "We don't ask users to talk — we help them decide"
 * - Analyze search context and results
 * - Suggest relevant refinements as clickable chips
 * - Keep it functional, not conversational
 * 
 * Examples:
 * - Search: "pizza ashkelon" → Suggest: Delivery, Top rated, Budget
 * - Search: "sushi tel aviv" → Suggest: Open now, Romantic, Takeout
 */

import type { ParsedIntent } from '../session/session-manager.js';
import { getI18n, type Lang, normalizeLang } from '../../i18n/index.js';

const i18n = getI18n();

export interface Suggestion {
    id: string;
    emoji: string;
    label: string;
    action: 'filter' | 'map' | 'sort';
    filter?: string;
}

interface PlaceItem {
    placeId: string;
    name: string;
    rating?: number;
    priceLevel?: number;
    openNow?: true | false | 'UNKNOWN';  // VerifiableBoolean
    delivery?: boolean;
    takeout?: boolean;
}

export class SuggestionGenerator {
    /**
     * Generate contextual suggestions based on search intent and results
     * Rule-based for MVP (can add LLM later for smarter suggestions)
     */
    generate(
        intent: ParsedIntent,
        results: PlaceItem[],
        language: string = 'en'
    ): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const lang = normalizeLang(language);

        if (results.length === 0) {
            // No results - suggest broadening search
            return this.getBroadeningSuggestions(intent, lang);
        }

        // Analyze results to suggest relevant filters
        const characteristics = this.analyzeResults(results);

        // Suggest delivery if available but not filtered
        if (characteristics.hasDelivery && !intent.delivery) {
            suggestions.push({
                id: 'delivery',
                emoji: '🚗',
                label: i18n.t('chip.delivery', lang),
                action: 'filter',
                filter: 'delivery'
            });
        }

        // Suggest budget if there are cheap options
        if (characteristics.hasCheap && !intent.price) {
            suggestions.push({
                id: 'budget',
                emoji: '💰',
                label: i18n.t('chip.budget', lang),
                action: 'filter',
                filter: 'price<=2'
            });
        }

        // Suggest top rated if there are highly-rated options
        if (characteristics.hasTopRated && !intent.rating) {
            suggestions.push({
                id: 'toprated',
                emoji: '⭐',
                label: i18n.t('chip.topRated', lang),
                action: 'filter',
                filter: 'rating>=4.5'
            });
        }

        // Suggest open now if not already filtered
        if (!intent.temporal?.includes('opennow') && !intent.opennow) {
            suggestions.push({
                id: 'opennow',
                emoji: '🟢',
                label: i18n.t('chip.openNow', lang),
                action: 'filter',
                filter: 'opennow'
            });
        }

        // Suggest closed now as an option (for planning ahead)
        if (!intent.temporal?.includes('closed')) {
            suggestions.push({
                id: 'closednow',
                emoji: '🔴',
                label: i18n.t('chip.closedNow', lang),
                action: 'filter',
                filter: 'closed'
            });
        }

        // Always suggest map view (useful for location-based decisions)
        suggestions.push({
            id: 'map',
            emoji: '🗺️',
            label: i18n.t('chip.map', lang),
            action: 'map'
        });

        // Suggest sorting by distance if not "near me"
        if (intent.location && !this.hasDistanceSort(intent)) {
            suggestions.push({
                id: 'closest',
                emoji: '📍',
                label: i18n.t('chip.closest', lang),
                action: 'sort',
                filter: 'distance'
            });
        }

        // Limit to 5 suggestions max
        return suggestions.slice(0, 5);
    }

    /**
     * Analyze results to understand available options
     */
    private analyzeResults(results: PlaceItem[]): {
        hasDelivery: boolean;
        hasCheap: boolean;
        hasExpensive: boolean;
        hasTopRated: boolean;
        allOpen: boolean;
        allClosed: boolean;
    } {
        return {
            hasDelivery: results.some(r => r.delivery),
            hasCheap: results.some(r => !r.priceLevel || r.priceLevel <= 2),
            hasExpensive: results.some(r => r.priceLevel && r.priceLevel >= 3),
            hasTopRated: results.some(r => r.rating && r.rating >= 4.5),
            allOpen: results.every(r => r.openNow === true),
            allClosed: results.every(r => r.openNow === false)
        };
    }

    /**
     * Get suggestions for broadening search when no results
     */
    private getBroadeningSuggestions(
        intent: ParsedIntent,
        lang: Lang
    ): Suggestion[] {
        const suggestions: Suggestion[] = [];

        // If temporal filter exists, suggest removing it
        if (intent.temporal && intent.temporal.length > 0) {
            suggestions.push({
                id: 'anytime',
                emoji: '🕒',
                label: i18n.t('chip.openNow', lang), // Reuse "Open now" for temporal
                action: 'filter',
                filter: 'remove:temporal'
            });
        }

        // If dietary filter exists, suggest removing it
        if (intent.dietary && intent.dietary.length > 0) {
            suggestions.push({
                id: 'any_dietary',
                emoji: '🍽️',
                label: i18n.t('chip.expandSearch', lang),
                action: 'filter',
                filter: 'remove:dietary'
            });
        }

        // Suggest expanding area
        suggestions.push({
            id: 'expand',
            emoji: '🔍',
            label: i18n.t('chip.expandSearch', lang),
            action: 'filter',
            filter: 'radius:10000'
        });

        // Suggest map view to explore
        suggestions.push({
            id: 'map',
            emoji: '🗺️',
            label: i18n.t('chip.map', lang),
            action: 'map'
        });

        return suggestions;
    }

    /**
     * Check if intent already has distance-based sorting
     */
    private hasDistanceSort(intent: ParsedIntent): boolean {
        // This would check if rankby=distance is set
        // For now, simple heuristic
        return false;
    }

    /**
     * Get suggestion by ID (for applying it)
     */
    getSuggestionById(id: string, language: string = 'en'): Suggestion | null {
        const lang = normalizeLang(language);
        
        const suggestions: Record<string, Suggestion> = {
            'delivery': {
                id: 'delivery',
                emoji: '🚗',
                label: i18n.t('chip.delivery', lang),
                action: 'filter',
                filter: 'delivery'
            },
            'budget': {
                id: 'budget',
                emoji: '💰',
                label: i18n.t('chip.budget', lang),
                action: 'filter',
                filter: 'price<=2'
            },
            'toprated': {
                id: 'toprated',
                emoji: '⭐',
                label: i18n.t('chip.topRated', lang),
                action: 'filter',
                filter: 'rating>=4.5'
            },
            'opennow': {
                id: 'opennow',
                emoji: '🟢',
                label: i18n.t('chip.openNow', lang),
                action: 'filter',
                filter: 'opennow'
            },
            'map': {
                id: 'map',
                emoji: '🗺️',
                label: i18n.t('chip.map', lang),
                action: 'map'
            },
            'closest': {
                id: 'closest',
                emoji: '📍',
                label: i18n.t('chip.closest', lang),
                action: 'sort',
                filter: 'distance'
            }
        };

        return suggestions[id] || null;
    }
}

