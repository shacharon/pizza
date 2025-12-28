/**
 * SuggestionService: Generates contextual refinement chips and suggestions
 * Wraps SuggestionGenerator with new types
 * Phase 5: Mode-aware chip generation (NORMAL/RECOVERY/CLARIFY)
 */

import type { ISuggestionService, ParsedIntent, RestaurantResult, RefinementChip } from '../types/search.types.js';
import { SuggestionGenerator, type Suggestion } from '../../places/suggestions/suggestion-generator.js';
import { SearchConfig } from '../config/search.config.js';
import type { ResponseMode } from '../types/truth-state.types.js';
import { getI18n, normalizeLang, type Lang } from '../../i18n/index.js';

export class SuggestionService implements ISuggestionService {
  private suggestionGenerator: SuggestionGenerator;
  private i18n = getI18n();

  constructor() {
    this.suggestionGenerator = new SuggestionGenerator();
  }

  /**
   * Phase 5: Generate refinement chips based on intent, results, and mode
   * Routes to mode-specific chip generators
   */
  generate(intent: ParsedIntent, results: RestaurantResult[], mode: ResponseMode = 'NORMAL'): RefinementChip[] {
    const lang = normalizeLang(intent.language);

    // Phase 5: Route based on mode
    switch (mode) {
      case 'RECOVERY':
        return this.generateRecoveryChips(intent, results, lang);
      
      case 'CLARIFY':
        return this.generateClarifyChips(intent, lang);
      
      case 'NORMAL':
      default:
        return this.generateNormalChips(intent, results);
    }
  }

  /**
   * Phase 5: Generate NORMAL mode chips
   * Original generate() logic renamed
   */
  private generateNormalChips(intent: ParsedIntent, results: RestaurantResult[]): RefinementChip[] {
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
      intent.language // Now accepts any string, will normalize inside
    );

    // Convert Suggestion[] to RefinementChip[]
    return suggestions.map(s => this.convertToChip(s));
  }

  /**
   * Phase 5: Generate RECOVERY mode chips
   * Focus on helping user find results (expand, relax constraints, etc.)
   */
  private generateRecoveryChips(
    intent: ParsedIntent,
    results: RestaurantResult[],
    lang: Lang
  ): RefinementChip[] {
    const chips: RefinementChip[] = [];

    // 1. Expand radius
    chips.push({
      id: 'expand_radius',
      emoji: '🔍',
      label: this.i18n.t('chip.expandSearch', lang),
      action: 'filter',
      filter: 'radius:10000' // 10km
    });

    // 2. Remove filters (if any applied)
    if (intent.filters.openNow !== undefined || intent.filters.dietary?.length) {
      chips.push({
        id: 'remove_filters',
        emoji: '🔄',
        label: this.i18n.t('chip.removeFilters', lang),
        action: 'filter',
        filter: 'clear_filters'
      });
    }

    // 3. Try nearby areas
    chips.push({
      id: 'try_nearby',
      emoji: '📍',
      label: this.i18n.t('chip.tryNearby', lang),
      action: 'filter',
      filter: 'nearby_fallback'
    });

    // 4. Sort by rating (recovery default)
    chips.push({
      id: 'sort_rating',
      emoji: '⭐',
      label: this.i18n.t('chip.topRated', lang),
      action: 'sort',
      filter: `rating>=${SearchConfig.ranking.thresholds.highlyRated}`
    });

    // 5. Map view (helps user explore)
    chips.push({
      id: 'map',
      emoji: '🗺️',
      label: this.i18n.t('chip.map', lang),
      action: 'map'
    });

    return chips.slice(0, 5); // Max 5 recovery chips
  }

  /**
   * Phase 5: Generate CLARIFY mode chips
   * Minimal set (1-3 chips) for clarification
   */
  private generateClarifyChips(
    intent: ParsedIntent,
    lang: Lang
  ): RefinementChip[] {
    const chips: RefinementChip[] = [];

    // Only 1-3 chips for clarification
    // Based on what's missing/ambiguous

    if (!intent.location?.city) {
      // Suggest popular cities (deterministic)
      const cities = ['Tel Aviv', 'Jerusalem', 'Haifa'];
      cities.slice(0, 3).forEach((city, index) => {
        chips.push({
          id: `city_${city.toLowerCase().replace(' ', '_')}`,
          emoji: '📍',
          label: `${intent.query} ${this.i18n.t('clarification.inCity', lang, { city })}`,
          action: 'filter',
          filter: `city:${city}`
        });
      });
    }

    // If no specific clarification chips, return default exploration chips
    if (chips.length === 0) {
      chips.push({
        id: 'map',
        emoji: '🗺️',
        label: this.i18n.t('chip.map', lang),
        action: 'map'
      });
      chips.push({
        id: 'closest',
        emoji: '📍',
        label: this.i18n.t('chip.closest', lang),
        action: 'sort',
        filter: 'distance'
      });
    }

    return chips.slice(0, 3); // Max 3 for clarification
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
  getDefaultSuggestions(language?: string): RefinementChip[] {
    const lang = language ?? SearchConfig.places.defaultLanguage;
    
    // Use suggestion generator to get i18n labels
    const generator = this.suggestionGenerator;
    
    return [
      {
        id: 'map',
        emoji: '🗺️',
        label: generator.getSuggestionById('map', lang)?.label || 'Map',
        action: 'map',
      },
      {
        id: 'closest',
        emoji: '📍',
        label: generator.getSuggestionById('closest', lang)?.label || 'Closest',
        action: 'sort',
        filter: 'distance',
      },
      {
        id: 'toprated',
        emoji: '⭐',
        label: generator.getSuggestionById('toprated', lang)?.label || 'Top rated',
        action: 'filter',
        filter: `rating>=${SearchConfig.ranking.thresholds.highlyRated}`,
      },
    ];
  }
}

