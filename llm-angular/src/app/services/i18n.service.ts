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

import { Injectable, inject, computed, Signal } from '@angular/core';
import { SearchFacade } from '../../facades/search.facade';
import { t, type Lang, type MsgKey, normalizeLang, isRTL as isRTLLang } from '../i18n/search-narration.i18n';
import { tUi, type UiLang, type UiKey, normalizeUiLang, isRTL as isRTLUi } from '../i18n/ui-strings.i18n';
import { getCuisineLabel, type UiLang as CuisineLang } from '../i18n/cuisine-labels.i18n';
import { getSignalLabel, normalizeSignalLang, type SignalLang } from '../../domain/i18n/card-signal-labels.i18n';
import type { CardSignalType } from '../../domain/types/search.types';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly searchFacade = inject(SearchFacade);

  /**
   * Current language from WebSocket (assistantLanguage)
   * Falls back to 'en' if not available
   */
  readonly currentLang = computed<Lang>(() => {
    const lang = this.searchFacade.assistantLanguage();
    return normalizeLang(lang);
  });

  /**
   * Current UI language (same as currentLang but typed as UiLang)
   */
  readonly currentUiLang = computed<UiLang>(() => {
    const lang = this.searchFacade.assistantLanguage();
    return normalizeUiLang(lang);
  });

  /**
   * Current signal language (same as currentLang but typed as SignalLang)
   */
  readonly currentSignalLang = computed<SignalLang>(() => {
    const lang = this.searchFacade.assistantLanguage();
    return normalizeSignalLang(lang);
  });

  /**
   * Is current language RTL?
   */
  readonly isRTL = computed<boolean>(() => {
    return isRTLLang(this.currentLang());
  });

  /**
   * Translate search narration key
   * Example: t('hero.title')
   */
  t(key: MsgKey, vars?: Record<string, string | number>): string {
    return t(this.currentLang(), key, vars);
  }

  /**
   * Translate UI string key
   * Example: tUi('card.openNow')
   */
  tUi(key: UiKey, vars?: Record<string, string | number>): string {
    return tUi(this.currentUiLang(), key, vars);
  }

  /**
   * Get cuisine label (with emoji)
   * Example: getCuisine(['sushi', 'japanese']) => '🍣 Sushi'
   */
  getCuisine(tags: string[]): string {
    return getCuisineLabel(tags, this.currentUiLang());
  }

  /**
   * Get signal label
   * Example: getSignal('OPEN_NOW') => 'Open now'
   */
  getSignal(signalType: CardSignalType): string {
    return getSignalLabel(signalType, this.currentSignalLang());
  }

  /**
   * Computed version for template use
   * Example: readonly openNowLabel = this.i18n.signal('OPEN_NOW');
   */
  signal(signalType: CardSignalType): Signal<string> {
    return computed(() => this.getSignal(signalType));
  }

  /**
   * Computed version for template use
   * Example: readonly titleLabel = this.i18n.computed('hero.title');
   */
  computed(key: MsgKey, vars?: Record<string, string | number>): Signal<string> {
    return computed(() => this.t(key, vars));
  }

  /**
   * Computed version for UI strings
   * Example: readonly openNowLabel = this.i18n.computedUi('card.openNow');
   */
  computedUi(key: UiKey, vars?: Record<string, string | number>): Signal<string> {
    return computed(() => this.tUi(key, vars));
  }
}
