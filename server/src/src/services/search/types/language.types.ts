/**
 * Language Type Definitions
 * Language normalization and context types for search
 */

/**
 * UI display language (chips, assistant, errors)
 * This determines the language of the app UI elements
 * Supports 8 languages: he, en, ru, ar, fr, es, de, it
 */
export type UILanguage = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it';

/**
 * Detected language of user's raw query (informational only)
 * Can be any language - used for logging and language-aware processing
 * Note: Does not include 'other' or 'unknown' - use toRequestLanguage() to normalize
 */
export type RequestLanguage = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'de' | 'it';

/**
 * Language parameter sent to Google Places API
 * Rule: Hebrew → 'he', everything else → 'en' (universal fallback)
 */
export type GoogleLanguage = 'he' | 'en';

/**
 * Language context for a search request
 * Separates three distinct language concepts for consistent behavior
 */
export interface LanguageContext {
  uiLanguage: UILanguage;           // App display language (8 languages: he, en, ru, ar, fr, es, de, it)
  requestLanguage: RequestLanguage; // Detected from query (any language)
  googleLanguage: GoogleLanguage;   // Sent to Google API (he if Hebrew, else en)
}
