/**
 * Deterministic Google Places Query Normalization
 * 
 * Purpose: Convert canonical food intents into optimal Google Places queries
 * 
 * Design Principles:
 * - LLMs understand language → extract English canonical
 * - Code enforces determinism → same canonical = same Google query
 * - Google-optimized → use terms that Google Places recognizes best
 * 
 * This is NOT translation. This is intent→query mapping for API reliability.
 */

import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Canonical Intent → Google Places Query Mapping
 * 
 * Based on empirical testing of what Google Places API recognizes best.
 * These are NOT literal translations - they're optimized API queries.
 */
const CANONICAL_TO_GOOGLE_QUERY: Record<string, string> = {
  // Meat restaurants
  'meat restaurant': 'steakhouse',
  'steakhouse': 'steakhouse',
  'grill': 'steakhouse',
  'bbq restaurant': 'bbq restaurant',
  'barbecue': 'bbq restaurant',
  
  // Dairy restaurants (Israeli-specific)
  'dairy restaurant': 'dairy restaurant',
  
  // Hummus
  'hummus restaurant': 'hummus',
  'hummus place': 'hummus',
  'hummus': 'hummus',
  
  // Vegetarian/Vegan
  'vegetarian restaurant': 'vegetarian restaurant',
  'vegan restaurant': 'vegan restaurant',
  
  // Cuisines (common)
  'italian restaurant': 'italian restaurant',
  'italian': 'italian restaurant',
  'asian restaurant': 'asian restaurant',
  'chinese restaurant': 'chinese restaurant',
  'japanese restaurant': 'japanese restaurant',
  'sushi restaurant': 'sushi',
  'sushi': 'sushi',
  'indian restaurant': 'indian restaurant',
  'thai restaurant': 'thai restaurant',
  'mexican restaurant': 'mexican restaurant',
  'french restaurant': 'french restaurant',
  'mediterranean restaurant': 'mediterranean restaurant',
  
  // Fast food
  'pizza place': 'pizza',
  'pizza restaurant': 'pizza',
  'pizza': 'pizza',
  'burger place': 'burger',
  'burger restaurant': 'burger',
  'hamburger': 'burger',
  
  // Generic
  'restaurant': 'restaurant',
  'cafe': 'cafe',
  'coffee shop': 'coffee',
  'bakery': 'bakery',
  
  // Kosher (Israeli-specific, keep as-is since Google understands it)
  'kosher restaurant': 'kosher restaurant',
};

/**
 * Recovery mapping: Non-Latin food tokens → English canonical
 * Used when non-Latin script is detected in canonical (fast-path bug recovery)
 */
const NON_LATIN_TO_CANONICAL: Record<string, string> = {
  // Hebrew
  'סושי': 'sushi',
  'מסעדת סושי': 'sushi restaurant',
  'בשרים': 'meat restaurant',
  'מסעדת בשרים': 'meat restaurant',
  'סטייק': 'meat restaurant',
  'חומוס': 'hummus restaurant',
  'חומוסיה': 'hummus restaurant',
  'חומוסייה': 'hummus restaurant',
  'חלבי': 'dairy restaurant',
  'מסעדה חלבית': 'dairy restaurant',
  'צמחוני': 'vegetarian restaurant',
  'מסעדה צמחונית': 'vegetarian restaurant',
  
  // Russian
  'суши': 'sushi',
  'ресторан суши': 'sushi restaurant',
  'мясной': 'meat restaurant',
  'мясной ресторан': 'meat restaurant',
  'хумус': 'hummus restaurant',
  'хумусия': 'hummus restaurant',
  'молочный': 'dairy restaurant',
  'молочный ресторан': 'dairy restaurant',
  'вегетарианский': 'vegetarian restaurant',
};

/**
 * Attempt to recover English canonical from non-Latin tokens
 * @param nonLatinText - Text containing Hebrew/Russian/Arabic
 * @param requestId - For logging
 * @returns Recovered English canonical or null
 */
