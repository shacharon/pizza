/**
 * i18n Service
 * Centralized language management for the restaurant search app
 * 
 * Responsibilities:
 * - Provide current language from WebSocket/backend (assistantLanguage)
 * - Expose translation functions for components
 * - Handle RTL detection
 * - Normalize language codes
 * 
 * Usage:
 * ```typescript
 * readonly i18n = inject(I18nService);
 * readonly currentLang = this.i18n.currentLang;
 * readonly openNowLabel = computed(() => this.i18n.tUi('card.openNow'));
 * ```
 */

import { Injectable } from '@angular/core';
import { t, type Lang, type MsgKey, normalizeLang, isRTL as isRTLLang } from '../i18n/search-narration.i18n';
import { tUi, type UiLang, type UiKey, normalizeUiLang, isRTL as isRTLUi } from '../i18n/ui-strings.i18n';
import { getCuisineLabel } from '../i18n/cuisine-labels.i18n';
import { getSignalLabel, normalizeSignalLang, type SignalLang } from '../domain/i18n/card-signal-labels.i18n';
import type { CardSignalType } from '../domain/types/search.types';

/**
 * i18n Service - Stateless Translation Utility
 * 
 * Provides translation functions with English fallback.
 * Components can optionally pass language explicitly for better control.
 * 
 * Usage:
 * ```typescript
 * readonly i18n = inject(I18nService);
 * // With explicit language:
 * const label = this.i18n.t('en', 'hero.title');
 * // With fallback to English:
 * const label = this.i18n.tUi('card.openNow');
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class I18nService {
  // Function overloads for t()
  t(key: MsgKey, vars?: Record<string, string | number>): string;
  t(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string;
  t(langOrKey: Lang | MsgKey, keyOrVars?: MsgKey | Record<string, string | number>, vars?: Record<string, string | number>): string {
    // Support both signatures:
    // t(key, vars) - English fallback
    // t(lang, key, vars) - explicit language
    if (keyOrVars === undefined || (typeof keyOrVars === 'object' && !this.isLang(langOrKey))) {
      // Single arg or (key, vars) - use English fallback
      return t('en', langOrKey as MsgKey, keyOrVars as Record<string, string | number> | undefined);
    }
    // Two/three args - (lang, key, vars)
    return t(langOrKey as Lang, keyOrVars as MsgKey, vars);
  }

  // Function overloads for tUi()
  tUi(key: UiKey, vars?: Record<string, string | number>): string;
  tUi(lang: UiLang, key: UiKey, vars?: Record<string, string | number>): string;
  tUi(langOrKey: UiLang | UiKey, keyOrVars?: UiKey | Record<string, string | number>, vars?: Record<string, string | number>): string {
    // Support both signatures:
    // tUi(key, vars) - English fallback
    // tUi(lang, key, vars) - explicit language
    if (keyOrVars === undefined || (typeof keyOrVars === 'object' && !this.isUiLang(langOrKey))) {
      // Single arg or (key, vars) - use English fallback
      return tUi('en', langOrKey as UiKey, keyOrVars as Record<string, string | number> | undefined);
    }
    // Two/three args - (lang, key, vars)
    return tUi(langOrKey as UiLang, keyOrVars as UiKey, vars);
  }

  /**
   * Get cuisine label (with emoji)
   * @param tags - Cuisine tags
   * @param lang - UI language code (optional, defaults to 'en')
   */
  getCuisine(tags: string[], lang: UiLang = 'en'): string {
    return getCuisineLabel(tags, lang);
  }

  /**
   * Get signal label
   * @param signalType - Signal type
   * @param lang - Signal language code (optional, defaults to 'en')
   */
  getSignal(signalType: CardSignalType, lang: SignalLang = 'en'): string {
    return getSignalLabel(signalType, lang);
  }

  // Helper type guards
  private isLang(value: string): value is Lang {
    return ['he', 'en', 'ru', 'ar', 'fr', 'es', 'it', 'ja', 'other'].includes(value);
  }

  private isUiLang(value: string): value is UiLang {
    return ['he', 'en', 'ru', 'ar', 'fr', 'es', 'it', 'ja'].includes(value);
  }

  /**
   * Check if language is RTL
   * @param lang - Language code
   */
  isRTL(lang: Lang): boolean {
    return isRTLLang(lang);
  }

  /**
   * Normalize language code
   * @param langCode - Raw language code
   */
  normalizeLang(langCode: string | undefined): Lang {
    return normalizeLang(langCode);
  }

  /**
   * Normalize UI language code
   * @param langCode - Raw language code
   */
  normalizeUiLang(langCode: string | undefined): UiLang {
    return normalizeUiLang(langCode);
  }

  /**
   * Normalize signal language code
   * @param langCode - Raw language code
   */
  normalizeSignalLang(langCode: string | undefined): SignalLang {
    return normalizeSignalLang(langCode);
  }
}
