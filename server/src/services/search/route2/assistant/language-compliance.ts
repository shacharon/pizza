/**
 * Language Compliance Utilities
 * 
 * Deterministic checks to verify LLM output matches requested language.
 * Used as cheap fallback when LLM outputs wrong language despite instructions.
 * 
 * PHILOSOPHY:
 * - Strict enforcement ONLY for non-Latin scripts (ru/ar/he) where detection is reliable
 * - No enforcement for Latin-based languages (en/fr/es) to avoid false positives
 * - Fallback replaces message with deterministic text in correct language
 */

/**
 * Check if text contains significant Cyrillic characters (Russian)
 * Cyrillic Unicode range: U+0400 to U+04FF
 * 
 * @param text - Text to check
 * @param threshold - Minimum ratio of Cyrillic to total letters (default 0.3)
 * @returns true if text appears to be Russian
 */
export function looksRussian(text: string, threshold: number = 0.3): boolean {
  if (!text || text.length === 0) return false;

  // Count Cyrillic characters (U+0400 to U+04FF)
  const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) || []).length;

  // Count total letter characters (exclude spaces, punctuation, numbers)
  const totalLetters = (text.match(/[A-Za-zА-Яа-яЁё\u0400-\u04FF]/g) || []).length;

  if (totalLetters === 0) return false;

  const ratio = cyrillicChars / totalLetters;
  return ratio >= threshold;
}

/**
 * Check if text contains Arabic script
 * Arabic Unicode range: U+0600 to U+06FF (Basic Arabic)
 * 
 * @param text - Text to check
 * @param threshold - Minimum ratio of Arabic to total letters (default 0.3)
 * @returns true if text appears to be Arabic
 */
export function looksArabic(text: string, threshold: number = 0.3): boolean {
  if (!text || text.length === 0) return false;

  // Count Arabic characters (U+0600 to U+06FF)
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;

  // Count total letter characters
  const totalLetters = (text.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;

  if (totalLetters === 0) return false;

  const ratio = arabicChars / totalLetters;
  return ratio >= threshold;
}

/**
 * Check if text contains Hebrew script
 * Hebrew Unicode range: U+0590 to U+05FF
 * 
 * @param text - Text to check
 * @param threshold - Minimum ratio of Hebrew to total letters (default 0.3)
 * @returns true if text appears to be Hebrew
 */
export function looksHebrew(text: string, threshold: number = 0.3): boolean {
  if (!text || text.length === 0) return false;

  // Count Hebrew characters (U+0590 to U+05FF)
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;

  // Count total letter characters
  const totalLetters = (text.match(/[A-Za-z\u0590-\u05FF]/g) || []).length;

  if (totalLetters === 0) return false;

  const ratio = hebrewChars / totalLetters;
  return ratio >= threshold;
}

/**
 * Check if LLM output complies with requested language
 * 
 * STRICT ENFORCEMENT: Only for non-Latin scripts (ru/ar/he)
 * NO ENFORCEMENT: For Latin scripts (en/fr/es) to avoid false positives
 * 
 * @param text - Text to check
 * @param requestedLanguage - Expected language
 * @returns true if text matches requested language (or enforcement not needed)
 */
export function checkLanguageCompliance(
  text: string,
  requestedLanguage: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es'
): boolean {
  // Skip empty text
  if (!text || text.length === 0) return true;

  // Enforce only for non-Latin scripts
  switch (requestedLanguage) {
    case 'ru':
      return looksRussian(text);
    case 'ar':
      return looksArabic(text);
    case 'he':
      return looksHebrew(text);
    // No enforcement for Latin scripts (too many false positives)
    case 'en':
    case 'fr':
    case 'es':
    default:
      return true;
  }
}

/**
 * Get deterministic fallback message in requested language
 * Used when LLM fails to comply with language instructions
 * 
 * @param requestedLanguage - Target language
 * @returns Short fallback message (1-2 sentences) in requested language
 */
export function getLanguageFallbackMessage(
  requestedLanguage: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es'
): string {
  const fallbacks: Record<string, string> = {
    ru: 'Найдены результаты для вашего запроса. Просмотрите рестораны ниже.',
    ar: 'تم العثور على نتائج لطلبك. تصفح المطاعم أدناه.',
    he: 'נמצאו תוצאות לחיפושך. עיין במסעדות למטה.',
    en: 'Found results for your search. Browse the restaurants below.',
    fr: 'Résultats trouvés pour votre recherche. Parcourez les restaurants ci-dessous.',
    es: 'Se encontraron resultados para su búsqueda. Explore los restaurantes a continuación.'
  };

  return fallbacks[requestedLanguage] || fallbacks['en'];
}
