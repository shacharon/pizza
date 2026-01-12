/**
 * TEMPORARY Intent Mapper: ParsedIntent → SearchIntent
 * 
 * @deprecated This mapper will be removed once LLM outputs SearchIntent directly.
 * 
 * CRITICAL RULES (from Phase 2 plan):
 * 1. Food anchor from canonical.category (NOT full query text)
 * 2. Location text only (NO coordinates)
 * 3. nearMe detected from query patterns
 * 4. explicitDistance ONLY if user stated numeric distance
 * 5. NO defaults, NO inference beyond user intent
 * 
 * This mapper is LOSSY but COMPLIANT - it strips LLM-derived execution decisions
 * and preserves only user intent.
 */

import type { ParsedIntent } from '../types/search.types.js';
import type { SearchIntent, Language } from '../types/intent.dto.js';

/**
 * Map legacy ParsedIntent to new SearchIntent schema
 * 
 * @param parsed - Legacy intent from intentService.parse()
 * @param confidence - Intent confidence score (0-1)
 * @param originalQuery - Original user query text (for nearMe detection)
 * @returns SearchIntent compliant with SEARCH_INTENT_CONTRACT.md
 */
export function mapParsedIntentToSearchIntent(
  parsed: ParsedIntent,
  confidence: number,
  originalQuery: string
): SearchIntent {
  
  // ═══════════════════════════════════════════════════════════
  // FOOD ANCHOR EXTRACTION
  // ═══════════════════════════════════════════════════════════
  const foodType = extractFoodType(parsed);
  const foodAnchor = {
    type: foodType,
    present: Boolean(foodType)
  };
  
  // ═══════════════════════════════════════════════════════════
  // LOCATION ANCHOR EXTRACTION
  // ═══════════════════════════════════════════════════════════
  const locationText = extractLocationText(parsed);
  const locationType = determineLocationType(parsed);
  const locationAnchor = {
    text: locationText,
    type: locationType,
    present: Boolean(locationText)
  };
  
  // ═══════════════════════════════════════════════════════════
  // NEAR-ME DETECTION
  // ═══════════════════════════════════════════════════════════
  const nearMe = detectNearMePattern(originalQuery);
  
  // ═══════════════════════════════════════════════════════════
  // EXPLICIT DISTANCE (CRITICAL)
  // ═══════════════════════════════════════════════════════════
  // ❌ DO NOT map parsed.location.radius
  // ✅ ONLY if user text contains "within 500m", "up to 3km", etc.
  // TODO: Add distance parsing logic later
  const explicitDistance = {
    meters: null,
    originalText: null
  };
  
  // ═══════════════════════════════════════════════════════════
  // PREFERENCES EXTRACTION
  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  // PREFERENCES EXTRACTION
  // ═══════════════════════════════════════════════════════════
  const preferences: import('../types/intent.dto.js').Preferences = {};
  
  if (parsed.filters.dietary && parsed.filters.dietary.length > 0) {
    // Cast to DietaryType array (assume legacy parser provides valid values)
    preferences.dietary = parsed.filters.dietary as import('../types/intent.dto.js').DietaryType[];
  }
  if (parsed.filters.priceLevel !== undefined) {
    preferences.priceLevel = parsed.filters.priceLevel as 1 | 2 | 3 | 4;
  }
  if (parsed.filters.openNow !== undefined) {
    preferences.openNow = parsed.filters.openNow;
  }
  if (parsed.filters.mustHave?.includes('delivery')) {
    preferences.delivery = true;
  }
  if (parsed.filters.mustHave?.includes('takeout')) {
    preferences.takeout = true;
  }
  
  // ═══════════════════════════════════════════════════════════
  // LANGUAGE NORMALIZATION
  // ═══════════════════════════════════════════════════════════
  const language = mapLanguageCode(parsed);
  
  // ═══════════════════════════════════════════════════════════
  // BUILD SEARCH INTENT
  // ═══════════════════════════════════════════════════════════
  return {
    foodAnchor,
    locationAnchor,
    nearMe,
    explicitDistance,
    preferences,
    language,
    confidence: Math.max(0, Math.min(1, confidence)),
    originalQuery: parsed.originalQuery || originalQuery
  };
}

/**
 * Extract clean food type from parsed intent
 * 
 * Priority:
 * 1. parsed.canonical?.category (best: normalized English category)
 * 2. parsed.query (fallback: but may be too generic)
 * 
 * @returns Food type string or empty string
 */
function extractFoodType(parsed: ParsedIntent): string {
  // Priority 1: Canonical category (e.g., "pizza", "sushi", "italian restaurant")
  if (parsed.canonical?.category && parsed.canonical.category.length > 0) {
    return parsed.canonical.category;
  }
  
  // Priority 2: Normalized query (but filter out too-generic queries)
  if (parsed.query && parsed.query.length > 0) {
    const query = parsed.query.toLowerCase().trim();
    
    // Skip if query is just a location
    if (isLocationOnlyQuery(query, parsed)) {
      return '';
    }
    
    return parsed.query;
  }
  
  return '';
}

