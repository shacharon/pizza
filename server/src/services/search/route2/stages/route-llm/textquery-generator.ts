/**
 * Deterministic TextQuery Generator
 * 
 * Generates canonical textQuery in searchLanguage using templates.
 * NO LLM usage - pure deterministic generation for language stability.
 * 
 * INVARIANTS:
 * 1. Same cuisineKey + city + searchLanguage → identical textQuery
 * 2. textQuery language = searchLanguage (never query language)
 * 3. No user query text in output (only canonical tokens)
 */

import { getCuisineRestaurantLabel, type CuisineKey } from '../../shared/cuisine-tokens.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

export interface TextQueryGeneratorInput {
  /** Canonical cuisine key (if explicit cuisine query) */
  cuisineKey?: CuisineKey;
  
  /** City name (normalized) */
  cityText?: string;
  
  /** Search language (from LanguageContext policy) */
  searchLanguage: 'he' | 'en';
  
  /** Type hint for generic queries */
  typeHint?: 'restaurant' | 'cafe' | 'bar' | 'any';
  
  /** For logging */
  requestId?: string;
}

/**
 * Generate deterministic textQuery in searchLanguage
 * 
 * Templates:
 * - Explicit cuisine + city: "{cuisineLabel} {city}" (e.g., "Italian restaurant Tel Aviv")
 * - Explicit cuisine, no city: "{cuisineLabel}" (e.g., "Italian restaurant")
 * - Generic + city: "{typeLabel} {city}" (e.g., "restaurant Tel Aviv")
 * - Generic, no city: "{typeLabel}" (e.g., "restaurant")
 */
export function generateTextQuery(input: TextQueryGeneratorInput): string {
  const { cuisineKey, cityText, searchLanguage, typeHint = 'restaurant', requestId } = input;
  
  let textQuery: string;
  let template: string;
  
  if (cuisineKey) {
    // Explicit cuisine query
    const cuisineLabel = getCuisineRestaurantLabel(cuisineKey, searchLanguage);
    
    if (cityText) {
      // Template: "{cuisineLabel} {city}"
      textQuery = `${cuisineLabel} ${cityText}`;
      template = 'cuisine_with_city';
    } else {
      // Template: "{cuisineLabel}"
      textQuery = cuisineLabel;
      template = 'cuisine_no_city';
    }
  } else {
    // Generic query (no explicit cuisine)
    const typeLabel = getTypeLabel(typeHint, searchLanguage);
    
    if (cityText) {
      // Template: "{typeLabel} {city}"
      textQuery = `${typeLabel} ${cityText}`;
      template = 'generic_with_city';
    } else {
      // Template: "{typeLabel}"
      textQuery = typeLabel;
      template = 'generic_no_city';
    }
  }
  
  // Log generation (observability)
  if (requestId) {
    logger.info({
      requestId,
      event: 'textquery_generated',
      template,
      cuisineKey: cuisineKey ?? null,
      cityText: cityText ?? null,
      searchLanguage,
      typeHint: typeHint ?? null,
      textQuery
    }, '[TEXTQUERY_GEN] Generated deterministic textQuery');
  }
  
  return textQuery;
}

/**
 * Get type label for generic queries
 */
function getTypeLabel(typeHint: string, searchLanguage: 'he' | 'en'): string {
  const TYPE_LABELS: Record<string, { he: string; en: string }> = {
    restaurant: {
      he: 'מסעדה',
      en: 'restaurant'
    },
    cafe: {
      he: 'בית קפה',
      en: 'cafe'
    },
    bar: {
      he: 'בר',
      en: 'bar'
    },
    any: {
      he: 'מקום אוכל',
      en: 'food place'
    }
  };
  
  return TYPE_LABELS[typeHint]?.[searchLanguage] ?? TYPE_LABELS['restaurant'][searchLanguage];
}

/**
 * Normalize city text for textQuery
 * - Remove common words like "in", "at", etc.
 * - Keep city name only
 */
export function normalizeCityText(cityText: string, searchLanguage: 'he' | 'en'): string {
  let normalized = cityText.trim();
  
  if (searchLanguage === 'he') {
    // Remove Hebrew prepositions
    normalized = normalized
      .replace(/^ב(?:-)*/i, '')    // Remove "ב" prefix
      .replace(/^ל(?:-)*/i, '')    // Remove "ל" prefix
      .replace(/^מ(?:-)*/i, '')    // Remove "מ" prefix
      .trim();
  } else {
    // Remove English prepositions
    normalized = normalized
      .replace(/^in\s+/i, '')
      .replace(/^at\s+/i, '')
      .replace(/^near\s+/i, '')
      .trim();
  }
  
  return normalized;
}

/**
 * Validate textQuery generation input
 * Throws if invalid
 */
export function validateTextQueryInput(input: TextQueryGeneratorInput): void {
  if (!input.searchLanguage) {
    throw new Error('TextQueryGenerator: searchLanguage is required');
  }
  
  if (input.searchLanguage !== 'he' && input.searchLanguage !== 'en') {
    throw new Error(`TextQueryGenerator: invalid searchLanguage: ${input.searchLanguage}`);
  }
  
  if (input.cuisineKey && !getCuisineRestaurantLabel(input.cuisineKey, input.searchLanguage)) {
    throw new Error(`TextQueryGenerator: invalid cuisineKey: ${input.cuisineKey}`);
  }
}

/**
 * Generate textQuery with validation
 * Throws on invalid input
 */
export function generateTextQuerySafe(input: TextQueryGeneratorInput): string {
  validateTextQueryInput(input);
  return generateTextQuery(input);
}
