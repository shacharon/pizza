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
    openNow?: boolean;
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
        language: 'he' | 'en' = 'en'
    ): Suggestion[] {
        const suggestions: Suggestion[] = [];

        if (results.length === 0) {
            // No results - suggest broadening search
            return this.getBroadeningSuggestions(intent, language);
        }

        // Analyze results to suggest relevant filters
        const characteristics = this.analyzeResults(results);

        // Suggest delivery if available but not filtered
        if (characteristics.hasDelivery && !intent.delivery) {
            suggestions.push({
                id: 'delivery',
                emoji: '🚗',
                label: language === 'he' ? 'משלוחים' : 'Delivery',
                action: 'filter',
                filter: 'delivery'
            });
        }

        // Suggest budget if there are cheap options
        if (characteristics.hasCheap && !intent.price) {
            suggestions.push({
                id: 'budget',
                emoji: '💰',
                label: language === 'he' ? 'זול' : 'Budget',
                action: 'filter',
                filter: 'price<=2'
            });
        }

        // Suggest top rated if there are highly-rated options
        if (characteristics.hasTopRated && !intent.rating) {
            suggestions.push({
                id: 'toprated',
                emoji: '⭐',
                label: language === 'he' ? 'מדורג גבוה' : 'Top rated',
                action: 'filter',
                filter: 'rating>=4.5'
            });
        }

        // Suggest open now if not already filtered
        if (!intent.temporal?.includes('opennow')) {
            suggestions.push({
                id: 'opennow',
                emoji: '🟢',
                label: language === 'he' ? 'פתוח עכשיו' : 'Open now',
                action: 'filter',
                filter: 'opennow'
            });
        }

        // Always suggest map view (useful for location-based decisions)
        suggestions.push({
            id: 'map',
            emoji: '🗺️',
            label: language === 'he' ? 'מפה' : 'Map',
            action: 'map'
        });

        // Suggest sorting by distance if not "near me"
        if (intent.location && !this.hasDistanceSort(intent)) {
            suggestions.push({
                id: 'closest',
                emoji: '📍',
                label: language === 'he' ? 'הכי קרוב' : 'Closest',
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
        language: 'he' | 'en'
    ): Suggestion[] {
        const suggestions: Suggestion[] = [];

        // If temporal filter exists, suggest removing it
        if (intent.temporal && intent.temporal.length > 0) {
            suggestions.push({
                id: 'anytime',
                emoji: '🕒',
                label: language === 'he' ? 'בכל שעה' : 'Any time',
                action: 'filter',
                filter: 'remove:temporal'
            });
        }

        // If dietary filter exists, suggest removing it
        if (intent.dietary && intent.dietary.length > 0) {
            suggestions.push({
                id: 'any_dietary',
                emoji: '🍽️',
                label: language === 'he' ? 'ללא הגבלות תזונה' : 'Any dietary',
                action: 'filter',
                filter: 'remove:dietary'
            });
        }

        // Suggest expanding area
        suggestions.push({
            id: 'expand',
            emoji: '🔍',
            label: language === 'he' ? 'הרחב חיפוש' : 'Expand area',
            action: 'filter',
            filter: 'radius:10000'
        });

        // Suggest map view to explore
        suggestions.push({
            id: 'map',
            emoji: '🗺️',
            label: language === 'he' ? 'מפה' : 'Map',
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
    getSuggestionById(id: string, language: 'he' | 'en' = 'en'): Suggestion | null {
        const suggestions: Record<string, Suggestion> = {
            'delivery': {
                id: 'delivery',
                emoji: '🚗',
                label: language === 'he' ? 'משלוחים' : 'Delivery',
                action: 'filter',
                filter: 'delivery'
            },
            'budget': {
                id: 'budget',
                emoji: '💰',
                label: language === 'he' ? 'זול' : 'Budget',
                action: 'filter',
                filter: 'price<=2'
            },
            'toprated': {
                id: 'toprated',
                emoji: '⭐',
                label: language === 'he' ? 'מדורג גבוה' : 'Top rated',
                action: 'filter',
                filter: 'rating>=4.5'
            },
            'opennow': {
                id: 'opennow',
                emoji: '🟢',
                label: language === 'he' ? 'פתוח עכשיו' : 'Open now',
                action: 'filter',
                filter: 'opennow'
            },
            'map': {
                id: 'map',
                emoji: '🗺️',
                label: language === 'he' ? 'מפה' : 'Map',
                action: 'map'
            },
            'closest': {
                id: 'closest',
                emoji: '📍',
                label: language === 'he' ? 'הכי קרוב' : 'Closest',
                action: 'sort',
                filter: 'distance'
            }
        };

        return suggestions[id] || null;
    }
}