function attemptRecovery(
  nonLatinText: string,
  requestId?: string
): string | null {
  const normalized = nonLatinText.toLowerCase().trim();
  
  // Try exact match first
  if (NON_LATIN_TO_CANONICAL[normalized]) {
    logger.info({
      requestId,
      nonLatinText,
      recovered: NON_LATIN_TO_CANONICAL[normalized],
      matchType: 'exact'
    }, '[GoogleQueryNormalizer] Recovery applied (exact match)');
    return NON_LATIN_TO_CANONICAL[normalized];
  }
  
  // Try partial match (for compound queries like "מסעדת סושי במרכז")
  for (const [token, canonical] of Object.entries(NON_LATIN_TO_CANONICAL)) {
    if (normalized.includes(token.toLowerCase())) {
      logger.info({
        requestId,
        nonLatinText,
        recovered: canonical,
        matchType: 'partial',
        matchedToken: token
      }, '[GoogleQueryNormalizer] Recovery applied (partial match)');
      return canonical;
    }
  }
  
  return null;
}

/**
 * Normalize a canonical food category into an optimal Google Places query
 * 
 * @param canonicalCategory - English canonical from LLM (e.g., "meat restaurant")
 * @param requestId - For logging correlation
 * @returns Optimized Google Places query (e.g., "steakhouse")
 */
export function normalizeToGoogleQuery(
  canonicalCategory: string | null | undefined,
  requestId?: string
): string {
  // Guard: null/undefined/empty → return generic fallback
  if (!canonicalCategory || canonicalCategory.trim() === '') {
    logger.debug({ requestId, canonicalCategory }, '[GoogleQueryNormalizer] Empty canonical, using fallback');
    return 'restaurant';
  }
  
  const normalized = canonicalCategory.toLowerCase().trim();
  
  // Direct mapping (Latin canonical → Google query)
  if (CANONICAL_TO_GOOGLE_QUERY[normalized]) {
    const googleQuery = CANONICAL_TO_GOOGLE_QUERY[normalized];
    
    if (googleQuery !== canonicalCategory) {
      logger.debug({
        requestId,
        canonicalCategory,
        googleQuery,
        normalized: true
      }, '[GoogleQueryNormalizer] Applied normalization');
    }
    
    return googleQuery;
  }
  
  // SAFETY: Check if non-Latin leaked through (fast-path bug)
  if (!isValidGoogleQuery(canonicalCategory)) {
    logger.warn({
      requestId,
      canonicalCategory,
      reason: 'non_latin_detected'
    }, '[GoogleQueryNormalizer] Non-Latin detected, attempting recovery');
    
    // Attempt recovery: non-Latin → English canonical
    const recovered = attemptRecovery(canonicalCategory, requestId);
    
    if (recovered) {
      // Recursively normalize the recovered canonical
      const finalQuery = normalizeToGoogleQuery(recovered, requestId);
      
      logger.info({
        requestId,
        originalCanonical: canonicalCategory,
        recoveredCanonical: recovered,
        finalGoogleQuery: finalQuery
      }, '[GoogleQueryNormalizer] Recovery successful');
      
      return finalQuery;
    }
    
    // Recovery failed - fall back to generic
    logger.error({
      requestId,
      canonicalCategory,
      reason: 'recovery_failed'
    }, '[GoogleQueryNormalizer] Recovery failed, falling back to generic');
    
    return 'restaurant';
  }
  
  // Fallback: use canonical as-is (already in English from LLM)
  logger.debug({
    requestId,
    canonicalCategory,
    normalized: false,
    reason: 'no_mapping_found'
  }, '[GoogleQueryNormalizer] Using canonical as-is');
  
  return canonicalCategory;
}

/**
 * Validate that a query is safe to send to Google Places
 * Detects if Hebrew/Russian/Arabic tokens leaked through
 */
export function isValidGoogleQuery(query: string): boolean {
  // Detect non-Latin scripts (Hebrew, Russian, Arabic)
  const hasHebrew = /[\u0590-\u05FF]/.test(query);
  const hasRussian = /[\u0400-\u04FF]/.test(query);
  const hasArabic = /[\u0600-\u06FF]/.test(query);
  
  return !hasHebrew && !hasRussian && !hasArabic;
}

/**
 * Get all supported canonical categories (for documentation/testing)
 */
export function getSupportedCanonicals(): string[] {
  return Object.keys(CANONICAL_TO_GOOGLE_QUERY);
}
