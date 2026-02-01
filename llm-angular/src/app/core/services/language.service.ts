/**
 * Language Service
 * Manages language and text direction for the app
 */

import { Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';

export type SupportedLang = 'he' | 'en' | 'ar' | 'ru';
export type TextDirection = 'rtl' | 'ltr';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private document = inject(DOCUMENT);
  
  // Reactive signals
  readonly currentLang = signal<SupportedLang>('en');
  readonly textDirection = signal<TextDirection>('ltr');
  
  constructor() {
    // Initialize with browser language or default to English
    const browserLang = this.detectBrowserLanguage();
    this.setLanguage(browserLang);
  }
  
  /**
   * Detect browser language and normalize to supported language
   */
  private detectBrowserLanguage(): SupportedLang {
    if (typeof window === 'undefined' || !window.navigator) {
      return 'en';
    }
    
    const browserLang = (window.navigator.language || 'en').toLowerCase().split('-')[0];
    
    switch (browserLang) {
      case 'he':
      case 'iw': // Old Hebrew code
        return 'he';
      case 'ar':
        return 'ar';
      case 'ru':
        return 'ru';
      case 'en':
      default:
        return 'en';
    }
  }
  
  /**
   * Set application language and update text direction
   * NOTE: UI is ALWAYS LTR - direction does not change based on language
   */
  setLanguage(lang: SupportedLang): void {
    this.currentLang.set(lang);
    
    // ALWAYS LTR - UI never flips to RTL regardless of assistant language
    const direction: TextDirection = 'ltr';
    this.textDirection.set(direction);
    
    // Update HTML attributes
    this.updateHtmlAttributes(lang, direction);
    
    console.log(`[LanguageService] Language set to: ${lang} (direction: ltr - always)`);
  }
  
  /**
   * Update HTML element attributes for language and direction
   */
  private updateHtmlAttributes(lang: string, direction: TextDirection): void {
    const html = this.document.documentElement;
    
    if (html) {
      html.setAttribute('lang', lang);
      html.setAttribute('dir', direction);
    }
  }
  
  /**
   * Get language from search response metadata
   * Call this when search results come back to sync language
   */
  updateFromResponse(language?: string): void {
    if (language) {
      const normalized = this.normalizeLang(language);
      if (normalized !== this.currentLang()) {
        this.setLanguage(normalized);
      }
    }
  }
  
  /**
   * Normalize language string to supported lang
   */
  private normalizeLang(lang: string): SupportedLang {
    const normalized = lang.toLowerCase().split('-')[0];
    
    switch (normalized) {
      case 'he':
      case 'iw':
        return 'he';
      case 'ar':
        return 'ar';
      case 'ru':
        return 'ru';
      case 'en':
      default:
        return 'en';
    }
  }
  
  /**
   * Check if current language is RTL
   */
  isRTL(): boolean {
    return this.textDirection() === 'rtl';
  }
}





