/**
 * Fallback Messages Tests
 */

import { getDeterministicFallback } from '../fallback-messages.js';
import type { AssistantContext } from '../fallback-messages.js';

const SUPPORTED_LANGUAGES = ['he', 'en', 'ar', 'ru', 'fr', 'es'] as const;

describe('fallback-messages', () => {
  describe('getDeterministicFallback', () => {
    describe('CLARIFY context', () => {
      it.each(SUPPORTED_LANGUAGES)('returns non-empty message and question for MISSING_LOCATION in %s', (lang) => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: lang
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.question).toBeTruthy();
        expect(result.question!.length).toBeGreaterThan(0);
        expect(result.suggestedAction).toBe('ASK_LOCATION');
        expect(result.blocksSearch).toBe(true);
      });

      it.each(SUPPORTED_LANGUAGES)('returns non-empty message and question for MISSING_FOOD in %s', (lang) => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_FOOD',
          query: 'Tel Aviv',
          language: lang
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.question).toBeTruthy();
        expect(result.question!.length).toBeGreaterThan(0);
        expect(result.suggestedAction).toBe('ASK_FOOD');
        expect(result.blocksSearch).toBe(true);
      });
    });

    describe('GATE_FAIL context', () => {
      it.each(SUPPORTED_LANGUAGES)('returns non-empty message in %s', (lang) => {
        const context: AssistantContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: 'weather today',
          language: lang
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.question).toBeNull();
        expect(result.suggestedAction).toBe('RETRY');
        expect(result.blocksSearch).toBe(true);
      });
    });

    describe('SEARCH_FAILED context', () => {
      it.each(SUPPORTED_LANGUAGES)('returns non-empty message in %s', (lang) => {
        const context: AssistantContext = {
          type: 'SEARCH_FAILED',
          reason: 'GOOGLE_TIMEOUT',
          query: 'pizza near me',
          language: lang
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.question).toBeNull();
        expect(result.suggestedAction).toBe('RETRY');
        expect(result.blocksSearch).toBe(true);
      });
    });

    describe('GENERIC_QUERY_NARRATION context', () => {
      it.each(SUPPORTED_LANGUAGES)('returns non-empty message and question in %s', (lang) => {
        const context: AssistantContext = {
          type: 'GENERIC_QUERY_NARRATION',
          query: 'restaurants',
          language: lang,
          resultCount: 10,
          usedCurrentLocation: true
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.question).toBeTruthy();
        expect(result.question!.length).toBeGreaterThan(0);
        expect(result.suggestedAction).toBe('REFINE');
        expect(result.blocksSearch).toBe(false);
      });
    });

    describe('SUMMARY context', () => {
      it.each(SUPPORTED_LANGUAGES)('returns non-empty message for results in %s', (lang) => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza Tel Aviv',
          language: lang,
          resultCount: 15,
          top: [{ name: 'Restaurant A' }, { name: 'Restaurant B' }, { name: 'Restaurant C' }], analysisMode: 'COMPARISON',
          metadata: {
            openNowCount: 10,
            currentHour: 14,
            radiusKm: 2
          }
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.suggestedAction).toBe('NONE');
        expect(result.blocksSearch).toBe(false);
      });

      it.each(SUPPORTED_LANGUAGES)('returns no results message when count is 0 in %s', (lang) => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza Tel Aviv',
          language: lang,
          resultCount: 0,
          top: [], analysisMode: 'SCARCITY'
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.suggestedAction).toBe('NONE');
        expect(result.blocksSearch).toBe(false);
      });

      it.each(SUPPORTED_LANGUAGES)('returns refine message when few places open in %s', (lang) => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza Tel Aviv',
          language: lang,
          resultCount: 20,
          top: [{ name: 'Restaurant A' }, { name: 'Restaurant B' }, { name: 'Restaurant C' }], analysisMode: 'COMPARISON',
          metadata: {
            openNowCount: 5 // Less than half
          }
        };

        const result = getDeterministicFallback(context, lang);

        expect(result.message).toBeTruthy();
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.suggestedAction).toBe('NONE');
        expect(result.blocksSearch).toBe(false);
      });
    });

    describe('Language-specific content', () => {
      it('returns Hebrew text for Hebrew language', () => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'he'
        };

        const result = getDeterministicFallback(context, 'he');

        // Should contain Hebrew characters
        expect(/[\u0590-\u05FF]/.test(result.message)).toBe(true);
        expect(/[\u0590-\u05FF]/.test(result.question!)).toBe(true);
      });

      it('returns Arabic text for Arabic language', () => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'ar'
        };

        const result = getDeterministicFallback(context, 'ar');

        // Should contain Arabic characters
        expect(/[\u0600-\u06FF]/.test(result.message)).toBe(true);
        expect(/[\u0600-\u06FF]/.test(result.question!)).toBe(true);
      });

      it('returns Cyrillic text for Russian language', () => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'ru'
        };

        const result = getDeterministicFallback(context, 'ru');

        // Should contain Cyrillic characters
        expect(/[\u0400-\u04FF]/.test(result.message)).toBe(true);
        expect(/[\u0400-\u04FF]/.test(result.question!)).toBe(true);
      });

      it('returns Latin text for English language', () => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'en'
        };

        const result = getDeterministicFallback(context, 'en');

        // Should contain Latin characters
        expect(/[a-zA-Z]/.test(result.message)).toBe(true);
        expect(/[a-zA-Z]/.test(result.question!)).toBe(true);
      });
    });
  });
});