/**
 * Extract location text from parsed intent
 * 
 * Priority:
 * 1. parsed.location.city
 * 2. parsed.location.place
 * 
 * @returns Location text or empty string
 */
function extractLocationText(parsed: ParsedIntent): string {
  if (parsed.location?.city && parsed.location.city.length > 0) {
    return parsed.location.city;
  }
  
  if (parsed.location?.place && parsed.location.place.length > 0) {
    return parsed.location.place;
  }
  
  return '';
}

/**
 * Determine location type from parsed intent
 * 
 * Maps placeType to LocationType ('city' | 'street' | 'poi' | 'gps' | '')
 */
function determineLocationType(parsed: ParsedIntent): 'city' | 'street' | 'poi' | 'gps' | '' {
  // If we have a place with a type
  if (parsed.location?.placeType) {
    switch (parsed.location.placeType) {
      case 'street':
        return 'street';
      case 'neighborhood':
      case 'landmark':
        return 'poi';
      default:
        return 'city';
    }
  }
  
  // If we have a city, type is city
  if (parsed.location?.city) {
    return 'city';
  }
  
  // If we have coords but no text, assume GPS
  if (parsed.location?.coords && !parsed.location.city && !parsed.location.place) {
    return 'gps';
  }
  
  return '';
}

/**
 * Detect "near me" pattern in original query
 * 
 * Patterns (multiple languages):
 * - English: "near me", "nearby", "close to me", "around me"
 * - Hebrew: "קרוב אליי", "קרוב לי", "בסביבה", "באיזור שלי"
 * - Arabic: "قريب مني", "بالقرب مني"
 * - Russian: "рядом со мной", "около меня"
 * - French: "près de moi", "proche de moi"
 */
function detectNearMePattern(query: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  
  // English patterns
  if (
    normalizedQuery.includes('near me') ||
    normalizedQuery.includes('nearby') ||
    normalizedQuery.includes('close to me') ||
    normalizedQuery.includes('around me') ||
    normalizedQuery.includes('around here')
  ) {
    return true;
  }
  
  // Hebrew patterns
  if (
    normalizedQuery.includes('קרוב אליי') ||
    normalizedQuery.includes('קרוב לי') ||
    normalizedQuery.includes('בסביבה') ||
    normalizedQuery.includes('באיזור שלי') ||
    normalizedQuery.includes('בקרבת מקום')
  ) {
    return true;
  }
  
  // Arabic patterns
  if (
    normalizedQuery.includes('قريب مني') ||
    normalizedQuery.includes('بالقرب مني')
  ) {
    return true;
  }
  
  // Russian patterns
  if (
    normalizedQuery.includes('рядом со мной') ||
    normalizedQuery.includes('около меня')
  ) {
    return true;
  }
  
  // French patterns
  if (
    normalizedQuery.includes('près de moi') ||
    normalizedQuery.includes('proche de moi')
  ) {
    return true;
  }
  
  return false;
}

/**
 * Check if query is location-only (no food)
 * 
 * Helps filter out cases where parsed.query is just a city name
 */
function isLocationOnlyQuery(query: string, parsed: ParsedIntent): boolean {
  // If query matches location exactly, it's location-only
  if (
    parsed.location?.city?.toLowerCase() === query ||
    parsed.location?.place?.toLowerCase() === query
  ) {
    return true;
  }
  
  // Generic location words (too broad to be food)
  const locationWords = ['city', 'town', 'place', 'area', 'location', 'עיר', 'מקום', 'אזור'];
  if (locationWords.some(word => query.includes(word))) {
    return true;
  }
  
  return false;
}

/**
 * Map language code from parsed intent to normalized Language type
 * 
 * Priority:
 * 1. parsed.languageContext.requestLanguage
 * 2. parsed.language (deprecated but still used)
 * 3. Default to 'en'
 * 
 * @returns Normalized language ('he' | 'en' | 'ar' | 'ru')
 */
function mapLanguageCode(parsed: ParsedIntent): Language {
  // Priority 1: languageContext.requestLanguage (new)
  if (parsed.languageContext?.requestLanguage) {
    return normalizeLanguage(parsed.languageContext.requestLanguage);
  }
  
  // Priority 2: parsed.language (deprecated)
  if (parsed.language) {
    return normalizeLanguage(parsed.language);
  }
  
  // Fallback
  return 'en';
}

/**
 * Normalize language code to supported Language type
 */
function normalizeLanguage(code: string): Language {
  const normalized = code.toLowerCase().slice(0, 2);
  
  switch (normalized) {
    case 'he':
    case 'iw':
      return 'he';
    case 'ar':
      return 'ar';
    case 'ru':
      return 'ru';
    case 'en':
    default:
      return 'en';
  }
}
