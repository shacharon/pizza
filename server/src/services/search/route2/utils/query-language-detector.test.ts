/**
 * Query Language Detector Tests
 */

import { describe, it, expect } from '@jest/globals';
import { detectQueryLanguage, containsHebrew, getHebrewCharCount } from './query-language-detector.js';

describe('detectQueryLanguage', () => {
  describe('English detection', () => {
    it('should detect pure English query', () => {
      expect(detectQueryLanguage('what the weather is?')).toBe('en');
    });

    it('should detect English query with punctuation', () => {
      expect(detectQueryLanguage('pizza in Tel Aviv!')).toBe('en');
    });

    it('should detect English query with numbers', () => {
      expect(detectQueryLanguage('5 best restaurants near me')).toBe('en');
    });

    it('should default to English for empty string', () => {
      expect(detectQueryLanguage('')).toBe('en');
    });

    it('should default to English for whitespace only', () => {
      expect(detectQueryLanguage('   ')).toBe('en');
    });

    it('should default to English for null/undefined', () => {
      expect(detectQueryLanguage(null as any)).toBe('en');
      expect(detectQueryLanguage(undefined as any)).toBe('en');
    });

    it('should detect English with special characters', () => {
      expect(detectQueryLanguage('pizza @ $5')).toBe('en');
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

  describe('Edge cases', () => {
    it('should handle non-string input', () => {
      expect(detectQueryLanguage(123 as any)).toBe('en');
      expect(detectQueryLanguage({} as any)).toBe('en');
      expect(detectQueryLanguage([] as any)).toBe('en');
    });

    it('should handle emoji only', () => {
      expect(detectQueryLanguage('🍕🍔🍝')).toBe('en');
    });

    it('should detect Hebrew even with lots of emojis', () => {
      expect(detectQueryLanguage('🍕 פיצה 🍔')).toBe('he');
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

describe('getHebrewCharCount', () => {
  it('should count Hebrew characters', () => {
    expect(getHebrewCharCount('שלום')).toBe(4);
  });

  it('should return 0 for English text', () => {
    expect(getHebrewCharCount('hello')).toBe(0);
  });

  it('should count only Hebrew characters in mixed text', () => {
    expect(getHebrewCharCount('hello שלום world')).toBe(4);
  });

  it('should return 0 for empty string', () => {
    expect(getHebrewCharCount('')).toBe(0);
  });

  it('should handle Unicode Hebrew range correctly', () => {
    // Test Hebrew letters (אבג)
    expect(getHebrewCharCount('אבג')).toBe(3);
    // Test Hebrew with nikud (vowel points)
    expect(getHebrewCharCount('שָׁלוֹם')).toBeGreaterThan(0);
  });
});
