/**
 * Near-Me Query Detector
 * 
 * Deterministic detection of queries that imply "near me" / "לידי"
 * Used for location requirement enforcement
 */

const NEAR_ME_PATTERNS = [
  // Hebrew
  'לידי',
  'לידיי',
  'ממני',
  'קרוב אליי',
  'קרוב אלי',
  'בסביבה',
  'בסביבתי',
  'באזור שלי',
  'בקרבתי',
  
  // English
  'near me',
  'nearby',
  'around me',
  'close to me',
  'in my area'
];

/**
 * Check if query implies "near me" location intent
 * 
 * @param query User search query
 * @returns true if query contains near-me keywords
 */
export function isNearMeQuery(query: string): boolean {
  const normalized = query.toLowerCase().trim();
  
  return NEAR_ME_PATTERNS.some(pattern => 
    normalized.includes(pattern.toLowerCase())
  );
}

/**
 * Extract matched near-me pattern for logging
 * 
 * @param query User search query
 * @returns Matched pattern or null
 */
export function getNearMePattern(query: string): string | null {
  const normalized = query.toLowerCase().trim();
  
  const matched = NEAR_ME_PATTERNS.find(pattern => 
    normalized.includes(pattern.toLowerCase())
  );
  
  return matched || null;
}
