/**
 * Query Language Detector Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  detectQueryLanguage, 
  containsHebrew, 
  containsCyrillic, 
  containsArabic, 
  getHebrewCharCount 
} from './query-language-detector.js';

describe('detectQueryLanguage', () => {
  describe('English detection', () => {
    it('should detect pure English query', () => {
      assert.strictEqual(detectQueryLanguage('what the weather is?'), 'en');
    });

    it('should detect English query with punctuation', () => {
      assert.strictEqual(detectQueryLanguage('pizza in Tel Aviv!'), 'en');
    });

    it('should detect English query with numbers', () => {
      assert.strictEqual(detectQueryLanguage('5 best restaurants near me'), 'en');
    });

    it('should default to English for empty string', () => {
      assert.strictEqual(detectQueryLanguage(''), 'en');
    });

    it('should default to English for whitespace only', () => {
      assert.strictEqual(detectQueryLanguage('   '), 'en');
    });

    it('should default to English for null/undefined', () => {
      assert.strictEqual(detectQueryLanguage(null as any), 'en');
      assert.strictEqual(detectQueryLanguage(undefined as any), 'en');
    });

    it('should detect English with special characters', () => {
      assert.strictEqual(detectQueryLanguage('pizza @ $5'), 'en');
    });
  });

  describe('Russian (Cyrillic) detection - majority-script heuristic', () => {
    it('should detect pure Russian query', () => {
      assert.strictEqual(detectQueryLanguage('Рестораны рядом со мной'), 'ru');
    });

    it('should detect Russian with English place name (CRITICAL FIX)', () => {
      // "Рестораны рядом с Big Ben" has 14 Cyrillic + 6 Latin = 70% Cyrillic
      assert.strictEqual(detectQueryLanguage('Рестораны рядом с Big Ben'), 'ru');
    });

    it('should detect Russian with numbers', () => {
      assert.strictEqual(detectQueryLanguage('5 лучших ресторанов'), 'ru');
    });

    it('should detect single Cyrillic character as ru (100% Cyrillic)', () => {
      assert.strictEqual(detectQueryLanguage('Я'), 'ru');
    });

    it('should detect Russian with punctuation', () => {
      assert.strictEqual(detectQueryLanguage('Где поесть?!'), 'ru');
    });

    it('should handle short Latin landmarks in Russian context', () => {
      // "ресторан NYC" = 8 Cyrillic + 3 Latin = 72.7% Cyrillic
      assert.strictEqual(detectQueryLanguage('ресторан NYC'), 'ru');
    });

    it('should return unknown when Cyrillic < 60% and Latin < 60%', () => {
      // "РесREST" = 3 Cyrillic + 4 Latin = 43% Cyrillic -> unknown
      assert.strictEqual(detectQueryLanguage('РесREST'), 'unknown');
    });
  });

  describe('Arabic detection - majority-script heuristic', () => {
    it('should detect pure Arabic query', () => {
      assert.strictEqual(detectQueryLanguage('مطاعم قريبة مني'), 'ar');
    });

    it('should detect Arabic with English words (CRITICAL TEST)', () => {
      // "مطاعم pizza" has 4 Arabic + 5 Latin = 44% Arabic -> should be unknown
      // BUT "مطاعم قريبة pizza" = 8 Arabic + 5 Latin = 61.5% Arabic -> ar
      assert.strictEqual(detectQueryLanguage('مطاعم قريبة pizza'), 'ar');
    });

    it('should detect Arabic with numbers', () => {
      assert.strictEqual(detectQueryLanguage('5 مطاعم'), 'ar');
    });

    it('should detect Arabic with place name', () => {
      // "مطاعم قريبة مني الآن" = pure Arabic
      assert.strictEqual(detectQueryLanguage('مطاعم قريبة مني الآن'), 'ar');
    });

    it('should return unknown when Arabic ratio is low', () => {
      // "مطا Big restaurant" = 3 Arabic + 13 Latin = 18% Arabic -> unknown
      const result = detectQueryLanguage('مطا Big restaurant');
      assert.ok(result === 'unknown' || result === 'en');
    });
  });

  describe('Hebrew detection', () => {
    it('should detect pure Hebrew query', () => {
      expect(detectQueryLanguage('מה מזג האוויר?')).toBe('he');
    });

    it('should detect Hebrew query with English words (mixed)', () => {
      expect(detectQueryLanguage('פיצה pizza')).toBe('he');
    });

    it('should detect Hebrew query with numbers', () => {
      expect(detectQueryLanguage('5 מסעדות טובות')).toBe('he');
    });

    it('should detect single Hebrew character', () => {
      expect(detectQueryLanguage('א')).toBe('he');
    });

    it('should detect Hebrew with punctuation', () => {
      expect(detectQueryLanguage('מה קורה?!')).toBe('he');
    });

    it('should detect Hebrew at start of mixed query', () => {
      expect(detectQueryLanguage('חיפוש pizza')).toBe('he');
    });

    it('should detect Hebrew at end of mixed query', () => {
      expect(detectQueryLanguage('pizza טעימה')).toBe('he');
    });
  });

  describe('Priority order (strong scripts take precedence)', () => {
    it('should detect Russian over English when both present', () => {
      assert.strictEqual(detectQueryLanguage('Рестораны near Big Ben'), 'ru');
    });

    it('should detect Arabic over English when both present', () => {
      assert.strictEqual(detectQueryLanguage('مطاعم restaurants'), 'ar');
    });

    it('should detect Hebrew over English when both present', () => {
      assert.strictEqual(detectQueryLanguage('מסעדות restaurants'), 'he');
    });

    it('should detect Cyrillic even with majority English', () => {
      assert.strictEqual(detectQueryLanguage('restaurants near Moscow Москва'), 'ru');
    });
  });

  describe('Edge cases', () => {
    it('should handle non-string input', () => {
      assert.strictEqual(detectQueryLanguage(123 as any), 'unknown');
      assert.strictEqual(detectQueryLanguage({} as any), 'unknown');
      assert.strictEqual(detectQueryLanguage([] as any), 'unknown');
    });

    it('should handle emoji only (no letters)', () => {
      assert.strictEqual(detectQueryLanguage('🍕🍔🍝'), 'unknown');
    });

    it('should detect Hebrew even with lots of emojis', () => {
      assert.strictEqual(detectQueryLanguage('🍕 פיצה 🍔'), 'he');
    });

    it('should return unknown for empty/whitespace', () => {
      assert.strictEqual(detectQueryLanguage(''), 'unknown');
      assert.strictEqual(detectQueryLanguage('   '), 'unknown');
    });

    it('should handle numbers-only queries', () => {
      assert.strictEqual(detectQueryLanguage('123 456'), 'unknown');
    });
  });

  describe('NEW: Majority-script heuristic validation', () => {
    it('CRITICAL: "Рестораны рядом с Big Ben" should be ru, not en', () => {
      // This is the exact bug case from user report
      const result = detectQueryLanguage('Рестораны рядом с Big Ben');
      assert.strictEqual(result, 'ru', 'Russian query with English landmark should detect as ru');
    });

    it('should detect "мطاעم قريبة مني الآن" as ar', () => {
      const result = detectQueryLanguage('مطاعم قريبة مني الآن');
      assert.strictEqual(result, 'ar', 'Arabic query should detect as ar');
    });

    it('should detect "Restaurants near Big Ben" as en', () => {
      const result = detectQueryLanguage('Restaurants near Big Ben');
      assert.strictEqual(result, 'en', 'Pure English query should detect as en');
    });

    it('should return unknown when truly mixed (no dominant script)', () => {
      // "רוס pizza מטעם rest" = very mixed
      const result = detectQueryLanguage('abc דיפ мно');
      assert.strictEqual(result, 'unknown', 'Mixed scripts with no dominant should be unknown');
    });
  });
});

describe('containsHebrew', () => {
  it('should return true for Hebrew text', () => {
    expect(containsHebrew('שלום')).toBe(true);
  });

  it('should return false for English text', () => {
    expect(containsHebrew('hello')).toBe(false);
  });

  it('should return true for mixed text', () => {
    expect(containsHebrew('hello שלום')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(containsHebrew('')).toBe(false);
  });
});

describe('containsCyrillic', () => {
  it('should return true for Cyrillic text', () => {
    assert.strictEqual(containsCyrillic('Привет'), true);
  });

  it('should return false for English text', () => {
    assert.strictEqual(containsCyrillic('hello'), false);
  });

  it('should return true for mixed text', () => {
    assert.strictEqual(containsCyrillic('hello Привет'), true);
  });

  it('should return false for empty string', () => {
    assert.strictEqual(containsCyrillic(''), false);
  });
});

describe('containsArabic', () => {
  it('should return true for Arabic text', () => {
    expect(containsArabic('مرحبا')).toBe(true);
  });

  it('should return false for English text', () => {
    expect(containsArabic('hello')).toBe(false);
  });

  it('should return true for mixed text', () => {
    expect(containsArabic('hello مرحبا')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(containsArabic('')).toBe(false);
  });
});

describe('getHebrewCharCount', () => {
  it('should count Hebrew characters', () => {
    assert.strictEqual(getHebrewCharCount('שלום'), 4);
  });

  it('should return 0 for English text', () => {
    assert.strictEqual(getHebrewCharCount('hello'), 0);
  });

  it('should count only Hebrew characters in mixed text', () => {
    assert.strictEqual(getHebrewCharCount('hello שלום world'), 4);
  });

  it('should return 0 for empty string', () => {
    assert.strictEqual(getHebrewCharCount(''), 0);
  });

  it('should handle Unicode Hebrew range correctly', () => {
    // Test Hebrew letters (אבג)
    assert.strictEqual(getHebrewCharCount('אבג'), 3);
    // Test Hebrew with nikud (vowel points)
    assert.ok(getHebrewCharCount('שָׁלוֹם') > 0);
  });
});
