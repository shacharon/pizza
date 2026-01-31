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
 * ==================================================================================
 * DEPRECATED: The following patterns and helper functions are NO LONGER USED.
 * They were part of the deterministic Hebrew-specific rewriting logic.
 * 
 * Kept for historical reference only. Can be removed in future cleanup.
 * ==================================================================================
 */

/**
 * Patterns for generic Hebrew food queries (conversational/chatty)
 * @deprecated No longer used - LLM handles query understanding
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
 * @deprecated No longer used - LLM handles cuisine detection
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
 * @deprecated No longer used - LLM handles query understanding
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
 * @deprecated No longer used - LLM handles cuisine detection
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
 * @deprecated No longer used - LLM handles city extraction
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
 * DISABLED (P0 FIX): This normalizer has been converted to a no-op.
 * Previously, it used deterministic Hebrew-specific regex patterns to rewrite queries.
 * Now, the canonical query is produced exclusively by Route-LLM (canonical-query.generator.ts).
 * 
 * Rationale:
 * - Avoid double-rewriting (LLM already produces optimized queries)
 * - Remove Hebrew-specific hardcoded patterns (GENERIC_FOOD_PATTERNS, CUISINE_KEYWORDS)
 * - Keep function signature intact for existing call sites
 * 
 * @param textQuery Original text query from mapper (already processed by LLM)
 * @param cityText Explicit city from intent (unused now)
 * @param requestId For logging (unused now)
 * @returns Original query unchanged
 */
export function normalizeTextQuery(
  textQuery: string,
  cityText?: string | null,
  requestId?: string
): { canonicalTextQuery: string; wasNormalized: boolean; reason: string; keptCity?: boolean } {
  // No-op: Return input unchanged
  // Canonical query generation is handled by Route-LLM (canonical-query.generator.ts)
  return {
    canonicalTextQuery: textQuery.trim(),
    wasNormalized: false,
    reason: 'noop_llm_driven',
    keptCity: !!cityText
  };
}
