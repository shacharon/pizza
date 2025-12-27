/**
 * I18nService
 * Simple translation service for deterministic backend messages
 * No external dependencies - just loads JSON and interpolates
 */

import type { Lang, TranslationVars, Translations } from './i18n.types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class I18nService {
  private translations: Map<Lang, Translations> = new Map();
  
  constructor() {
    this.loadTranslations();
  }
  
  /**
   * Load all translation files
   */
  private loadTranslations(): void {
    const languages: Lang[] = ['he', 'en', 'ar', 'ru'];
    
    for (const lang of languages) {
      try {
        const filePath = join(__dirname, 'translations', `${lang}.json`);
        const content = readFileSync(filePath, 'utf-8');
        this.translations.set(lang, JSON.parse(content) as Translations);
      } catch (error) {
        console.warn(`[I18n] Failed to load ${lang}.json:`, error);
        // Fallback to English for missing translations
        if (lang !== 'en') {
          console.warn(`[I18n] ${lang} will fall back to English`);
        }
      }
    }
  }
  
  /**
   * Get translation by nested key path
   * Example: t('chip.delivery', 'he') -> 'משלוחים'
   */
  t(keyPath: string, lang: Lang, vars?: TranslationVars): string {
    const translation = this.translations.get(lang) || this.translations.get('en');
    
    if (!translation) {
      console.error('[I18n] No translations loaded, returning key');
      return keyPath;
    }
    
    // Navigate nested object: 'chip.delivery' -> translation.chip.delivery
    const keys = keyPath.split('.');
    let value: any = translation;
    
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) {
        console.warn(`[I18n] Missing translation key: ${keyPath} for ${lang}`);
        // Try English fallback
        if (lang !== 'en') {
          return this.t(keyPath, 'en', vars);
        }
        return keyPath; // Last resort: return the key itself
      }
    }
    
    // Interpolate variables
    if (typeof value === 'string' && vars) {
      return this.interpolate(value, vars);
    }
    
    return value;
  }
  
  /**
   * Interpolate variables into string
   * Example: "Found {{count}} places" + {count: 5} -> "Found 5 places"
   */
  private interpolate(template: string, vars: TranslationVars): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = vars[key];
      return value !== undefined ? String(value) : `{{${key}}}`;
    });
  }
  
  /**
   * Check if a language is supported
   */
  isSupported(lang: string): boolean {
    return this.translations.has(lang as Lang);
  }
  
  /**
   * Get all supported languages
   */
  getSupportedLanguages(): Lang[] {
    return Array.from(this.translations.keys());
  }
}

// Singleton instance
let i18nInstance: I18nService | null = null;

/**
 * Get or create i18n service instance
 */
export function getI18n(): I18nService {
  if (!i18nInstance) {
    i18nInstance = new I18nService();
  }
  return i18nInstance;
}

