/**
 * Language Detection Module
 * Script-based language detection and normalization
 */

export type AssistantLanguage = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';

/**
 * Simple script-based language detection for debug logging
 * Returns first detected script or 'unknown'
 */
export function detectMessageLanguage(text: string): string {
  if (!text || typeof text !== 'string') return 'unknown';

  // Strong script signals
  if (/[\u0590-\u05FF]/.test(text)) return 'he'; // Hebrew
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic

  // Latin as a catch-all for en/fr/es (script-only heuristic)
  if (/[a-zA-Z]/.test(text)) return 'latin';

  return 'unknown';
}

/**
 * Get first N chars of text for preview (safe truncation)
 */
export function getMessagePreview(text: string, maxChars: number = 80): string {
  if (!text) return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
}

/**
 * Normalize language (convert 'other' to 'en')
 */
export function normalizeRequestedLanguage(lang: AssistantLanguage): Exclude<AssistantLanguage, 'other'> {
  return lang === 'other' ? 'en' : lang;
}

/**
 * Get human-readable language name
 */
export function getLanguageName(lang: Exclude<AssistantLanguage, 'other'>): string {
  switch (lang) {
    case 'he': return 'Hebrew';
    case 'en': return 'English';
    case 'ar': return 'Arabic';
    case 'ru': return 'Russian';
    case 'fr': return 'French';
    case 'es': return 'Spanish';
  }
}

/**
 * Get language emphasis instruction for LLM prompt
 */
export function getLanguageEmphasis(lang: Exclude<AssistantLanguage, 'other'>): string {
  switch (lang) {
    case 'he': return 'MUST write in Hebrew (עברית) only';
    case 'en': return 'MUST write in English only';
    case 'ar': return 'MUST write in Arabic (العربية) only';
    case 'ru': return 'MUST write in Russian (русский) only';
    case 'fr': return 'MUST write in French (français) only';
    case 'es': return 'MUST write in Spanish (español) only';
  }
}

/**
 * Detect language mismatch (script-based heuristic)
 */
export function detectMismatch(messageLang: string, requested: Exclude<AssistantLanguage, 'other'>): boolean {
  // script-only heuristic:
  // he/ru/ar are strict; for en/fr/es we accept 'latin'
  if (requested === 'he') return messageLang !== 'he';
  if (requested === 'ru') return messageLang !== 'ru';
  if (requested === 'ar') return messageLang !== 'ar';
  // en/fr/es are latin script in practice
  if (requested === 'en' || requested === 'fr' || requested === 'es') return messageLang !== 'latin';
  return false;
}
