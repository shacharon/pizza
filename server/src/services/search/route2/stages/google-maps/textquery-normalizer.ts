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
 * Normalize textQuery for Google Places Text Search
 * 
 * Rules:
 * 1. If query is generic Hebrew "מה יש לאכול היום/עכשיו/משהו לאכול" => "מסעדות"
 * 2. If query mentions "מסעדות" already => keep it
 * 3. If query mentions a cuisine/food word (pizza/sushi/etc) => prefer that term
 * 4. Otherwise => return original query
 * 
 * @param textQuery Original text query from mapper
 * @param requestId For logging
 * @returns Canonical text query
 */
export function normalizeTextQuery(
  textQuery: string,
  requestId?: string
): { canonicalTextQuery: string; wasNormalized: boolean; reason: string } {
  const trimmed = textQuery.trim();
  const lowerQuery = trimmed.toLowerCase();

  // Check if it already mentions "מסעדות" or "restaurant"
  if (lowerQuery.includes('מסעדות') || lowerQuery.includes('restaurant')) {
    return {
      canonicalTextQuery: trimmed,
      wasNormalized: false,
      reason: 'already_has_category'
    };
  }

  // Extract cuisine keyword if present (e.g., "pizza", "sushi")
  const cuisineKeyword = extractCuisineKeyword(trimmed);
  if (cuisineKeyword) {
    const canonical = cuisineKeyword;
    const rawHash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8);

    logger.info({
      requestId,
      event: 'textquery_normalized',
      rawHash,
      canonicalTextQuery: canonical,
      reason: 'extracted_cuisine'
    }, '[TEXTSEARCH] Normalized to cuisine keyword');

    return {
      canonicalTextQuery: canonical,
      wasNormalized: true,
      reason: 'extracted_cuisine'
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
      canonicalTextQuery: canonical,
      reason: 'generic_chatty_query'
    }, '[TEXTSEARCH] Normalized generic chatty query');

    return {
      canonicalTextQuery: canonical,
      wasNormalized: true,
      reason: 'generic_chatty_query'
    };
  }

  // No normalization needed
  return {
    canonicalTextQuery: trimmed,
    wasNormalized: false,
    reason: 'no_normalization_needed'
  };
}
