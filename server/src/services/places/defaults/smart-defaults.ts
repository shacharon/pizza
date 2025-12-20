/**
 * SmartDefaultsEngine
 * Applies intelligent default filters to improve search results
 * 
 * Philosophy: "Search, not chat" - be smart but transparent
 * - Apply helpful defaults (e.g., show open places)
 * - Track what was auto-applied vs user-requested
 * - Let UI show transparency ("✓ Open now" with remove option)
 * 
 * Smart Defaults:
 * 1. opennow: Show currently open places (unless user specifies time)
 * 2. radius: Reasonable default based on location type
 * 3. rankby: Prefer distance for "near me" queries
 */

import type { ParsedIntent, Filter } from '../session/session-manager.js';

export interface EnhancedIntent extends ParsedIntent {
    autoAppliedFilters: string[];
    userRequestedFilters: string[];
}

export class SmartDefaultsEngine {
    /**
     * Apply smart defaults to parsed intent
     * Returns enhanced intent with filters and metadata
     */
    applyDefaults(
        parsed: ParsedIntent,
        userQuery: string,
        existingFilters: Filter[] = []
    ): EnhancedIntent {
        const autoApplied: string[] = [];
        const userRequested: string[] = [];
        
        // Track what user explicitly requested
        this.trackUserFilters(parsed, userRequested);

        // Smart Default 1: opennow (unless user specifies time)
        if (!this.hasTimeSpecification(userQuery) && !parsed.temporal?.includes('opennow')) {
            parsed.temporal = [...(parsed.temporal || []), 'opennow'];
            autoApplied.push('opennow');
        }

        // Smart Default 2: reasonable radius based on location
        // This is handled in query builder, but we track it
        if (parsed.location) {
            const locationType = this.detectLocationType(parsed.location);
            if (locationType === 'city') {
                autoApplied.push('radius:5000'); // 5km for cities
            } else if (locationType === 'place') {
                autoApplied.push('radius:500'); // 500m for specific places
            }
        }

        // Smart Default 3: prefer distance for explicit "near me"
        if (this.hasNearMeIntent(userQuery)) {
            autoApplied.push('rankby:distance');
        }

        console.log('[SmartDefaults] Applied', {
            autoApplied,
            userRequested,
            query: userQuery
        });

        return {
            ...parsed,
            autoAppliedFilters: autoApplied,
            userRequestedFilters: userRequested
        };
    }

    /**
     * Check if query specifies a time (future or specific time)
     */
    private hasTimeSpecification(query: string): boolean {
        const timeKeywords = [
            'tomorrow', 'tonight', 'later', 'next week', 'weekend',
            'morning', 'afternoon', 'evening', 'lunch', 'dinner',
            'מחר', 'הערב', 'אחר כך', 'שבוע הבא', 'סופ"ש',
            'בוקר', 'צהריים', 'ערב', 'ארוחת צהריים', 'ארוחת ערב'
        ];

        const queryLower = query.toLowerCase();
        return timeKeywords.some(keyword => queryLower.includes(keyword));
    }

    /**
     * Check if query explicitly asks for nearby places
     */
    private hasNearMeIntent(query: string): boolean {
        const nearMePatterns = [
            /\bnear me\b/i,
            /\bnearby\b/i,
            /\bclose to me\b/i,
            /\baround me\b/i,
            /\bclosest\b/i,
            /\bלידי\b/,
            /\bקרוב אליי\b/,
            /\bבסביבה\b/,
            /\bהכי קרוב\b/
        ];

        return nearMePatterns.some(pattern => pattern.test(query));
    }

    /**
     * Detect location type (city, place, or coords)
     */
    private detectLocationType(location: string): 'city' | 'place' | 'coords' {
        // Common city patterns
        const cityPatterns = [
            /^(tel aviv|jerusalem|haifa|ashkelon|ashdod|beer sheva)/i,
            /^(תל אביב|ירושלים|חיפה|אשקלון|אשדוד|באר שבע)/,
        ];

        if (cityPatterns.some(pattern => pattern.test(location))) {
            return 'city';
        }

        // If it contains specific place indicators (street, building, beach)
        const placeIndicators = ['street', 'st', 'ave', 'road', 'beach', 'mall', 'center', 'רחוב', 'כביש', 'חוף', 'קניון'];
        if (placeIndicators.some(indicator => location.toLowerCase().includes(indicator))) {
            return 'place';
        }

        // Default to city for simple location names
        return 'city';
    }

    /**
     * Track what filters the user explicitly requested
     */
    private trackUserFilters(parsed: ParsedIntent, userRequested: string[]): void {
        if (parsed.dietary && parsed.dietary.length > 0) {
            userRequested.push(...parsed.dietary.map(d => `dietary:${d}`));
        }

        if (parsed.price) {
            if (parsed.price.min !== undefined || parsed.price.max !== undefined) {
                userRequested.push('price');
            }
        }

        if (parsed.delivery) {
            userRequested.push('delivery');
        }

        if (parsed.rating) {
            userRequested.push(`rating:${parsed.rating}`);
        }
    }

    /**
     * Remove a specific auto-applied filter
     * Used when user clicks "×" on a filter chip
     */
    removeAutoApplied(
        enhanced: EnhancedIntent,
        filterToRemove: string
    ): EnhancedIntent {
        const autoApplied = enhanced.autoAppliedFilters.filter(f => f !== filterToRemove);

        // Remove from parsed intent as well
        if (filterToRemove === 'opennow') {
            enhanced.temporal = enhanced.temporal?.filter(t => t !== 'opennow');
        }

        console.log('[SmartDefaults] Removed auto-applied filter:', filterToRemove);

        return {
            ...enhanced,
            autoAppliedFilters: autoApplied
        };
    }

    /**
     * Get human-readable label for a filter
     */
    getFilterLabel(filter: string, language: 'he' | 'en' = 'en'): string {
        const labels: Record<string, { he: string; en: string }> = {
            'opennow': { he: 'פתוח עכשיו', en: 'Open now' },
            'radius:500': { he: 'רדיוס 500 מ\'', en: '500m radius' },
            'radius:5000': { he: 'רדיוס 5 ק"מ', en: '5km radius' },
            'rankby:distance': { he: 'לפי מרחק', en: 'By distance' },
            'delivery': { he: 'משלוחים', en: 'Delivery' },
            'price': { he: 'מחיר', en: 'Price' },
        };

        return labels[filter]?.[language] || filter;
    }
}

