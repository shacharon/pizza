/**
 * SuggestionService: Generates contextual refinement chips and suggestions
 * Wraps SuggestionGenerator with new types
 */

import type { ISuggestionService, ParsedIntent, RestaurantResult, RefinementChip } from '../types/search.types.js';
import { SuggestionGenerator, type Suggestion } from '../../places/suggestions/suggestion-generator.js';
import { SearchConfig } from '../config/search.config.js';

export class SuggestionService implements ISuggestionService {
  private suggestionGenerator: SuggestionGenerator;

  constructor() {
    this.suggestionGenerator = new SuggestionGenerator();
  }

  /**
   * Generate refinement chips based on intent and results
   */
  generate(intent: ParsedIntent, results: RestaurantResult[]): RefinementChip[] {
    // Convert to format expected by SuggestionGenerator
    const places = results.map(r => {
      const place: any = {
        placeId: r.placeId,
        name: r.name,
      };
      
      // Only add optional properties if they exist
      if (r.rating !== undefined) place.rating = r.rating;
      if (r.priceLevel !== undefined) place.priceLevel = r.priceLevel;
      if (r.openNow !== undefined) place.openNow = r.openNow;
      if (r.tags) {
        place.delivery = r.tags.includes('delivery') || r.tags.includes('meal_delivery');
        place.takeout = r.tags.includes('takeout') || r.tags.includes('meal_takeaway');
      }

      return place;
    });

    // Convert ParsedIntent to the format expected by SuggestionGenerator
    const legacyIntent = {
      type: intent.query || '',
      city: intent.location?.city,
      place: intent.location?.place,
      coords: intent.location?.coords,
      delivery: false,  // Not in new intent
      price: intent.filters.priceLevel,
      rating: undefined,  // Not in new intent
      opennow: intent.filters.openNow,
      radius: intent.location?.radius,
      // Additional fields that might be needed
      mode: intent.searchMode,
      language: intent.language as 'he' | 'en',
    };

    // Generate suggestions using existing logic
    const suggestions = this.suggestionGenerator.generate(
      legacyIntent as any,
      places,
      intent.language as 'he' | 'en'
    );

    // Convert Suggestion[] to RefinementChip[]
    return suggestions.map(s => this.convertToChip(s));
  }

  /**
   * Convert Suggestion to RefinementChip
   */
  private convertToChip(suggestion: Suggestion): RefinementChip {
    const chip: RefinementChip = {
      id: suggestion.id,
      emoji: suggestion.emoji,
      label: suggestion.label,
      action: suggestion.action,
    };

    // Only add filter if it exists
    if (suggestion.filter) {
      chip.filter = suggestion.filter;
    }

    return chip;
  }

  /**
   * Generate personalized suggestions based on user preferences (future)
   */
  generatePersonalized(
    intent: ParsedIntent,
    results: RestaurantResult[],
    userPreferences?: any
  ): RefinementChip[] {
    // For now, just use standard suggestions
    // Future: incorporate user preferences, history, swipe data
    const baseChips = this.generate(intent, results);

    // Future: add personalized chips based on userPreferences
    // e.g., "Your favorites", "Similar to last time", etc.

    return baseChips;
  }

  /**
   * Get default suggestions (when no results or context)
   */
  getDefaultSuggestions(language?: 'he' | 'en'): RefinementChip[] {
    const lang = language ?? (SearchConfig.places.defaultLanguage as 'he' | 'en');
    
    return [
      {
        id: 'map',
        emoji: '🗺️',
        label: lang === 'he' ? 'מפה' : 'Map',
        action: 'map',
      },
      {
        id: 'closest',
        emoji: '📍',
        label: lang === 'he' ? 'הכי קרוב' : 'Closest',
        action: 'sort',
        filter: 'distance',
      },
      {
        id: 'toprated',
        emoji: '⭐',
        label: lang === 'he' ? 'מדורג גבוה' : 'Top rated',
        action: 'filter',
        filter: `rating>=${SearchConfig.ranking.thresholds.highlyRated}`,
      },
    ];
  }
}

