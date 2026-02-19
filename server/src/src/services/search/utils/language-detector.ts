import type { RequestLanguage, GoogleLanguage } from '../types/search.types.js';

/**
 * Language Detection Service
 * Detects the language of user query text using character set heuristics
 * 
 * This is a fast, deterministic approach that doesn't require external APIs
 */
export class LanguageDetector {
  /**
   * Detect language from query text
   * Uses character set heuristics (fast, no external API)
   * 
   * @param text - User query text
   * @returns RequestLanguage enum value
   */
  static detect(text: string): RequestLanguage {
    if (!text || text.trim().length === 0) {
      return 'en';
    }
    
    const normalized = text.toLowerCase().trim();
    
    // Hebrew: has Hebrew characters (U+0590 to U+05FF)
    if (/[\u0590-\u05FF]/.test(normalized)) {
      return 'he';
    }
    
    // Arabic: has Arabic characters (U+0600 to U+06FF)
    if (/[\u0600-\u06FF]/.test(normalized)) {
      return 'ar';
    }
    
    // Russian/Cyrillic (U+0400 to U+04FF)
    if (/[\u0400-\u04FF]/.test(normalized)) {
      return 'ru';
    }
    
    // French indicators (accents + common words)
    const frenchIndicators = ['à', 'é', 'è', 'ê', 'ù', 'ç', 'sur les', 'dans le', 'près de'];
    if (frenchIndicators.some(ind => normalized.includes(ind))) {
      return 'fr';
    }
    
    // Spanish indicators
    const spanishIndicators = ['ñ', 'á', 'í', 'ó', 'ú', 'en el', 'cerca de'];
    if (spanishIndicators.some(ind => normalized.includes(ind))) {
      return 'es';
    }
    
    // German indicators
    const germanIndicators = ['ä', 'ö', 'ü', 'ß', 'auf der', 'in der'];
    if (germanIndicators.some(ind => normalized.includes(ind))) {
      return 'de';
    }
    
    // Default to English for Latin script
    return 'en';
  }
  
  /**
   * Determine Google API language from request language
   * 
   * Rule: Hebrew → 'he', everything else → 'en' (universal fallback)
   * This ensures consistent Google Places results across all non-Hebrew languages
   * 
   * @param requestLang - Detected request language
   * @returns GoogleLanguage ('he' or 'en')
   */
  static toGoogleLanguage(requestLang: RequestLanguage): GoogleLanguage {
    return requestLang === 'he' ? 'he' : 'en';
  }
  
  /**
   * Determine UI language from request language
   * 
   * Rule: Hebrew → 'he', everything else → 'en'
   * UI currently only supports Hebrew and English
   * 
   * @param requestLang - Detected request language
   * @returns UILanguage ('he' or 'en')
   */
  static toUILanguage(requestLang: RequestLanguage): 'he' | 'en' {
    return requestLang === 'he' ? 'he' : 'en';
  }
}

