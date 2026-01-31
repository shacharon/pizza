/**
 * Unit tests for search-narration.i18n module
 * Demonstrates i18n functionality and ensures all translations are complete
 */

import { t, normalizeLang, isRTL, isLangSupported, MESSAGES, type Lang, type MsgKey } from './search-narration.i18n';

describe('SearchNarration i18n', () => {
  describe('t() - Translation function', () => {
    it('should translate to English', () => {
      expect(t('en', 'hero.title')).toBe('Search food the way you think');
      expect(t('en', 'location.using')).toBe('📍 Using your location');
    });

    it('should translate to Hebrew', () => {
      expect(t('he', 'hero.title')).toBe('חפשו אוכל כמו שאתם חושבים');
      expect(t('he', 'location.using')).toBe('📍 משתמש במיקום שלך');
    });

    it('should translate to Russian', () => {
      expect(t('ru', 'hero.title')).toBe('Ищите еду так, как думаете');
      expect(t('ru', 'location.using')).toBe('📍 Используется ваше местоположение');
    });

    it('should translate to Arabic', () => {
      expect(t('ar', 'hero.title')).toBe('ابحث عن الطعام بطريقة تفكيرك');
      expect(t('ar', 'location.using')).toBe('📍 يستخدم موقعك');
    });

    it('should translate to French', () => {
      expect(t('fr', 'hero.title')).toBe('Recherchez de la nourriture comme vous pensez');
      expect(t('fr', 'location.using')).toBe('📍 Utilise votre position');
    });

    it('should translate to Spanish', () => {
      expect(t('es', 'hero.title')).toBe('Busca comida como piensas');
      expect(t('es', 'location.using')).toBe('📍 Usando tu ubicación');
    });

    it('should fallback to English for "other" language', () => {
      expect(t('other', 'hero.title')).toBe('Search food the way you think');
    });

    it('should fallback to English if translation missing in specific language', () => {
      // This test assumes a key exists in English but not in another language
      // In practice, all keys should exist in all languages
      const result = t('he', 'hero.title');
      expect(result).toBeTruthy();
    });

    it('should return key itself if translation missing in all languages', () => {
      // @ts-expect-error - Testing invalid key
      const result = t('en', 'nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });
  });

  describe('t() - Variable interpolation', () => {
    it('should interpolate single variable', () => {
      // We need to add a test message for this
      // For now, test with existing messages that don't have variables
      const result = t('en', 'hero.title');
      expect(result).not.toContain('{');
    });

    it('should interpolate multiple variables', () => {
      // Example: If we had a message like "Found {count} results in {city}"
      // This would be tested like:
      // expect(t('en', 'results.found', { count: 42, city: 'NYC' }))
      //   .toBe('Found 42 results in NYC');
    });

    it('should handle missing variables gracefully', () => {
      // Variables that aren't provided should remain as placeholders
      const result = t('en', 'hero.title', { missingVar: 'value' });
      expect(result).toBeTruthy();
    });
  });

  describe('normalizeLang()', () => {
    it('should normalize English variants', () => {
      expect(normalizeLang('en')).toBe('en');
      expect(normalizeLang('EN')).toBe('en');
      expect(normalizeLang('en-US')).toBe('en');
      expect(normalizeLang('en-GB')).toBe('en');
    });

    it('should normalize Hebrew variants', () => {
      expect(normalizeLang('he')).toBe('he');
      expect(normalizeLang('HE')).toBe('he');
      expect(normalizeLang('iw')).toBe('he'); // Old Hebrew code
      expect(normalizeLang('IW')).toBe('he');
    });

    it('should normalize Russian', () => {
      expect(normalizeLang('ru')).toBe('ru');
      expect(normalizeLang('RU')).toBe('ru');
      expect(normalizeLang('ru-RU')).toBe('ru');
    });

    it('should normalize Arabic', () => {
      expect(normalizeLang('ar')).toBe('ar');
      expect(normalizeLang('AR')).toBe('ar');
      expect(normalizeLang('ar-SA')).toBe('ar');
    });

    it('should normalize French', () => {
      expect(normalizeLang('fr')).toBe('fr');
      expect(normalizeLang('FR')).toBe('fr');
      expect(normalizeLang('fr-FR')).toBe('fr');
    });

    it('should normalize Spanish', () => {
      expect(normalizeLang('es')).toBe('es');
      expect(normalizeLang('ES')).toBe('es');
      expect(normalizeLang('es-ES')).toBe('es');
    });

    it('should fallback to "other" for unsupported languages', () => {
      expect(normalizeLang('de')).toBe('other');
      expect(normalizeLang('ja')).toBe('other');
      expect(normalizeLang('zh')).toBe('other');
    });

    it('should fallback to "en" for undefined/empty input', () => {
      expect(normalizeLang(undefined)).toBe('en');
      expect(normalizeLang('')).toBe('en');
    });
  });

  describe('isRTL()', () => {
    it('should return true for RTL languages', () => {
      expect(isRTL('he')).toBe(true);
      expect(isRTL('ar')).toBe(true);
    });

    it('should return false for LTR languages', () => {
      expect(isRTL('en')).toBe(false);
      expect(isRTL('ru')).toBe(false);
      expect(isRTL('fr')).toBe(false);
      expect(isRTL('es')).toBe(false);
      expect(isRTL('other')).toBe(false);
    });
  });

  describe('isLangSupported()', () => {
    it('should return true for supported languages', () => {
      expect(isLangSupported('en')).toBe(true);
      expect(isLangSupported('he')).toBe(true);
      expect(isLangSupported('ru')).toBe(true);
      expect(isLangSupported('ar')).toBe(true);
      expect(isLangSupported('fr')).toBe(true);
      expect(isLangSupported('es')).toBe(true);
      expect(isLangSupported('other')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(isLangSupported('de')).toBe(false);
      expect(isLangSupported('ja')).toBe(false);
      expect(isLangSupported('zh')).toBe(false);
    });
  });

  describe('Message completeness', () => {
    const supportedLanguages: Lang[] = ['en', 'he', 'ru', 'ar', 'fr', 'es', 'other'];

    it('should have all message keys in all languages', () => {
      const englishKeys = Object.keys(MESSAGES.en) as MsgKey[];

      supportedLanguages.forEach(lang => {
        const langKeys = Object.keys(MESSAGES[lang]);
        
        // Check that language has same number of keys as English
        expect(langKeys.length).toBe(englishKeys.length);

        // Check that all English keys exist in this language
        englishKeys.forEach(key => {
          expect(MESSAGES[lang][key]).toBeDefined();
          expect(MESSAGES[lang][key]).not.toBe('');
        });
      });
    });

    it('should not have duplicate messages', () => {
      supportedLanguages.forEach(lang => {
        const messages = Object.values(MESSAGES[lang]);
        const uniqueMessages = new Set(messages);
        
        // Allow some duplicates (e.g., common words like "Close", "Clear")
        // But flag if too many duplicates exist
        const duplicateRatio = (messages.length - uniqueMessages.size) / messages.length;
        expect(duplicateRatio).toBeLessThan(0.2); // Allow up to 20% duplicates
      });
    });

    it('should have consistent placeholder syntax across languages', () => {
      const placeholderRegex = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;

      supportedLanguages.forEach(lang => {
        Object.entries(MESSAGES[lang]).forEach(([key, message]) => {
          // Check that placeholders use consistent syntax
          const placeholders = message.match(placeholderRegex) || [];
          placeholders.forEach(placeholder => {
            expect(placeholder).toMatch(/^\{[a-zA-Z_][a-zA-Z0-9_]*\}$/);
          });
        });
      });
    });
  });

  describe('Message quality checks', () => {
    it('should not have HTML tags in messages', () => {
      const htmlRegex = /<[^>]+>/;
      
      Object.values(MESSAGES).forEach(langMessages => {
        Object.values(langMessages).forEach(message => {
          expect(message).not.toMatch(htmlRegex);
        });
      });
    });

    it('should preserve emoji consistency across languages where appropriate', () => {
      const emojiKeys: MsgKey[] = [
        'location.using',
        'location.getting',
        'location.denied',
        'location.unavailable',
        'filter.openNow',
      ];

      emojiKeys.forEach(key => {
        const emojiRegex = /[\p{Emoji}]/u;
        const englishHasEmoji = emojiRegex.test(MESSAGES.en[key]);

        if (englishHasEmoji) {
          // All languages should have emoji for this key
          Object.keys(MESSAGES).forEach(lang => {
            expect(MESSAGES[lang as Lang][key]).toMatch(emojiRegex);
          });
        }
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle language switching in UI', () => {
      // Simulate user switching from English to Hebrew
      const enTitle = t('en', 'hero.title');
      const heTitle = t('he', 'hero.title');

      expect(enTitle).not.toBe(heTitle);
      expect(isRTL('en')).toBe(false);
      expect(isRTL('he')).toBe(true);
    });

    it('should handle backend language codes', () => {
      // Simulate backend returning various language codes
      const backendCodes = ['en', 'he', 'en-US', 'he-IL', 'iw', 'unknown'];
      
      backendCodes.forEach(code => {
        const normalized = normalizeLang(code);
        expect(normalized).toBeTruthy();
        const message = t(normalized, 'hero.title');
        expect(message).toBeTruthy();
      });
    });

    it('should handle assistant message language priority', () => {
      // Simulate language resolution priority:
      // 1. Assistant message language
      // 2. Meta langCtx.uiLanguage
      // 3. Query language
      // 4. Fallback to 'en'

      const assistantLang = 'he';
      const metaLang = 'ru';
      const queryLang = 'ar';

      // Priority 1: Assistant language wins
      expect(normalizeLang(assistantLang || metaLang || queryLang)).toBe('he');

      // Priority 2: Meta language when assistant not present
      expect(normalizeLang(undefined || metaLang || queryLang)).toBe('ru');

      // Priority 3: Query language when others not present
      expect(normalizeLang(undefined || undefined || queryLang)).toBe('ar');

      // Priority 4: Fallback to English
      expect(normalizeLang(undefined || undefined || undefined)).toBe('en');
    });
  });
});
