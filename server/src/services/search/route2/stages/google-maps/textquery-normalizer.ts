/**
 * TextQuery Normalizer
 * 
 * Canonicalizes conversational/chatty Hebrew queries into category-focused queries
 * that work better with Google Places Text Search API.
 * 
 * Purpose: Avoid sending raw conversational queries like "מה יש לאכול היום"
 * which are too generic and produce poor results.
 */

import { createHash } from 'node:crypto';
import { logger } from '../../../../../lib/logger/structured-logger.js';

/**
 * Patterns for generic Hebrew food queries (conversational/chatty)
 */
const GENERIC_FOOD_PATTERNS = [
  /מה יש לאכול/i,
  /משהו לאכול/i,
  /רוצה לאכול/i,
  /איפה לאכול/i,
  /היום/i,  // "today"
  /עכשיו/i, // "now"
  /הערב/i   // "tonight"
];

/**
 * Cuisine/food type keywords that should be preserved
 */
const CUISINE_KEYWORDS = [
  'פיצה', 'pizza',
  'סוши', 'sushi',
  'המבורגר', 'burger',
  'שווארמה', 'shawarma',
  'פלאפל', 'falafel',
  'בשר', 'meat',
  'דג', 'fish',
  'איטלקי', 'italian',
  'סיני', 'chinese',
  'יפני', 'japanese',
  'הודי', 'indian',
  'מקסיקני', 'mexican',
  'תאילנדי', 'thai'
];

/**
 * Check if query is a generic/chatty food query
 */
function isGenericFoodQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();

  // Check if it matches generic patterns
  const hasGenericPattern = GENERIC_FOOD_PATTERNS.some(pattern => pattern.test(lowerQuery));

  // If has generic pattern, check if it also has a specific cuisine keyword
  if (hasGenericPattern) {
    const hasSpecificCuisine = CUISINE_KEYWORDS.some(keyword =>
      lowerQuery.includes(keyword.toLowerCase())
    );

    // If it has a specific cuisine, it's NOT generic (keep the cuisine)
    return !hasSpecificCuisine;
  }

  return false;
}

/**
 * Extract cuisine keyword from query if present
 */
function extractCuisineKeyword(query: string): string | null {
  const lowerQuery = query.toLowerCase().trim();

  for (const keyword of CUISINE_KEYWORDS) {
    if (lowerQuery.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }

  return null;
}

/**
 * Extract city name from query
 * Looks for common Hebrew city patterns and prepositions
 */
function extractCityFromQuery(query: string): string | null {
  const lowerQuery = query.toLowerCase().trim();

  // Hebrew prepositions for location: ב (in), ליד (near), בקרבת (near)
  const cityPatterns = [
    /ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s*$/,  // "בגדרה", "בתל אביב" at end
    /ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s+/,   // "בגדרה " in middle
    /ליד\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/,  // "ליד גדרה"
    /בקרבת\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/, // "בקרבת גדרה"
  ];

  for (const pattern of cityPatterns) {
    const match = lowerQuery.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Normalize textQuery for Google Places Text Search
 * 
 * P0 FIX: When explicit city is mentioned (cityText exists OR detected in query),
 * ALWAYS preserve the city in the normalized query. Never reduce to cuisine-only.
 * 
 * Rules:
 * 1. If query is generic Hebrew "מה יש לאכול היום/עכשיו/משהו לאכול" => "מסעדות"
 * 2. If query mentions "מסעדות" already => keep it
 * 3. If query has explicit city + cuisine => keep both (e.g., "איטלקי בגדרה")
 * 4. If query mentions a cuisine/food word (pizza/sushi/etc) WITHOUT city => extract cuisine only
 * 5. Otherwise => return original query
 * 
 * @param textQuery Original text query from mapper
 * @param cityText Explicit city from intent (explicit_city_mentioned)
 * @param requestId For logging
 * @returns Canonical text query
 */
export function normalizeTextQuery(
  textQuery: string,
  cityText?: string | null,
  requestId?: string
): { canonicalTextQuery: string; wasNormalized: boolean; reason: string; keptCity?: boolean } {
  const trimmed = textQuery.trim();
  const lowerQuery = trimmed.toLowerCase();

  // Check if it already mentions "מסעדות" or "restaurant"
  if (lowerQuery.includes('מסעדות') || lowerQuery.includes('restaurant')) {
    return {
      canonicalTextQuery: trimmed,
      wasNormalized: false,
      reason: 'already_has_category',
      keptCity: !!cityText
    };
  }

  // P0 FIX: Check if explicit city exists (from intent OR detected in query)
  const detectedCity = extractCityFromQuery(trimmed);
  const hasExplicitCity = !!(cityText || detectedCity);
  const cityToKeep = cityText || detectedCity;

  // Extract cuisine keyword if present (e.g., "pizza", "sushi")
  const cuisineKeyword = extractCuisineKeyword(trimmed);
  if (cuisineKeyword) {
    // P0 FIX: If explicit city exists, preserve it with cuisine
    if (hasExplicitCity && cityToKeep) {
      const canonical = `${cuisineKeyword} ב${cityToKeep}`;
      const rawHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);

      logger.info({
        requestId,
        event: 'textquery_normalized',
        rawHash,
        originalTextQuery: trimmed,
        canonicalTextQuery: canonical,
        reason: 'extracted_cuisine_with_city',
        keptCity: true,
        cityText: cityToKeep
      }, '[TEXTSEARCH] Normalized to cuisine + city (explicit city preserved)');

      return {
        canonicalTextQuery: canonical,
        wasNormalized: true,
        reason: 'extracted_cuisine_with_city',
        keptCity: true
      };
    }

    // No explicit city - extract cuisine only (original behavior)
    const canonical = cuisineKeyword;
    const rawHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);

    logger.info({
      requestId,
      event: 'textquery_normalized',
      rawHash,
      originalTextQuery: trimmed,
      canonicalTextQuery: canonical,
      reason: 'extracted_cuisine',
      keptCity: false
    }, '[TEXTSEARCH] Normalized to cuisine keyword (no explicit city)');

    return {
      canonicalTextQuery: canonical,
      wasNormalized: true,
      reason: 'extracted_cuisine',
      keptCity: false
    };
  }

  // Check if it's a generic/chatty query
  if (isGenericFoodQuery(trimmed)) {
    const canonical = 'מסעדות'; // "restaurants" in Hebrew
    const rawHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);

    logger.info({
      requestId,
      event: 'textquery_normalized',
      rawHash,
      originalTextQuery: trimmed,
      canonicalTextQuery: canonical,
      reason: 'generic_chatty_query',
      keptCity: false
    }, '[TEXTSEARCH] Normalized generic chatty query');

    return {
      canonicalTextQuery: canonical,
      wasNormalized: true,
      reason: 'generic_chatty_query',
      keptCity: false
    };
  }

  // No normalization needed
  return {
    canonicalTextQuery: trimmed,
    wasNormalized: false,
    reason: 'no_normalization_needed',
    keptCity: !!cityText
  };
}
