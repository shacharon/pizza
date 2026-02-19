/**
 * Language Detector Tests
 */

import {
  detectMessageLanguage,
  getMessagePreview,
  normalizeRequestedLanguage,
  getLanguageName,
  getLanguageEmphasis,
  detectMismatch
} from '../language-detector.js';

describe('language-detector', () => {
  describe('detectMessageLanguage', () => {
    it('detects Hebrew text', () => {
      expect(detectMessageLanguage('שלום עולם')).toBe('he');
      expect(detectMessageLanguage('כדי לחפש מסעדות')).toBe('he');
    });

    it('detects Russian (Cyrillic) text', () => {
      expect(detectMessageLanguage('Привет мир')).toBe('ru');
      expect(detectMessageLanguage('Чтобы найти рестораны')).toBe('ru');
    });

    it('detects Arabic text', () => {
      expect(detectMessageLanguage('مرحبا بالعالم')).toBe('ar');
      expect(detectMessageLanguage('للبحث عن مطاعم')).toBe('ar');
    });

    it('detects Latin script for English/French/Spanish', () => {
      expect(detectMessageLanguage('Hello world')).toBe('latin');
      expect(detectMessageLanguage('Bonjour le monde')).toBe('latin');
      expect(detectMessageLanguage('Hola mundo')).toBe('latin');
    });

    it('uses majority script in mixed text (avoids false mismatch for en + Hebrew names)', () => {
      // More Latin than Hebrew → latin (e.g. English with place name "שלום")
      expect(detectMessageLanguage('שלום hello')).toBe('latin');
      expect(detectMessageLanguage('hello שלום')).toBe('latin');
      // More Cyrillic than Latin → ru
      expect(detectMessageLanguage('Привет hello')).toBe('ru');
      // Mostly Hebrew → he
      expect(detectMessageLanguage('מצאתי 19 תוצאות. Beit tamar ב גדרה.')).toBe('he');
    });

    it('handles empty and invalid inputs', () => {
      expect(detectMessageLanguage('')).toBe('unknown');
      expect(detectMessageLanguage(null as any)).toBe('unknown');
      expect(detectMessageLanguage(undefined as any)).toBe('unknown');
      expect(detectMessageLanguage(123 as any)).toBe('unknown');
    });

    it('handles text with only numbers/punctuation', () => {
      expect(detectMessageLanguage('123 456')).toBe('unknown');
      expect(detectMessageLanguage('!@#$%')).toBe('unknown');
    });

    it('detects script even with mixed punctuation', () => {
      expect(detectMessageLanguage('שלום! איך אתה?')).toBe('he');
      expect(detectMessageLanguage('Hello! How are you?')).toBe('latin');
    });
  });

  describe('getMessagePreview', () => {
    it('returns full text when shorter than limit', () => {
      expect(getMessagePreview('Hello')).toBe('Hello');
      expect(getMessagePreview('Test', 10)).toBe('Test');
    });

    it('truncates text longer than limit with ellipsis', () => {
      const longText = 'a'.repeat(100);
      const preview = getMessagePreview(longText, 80);
      expect(preview).toBe('a'.repeat(80) + '...');
      expect(preview.length).toBe(83); // 80 + '...'
    });

    it('uses default limit of 80 chars', () => {
      const text = 'a'.repeat(100);
      const preview = getMessagePreview(text);
      expect(preview.length).toBe(83);
    });

    it('handles empty string', () => {
      expect(getMessagePreview('')).toBe('');
    });

    it('handles null/undefined', () => {
      expect(getMessagePreview(null as any)).toBe('');
      expect(getMessagePreview(undefined as any)).toBe('');
    });
  });

  describe('normalizeRequestedLanguage', () => {
    it('converts "other" to "en"', () => {
      expect(normalizeRequestedLanguage('other')).toBe('en');
    });

    it('keeps valid languages unchanged', () => {
      expect(normalizeRequestedLanguage('he')).toBe('he');
      expect(normalizeRequestedLanguage('en')).toBe('en');
      expect(normalizeRequestedLanguage('ar')).toBe('ar');
      expect(normalizeRequestedLanguage('ru')).toBe('ru');
      expect(normalizeRequestedLanguage('fr')).toBe('fr');
      expect(normalizeRequestedLanguage('es')).toBe('es');
    });
  });

  describe('getLanguageName', () => {
    it('returns human-readable language names', () => {
      expect(getLanguageName('he')).toBe('Hebrew');
      expect(getLanguageName('en')).toBe('English');
      expect(getLanguageName('ar')).toBe('Arabic');
      expect(getLanguageName('ru')).toBe('Russian');
      expect(getLanguageName('fr')).toBe('French');
      expect(getLanguageName('es')).toBe('Spanish');
    });
  });

  describe('getLanguageEmphasis', () => {
    it('returns emphasis instruction for each language', () => {
      expect(getLanguageEmphasis('he')).toContain('Hebrew');
      expect(getLanguageEmphasis('he')).toContain('עברית');
      expect(getLanguageEmphasis('en')).toContain('English only');
      expect(getLanguageEmphasis('ar')).toContain('Arabic');
      expect(getLanguageEmphasis('ru')).toContain('Russian');
      expect(getLanguageEmphasis('fr')).toContain('French');
      expect(getLanguageEmphasis('es')).toContain('Spanish');
    });
  });

  describe('detectMismatch', () => {
    it('detects Hebrew mismatch correctly', () => {
      expect(detectMismatch('he', 'he')).toBe(false);
      expect(detectMismatch('latin', 'he')).toBe(true);
      expect(detectMismatch('ru', 'he')).toBe(true);
      expect(detectMismatch('ar', 'he')).toBe(true);
    });

    it('detects Russian mismatch correctly', () => {
      expect(detectMismatch('ru', 'ru')).toBe(false);
      expect(detectMismatch('he', 'ru')).toBe(true);
      expect(detectMismatch('latin', 'ru')).toBe(true);
    });

    it('detects Arabic mismatch correctly', () => {
      expect(detectMismatch('ar', 'ar')).toBe(false);
      expect(detectMismatch('he', 'ar')).toBe(true);
      expect(detectMismatch('latin', 'ar')).toBe(true);
    });

    it('accepts latin script for en/fr/es', () => {
      expect(detectMismatch('latin', 'en')).toBe(false);
      expect(detectMismatch('latin', 'fr')).toBe(false);
      expect(detectMismatch('latin', 'es')).toBe(false);
    });

    it('rejects non-latin script for en/fr/es', () => {
      expect(detectMismatch('he', 'en')).toBe(true);
      expect(detectMismatch('ru', 'fr')).toBe(true);
      expect(detectMismatch('ar', 'es')).toBe(true);
    });
  });
});
