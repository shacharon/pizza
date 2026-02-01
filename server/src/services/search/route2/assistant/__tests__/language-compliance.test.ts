/**
 * Language Compliance Tests
 * Tests for deterministic language detection helpers
 */

import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import {
  looksRussian,
  looksArabic,
  looksHebrew,
  checkLanguageCompliance,
  getLanguageFallbackMessage
} from '../language-compliance.js';

describe('Language Compliance', () => {
  describe('looksRussian', () => {
    it('should detect Russian text (Cyrillic)', () => {
      assert.ok(looksRussian('Рестораны рядом с Big Ben'));
      assert.ok(looksRussian('Найдены результаты для вашего запроса'));
      assert.ok(looksRussian('Привет мир'));
    });

    it('should reject English text', () => {
      assert.ok(!looksRussian('Hello world'));
      assert.ok(!looksRussian('Found results for your search'));
      assert.ok(!looksRussian('You searched for "Рестораны рядом с Big Ben" and found 20 options'));
    });

    it('should handle mixed text (English with Russian query)', () => {
      // English text with quoted Russian - should fail (no Cyrillic in the explanation)
      const mixed = 'You searched for "Рестораны" and found 20 results';
      assert.ok(!looksRussian(mixed)); // Majority is English
    });

    it('should handle empty text', () => {
      assert.ok(!looksRussian(''));
      assert.ok(!looksRussian('   '));
    });

    it('should handle threshold parameter', () => {
      const mixed = 'Привет world';
      assert.ok(looksRussian(mixed, 0.3)); // 50% Cyrillic passes 30% threshold
      assert.ok(!looksRussian(mixed, 0.7)); // 50% Cyrillic fails 70% threshold
    });
  });

  describe('looksArabic', () => {
    it('should detect Arabic text', () => {
      assert.ok(looksArabic('تم العثور على نتائج'));
      assert.ok(looksArabic('مرحبا بالعالم'));
      assert.ok(looksArabic('ماذا هناك'));
    });

    it('should reject English text', () => {
      assert.ok(!looksArabic('Hello world'));
      assert.ok(!looksArabic('Found results'));
    });

    it('should handle empty text', () => {
      assert.ok(!looksArabic(''));
    });
  });

  describe('looksHebrew', () => {
    it('should detect Hebrew text', () => {
      assert.ok(looksHebrew('מסעדות מסביבי'));
      assert.ok(looksHebrew('שלום עולם'));
      assert.ok(looksHebrew('נמצאו תוצאות'));
    });

    it('should reject English text', () => {
      assert.ok(!looksHebrew('Hello world'));
      assert.ok(!looksHebrew('Found results'));
    });

    it('should handle empty text', () => {
      assert.ok(!looksHebrew(''));
    });
  });

  describe('checkLanguageCompliance', () => {
    it('should pass Russian text for ru language', () => {
      assert.ok(checkLanguageCompliance('Найдены результаты', 'ru'));
      assert.ok(checkLanguageCompliance('Рестораны рядом', 'ru'));
    });

    it('should fail English text for ru language', () => {
      assert.ok(!checkLanguageCompliance('Found results', 'ru'));
      assert.ok(!checkLanguageCompliance('You searched for restaurants', 'ru'));
    });

    it('should pass Arabic text for ar language', () => {
      assert.ok(checkLanguageCompliance('تم العثور على نتائج', 'ar'));
    });

    it('should fail English text for ar language', () => {
      assert.ok(!checkLanguageCompliance('Found results', 'ar'));
    });

    it('should pass Hebrew text for he language', () => {
      assert.ok(checkLanguageCompliance('נמצאו תוצאות', 'he'));
    });

    it('should fail English text for he language', () => {
      assert.ok(!checkLanguageCompliance('Found results', 'he'));
    });

    it('should NOT enforce for Latin scripts (en/fr/es)', () => {
      // No enforcement - always pass
      assert.ok(checkLanguageCompliance('Bonjour monde', 'en')); // French text for EN - passes
      assert.ok(checkLanguageCompliance('Hello world', 'fr')); // English text for FR - passes
      assert.ok(checkLanguageCompliance('Hola mundo', 'en')); // Spanish text for EN - passes
      assert.ok(checkLanguageCompliance('Hello world', 'es')); // English text for ES - passes
    });

    it('should handle empty text', () => {
      assert.ok(checkLanguageCompliance('', 'ru'));
      assert.ok(checkLanguageCompliance('', 'ar'));
      assert.ok(checkLanguageCompliance('', 'he'));
    });
  });

  describe('getLanguageFallbackMessage', () => {
    it('should return Russian fallback for ru', () => {
      const msg = getLanguageFallbackMessage('ru');
      assert.ok(msg.length > 0);
      assert.ok(looksRussian(msg));
    });

    it('should return Arabic fallback for ar', () => {
      const msg = getLanguageFallbackMessage('ar');
      assert.ok(msg.length > 0);
      assert.ok(looksArabic(msg));
    });

    it('should return Hebrew fallback for he', () => {
      const msg = getLanguageFallbackMessage('he');
      assert.ok(msg.length > 0);
      assert.ok(looksHebrew(msg));
    });

    it('should return English fallback for en', () => {
      const msg = getLanguageFallbackMessage('en');
      assert.ok(msg.length > 0);
      assert.ok(!looksRussian(msg));
      assert.ok(!looksArabic(msg));
      assert.ok(!looksHebrew(msg));
    });

    it('should return fallback for all supported languages', () => {
      const languages: Array<'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es'> = ['he', 'en', 'ru', 'ar', 'fr', 'es'];
      for (const lang of languages) {
        const msg = getLanguageFallbackMessage(lang);
        assert.ok(msg.length > 0);
      }
    });
  });
});
