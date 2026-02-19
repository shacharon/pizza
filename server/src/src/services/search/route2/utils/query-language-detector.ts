/**
 * Query Language Detector
 * Deterministic language detection using majority-script heuristic
 * 
 * Rules:
 * 1. Count letters by script (Cyrillic/Arabic/Hebrew/Latin)
 * 2. If one script >= 60% of total letters → return that language
 * 3. If mixed and no dominant script → return "unknown"
 * 4. Ignores short Latin substrings (place names like "Big Ben", "NYC")
 * 
 * NO dependencies, NO LLM, NO libraries
 */

export type QueryLanguage = 'he' | 'en' | 'ru' | 'ar' | 'unknown';

/**
 * Script counts for majority heuristic
 */
interface ScriptCounts {
  cyrillic: number;
  arabic: number;
  hebrew: number;
  latin: number;
  total: number;
}

/**
 * Count letters by script type
 */
function countScripts(query: string): ScriptCounts {
  const counts: ScriptCounts = {
    cyrillic: 0,
    arabic: 0,
    hebrew: 0,
    latin: 0,
    total: 0
  };

  for (const char of query) {
    const code = char.charCodeAt(0);
    
    // Cyrillic: \u0400-\u04FF
    if (code >= 0x0400 && code <= 0x04FF) {
      counts.cyrillic++;
      counts.total++;
    }
    // Arabic: \u0600-\u06FF
    else if (code >= 0x0600 && code <= 0x06FF) {
      counts.arabic++;
      counts.total++;
    }
    // Hebrew: \u0590-\u05FF
    else if (code >= 0x0590 && code <= 0x05FF) {
      counts.hebrew++;
      counts.total++;
    }
    // Latin: A-Z, a-z
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      counts.latin++;
      counts.total++;
    }
  }

  return counts;
}

/**
 * Detect language from query text using majority-script heuristic
 * Returns detected language or "unknown" if mixed with no dominant script
 */
export function detectQueryLanguage(query: string): QueryLanguage {
  if (!query || typeof query !== 'string') {
    return 'unknown';
  }

  const counts = countScripts(query);

  // No letters found → unknown
  if (counts.total === 0) {
    return 'unknown';
  }

  // Majority threshold: 60% of letters
  const threshold = 0.6;

  // Check for dominant script (>= 60% of total letters)
  const cyrillicRatio = counts.cyrillic / counts.total;
  const arabicRatio = counts.arabic / counts.total;
  const hebrewRatio = counts.hebrew / counts.total;
  const latinRatio = counts.latin / counts.total;

  if (cyrillicRatio >= threshold) {
    return 'ru';
  }
  if (arabicRatio >= threshold) {
    return 'ar';
  }
  if (hebrewRatio >= threshold) {
    return 'he';
  }
  if (latinRatio >= threshold) {
    return 'en';
  }

  // Mixed scripts with no dominant script → unknown
  return 'unknown';
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
 * Check if text contains Cyrillic characters
 */
export function containsCyrillic(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return /[\u0400-\u04FF]/.test(text);
}

/**
 * Check if text contains Arabic characters
 */
export function containsArabic(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return /[\u0600-\u06FF]/.test(text);
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
