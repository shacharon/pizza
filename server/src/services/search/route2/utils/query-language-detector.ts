/**
 * Query Language Detector
 * Simple deterministic language detection for query text
 * 
 * Rules:
 * - If contains any Hebrew characters (Unicode \u0590-\u05FF) → "he"
 * - Else → "en"
 * 
 * NO dependencies, NO LLM, NO libraries
 */

/**
 * Detect language from query text
 * Returns "he" if contains Hebrew characters, else "en"
 */
export function detectQueryLanguage(query: string): 'he' | 'en' {
  if (!query || typeof query !== 'string') {
    return 'en';
  }

  // Check for Hebrew characters (Unicode range \u0590-\u05FF)
  const hebrewRegex = /[\u0590-\u05FF]/;
  
  if (hebrewRegex.test(query)) {
    return 'he';
  }

  return 'en';
}

/**
 * Check if text contains Hebrew characters
 * Used for validation/logging
 */
export function containsHebrew(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Get Hebrew character count in text
 * Used for validation/logging
 */
export function getHebrewCharCount(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  const matches = text.match(/[\u0590-\u05FF]/g);
  return matches ? matches.length : 0;
}
