/**
 * IntentService: Parses natural language queries into structured intents with confidence scoring
 * Wraps PlacesIntentService and adds confidence calculation
 */

import type {
  IIntentService,
  ParsedIntent,
  IntentParseResult,
  SessionContext,
  SearchMode,
} from '../types/search.types.js';
import { PlacesIntentService } from '../../places/intent/places-intent.service.js';
import type { PlacesIntent } from '../../places/intent/places-intent.schema.js';
import { SearchConfig, type ConfidenceWeights } from '../config/search.config.js';

export class IntentService implements IIntentService {
  private placesIntentService: PlacesIntentService;
  private confidenceWeights: ConfidenceWeights;

  constructor(confidenceWeights?: Partial<ConfidenceWeights>) {
    this.placesIntentService = new PlacesIntentService();
    this.confidenceWeights = {
      ...SearchConfig.confidence,
      ...confidenceWeights,
    };
  }

  /**
   * Parse a natural language query into a structured intent with confidence score
   */
  async parse(text: string, context?: SessionContext): Promise<IntentParseResult> {
    // Get intent from existing PlacesIntentService
    const placesIntent = await this.placesIntentService.resolve(text);

    // Convert to ParsedIntent format
    const intent = this.convertToParseIntent(placesIntent, text);

    // Calculate confidence score
    const confidence = this.calculateConfidence(intent, context);

    return { intent, confidence };
  }

  /**
   * Convert PlacesIntent to ParsedIntent format
   */
  private convertToParseIntent(placesIntent: PlacesIntent, originalText: string): ParsedIntent {
    const search = placesIntent.search;
    const target = search.target;
    const filters = search.filters ?? {};

    const intent: ParsedIntent = {
      query: search.query ?? originalText,
      searchMode: search.mode as SearchMode,
      filters: {
        openNow: filters.opennow ?? false,
      },
      language: filters.language ?? SearchConfig.places.defaultLanguage,
    };

    // Only add optional location properties if they exist
    const location: ParsedIntent['location'] = {
      radius: filters.radius ?? (target.coords ? 0 : SearchConfig.places.defaultRadius),
    };
    if (target.city) location.city = target.city;
    if (target.place) location.place = target.place;
    if (target.coords) location.coords = target.coords;
    intent.location = location;

    // Only add priceLevel if it exists
    if (filters.price) {
      intent.filters.priceLevel = this.convertPriceRange(filters.price);
    }

    // Only add cuisine if it exists
    if (filters.type) {
      intent.cuisine = [filters.type];
    }

    // Only add regionLanguage if it exists
    if (filters.language) {
      intent.regionLanguage = filters.language;
    }

    return intent;
  }

  /**
   * Calculate confidence score (0-1) based on query completeness and clarity
   */
  private calculateConfidence(intent: ParsedIntent, context?: SessionContext): number {
    const weights = this.confidenceWeights;
    let confidence = weights.base;

    // Boost if query has explicit food type
    if (intent.query && intent.query.length > 0) {
      confidence += weights.hasQuery;
    }

    // Boost if location is specified (city, place, or coords)
    if (intent.location?.city || intent.location?.place || intent.location?.coords) {
      confidence += weights.hasLocation;
    }

    // Boost if has additional filters (shows specific intent)
    if (intent.filters.openNow || intent.filters.priceLevel || 
        (intent.filters.dietary && intent.filters.dietary.length > 0)) {
      confidence += weights.hasFilters;
    }

    // Penalty if query is too vague (short and no filters)
    if (intent.query.length < weights.vagueQueryLength && !this.hasAnyFilters(intent)) {
      confidence += weights.isVague; // Note: weight is negative
    }

    // Boost if this is a refinement (has context)
    if (context?.previousIntent) {
      confidence += weights.hasContext;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Convert price range to price level (1-4)
   */
  private convertPriceRange(price: { min: number; max: number }): number {
    const avg = (price.min + price.max) / 2;
    if (avg <= 1) return 1;
    if (avg <= 2) return 2;
    if (avg <= 3) return 3;
    return 4;
  }

  /**
   * Check if intent has any filters applied
   */
  private hasAnyFilters(intent: ParsedIntent): boolean {
    return Boolean(
      intent.filters.openNow ||
      intent.filters.priceLevel ||
      (intent.filters.dietary && intent.filters.dietary.length > 0) ||
      (intent.filters.mustHave && intent.filters.mustHave.length > 0) ||
      intent.occasion ||
      (intent.vibe && intent.vibe.length > 0)
    );
  }
}

