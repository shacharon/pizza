/**
 * Prompt Builder Tests
 */

import { SYSTEM_PROMPT, buildUserPrompt } from '../prompt-builder.js';
import type { AssistantContext } from '../prompt-builder.js';

describe('prompt-builder', () => {
  describe('SYSTEM_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof SYSTEM_PROMPT).toBe('string');
      expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('contains key instructions', () => {
      expect(SYSTEM_PROMPT).toContain('assistant');
      expect(SYSTEM_PROMPT).toContain('JSON');
      expect(SYSTEM_PROMPT).toContain('blocksSearch');
      expect(SYSTEM_PROMPT).toContain('suggestedAction');
    });

    it('contains language enforcement rules', () => {
      expect(SYSTEM_PROMPT).toContain('LANGUAGE');
      expect(SYSTEM_PROMPT).toContain('Language:');
    });
  });

  describe('buildUserPrompt', () => {
    describe('GATE_FAIL context', () => {
      it('builds prompt with NO_FOOD reason', () => {
        const context: AssistantContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: 'weather today',
          language: 'en'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('GATE_FAIL');
        expect(prompt).toContain('weather today');
        expect(prompt).toContain('not food-related');
        expect(prompt).toContain('Language: en');
        expect(prompt).toContain('English');
      });

      it('builds prompt with UNCERTAIN_FOOD reason', () => {
        const context: AssistantContext = {
          type: 'GATE_FAIL',
          reason: 'UNCERTAIN_FOOD',
          query: 'something vague',
          language: 'he'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('GATE_FAIL');
        expect(prompt).toContain('uncertain if food-related');
        expect(prompt).toContain('Language: he');
        expect(prompt).toContain('Hebrew');
      });
    });

    describe('CLARIFY context', () => {
      it('builds prompt for MISSING_LOCATION', () => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_LOCATION',
          query: 'pizza',
          language: 'en'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('CLARIFY');
        expect(prompt).toContain('pizza');
        expect(prompt).toContain('missing location');
        expect(prompt).toContain('Language: en');
        expect(prompt).toContain('English');
      });

      it('builds prompt for MISSING_FOOD', () => {
        const context: AssistantContext = {
          type: 'CLARIFY',
          reason: 'MISSING_FOOD',
          query: 'Tel Aviv',
          language: 'ru'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('CLARIFY');
        expect(prompt).toContain('Tel Aviv');
        expect(prompt).toContain('missing food type');
        expect(prompt).toContain('Language: ru');
        expect(prompt).toContain('Russian');
      });
    });

    describe('SEARCH_FAILED context', () => {
      it('builds prompt for GOOGLE_TIMEOUT', () => {
        const context: AssistantContext = {
          type: 'SEARCH_FAILED',
          reason: 'GOOGLE_TIMEOUT',
          query: 'pizza near me',
          language: 'fr'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('SEARCH_FAILED');
        expect(prompt).toContain('pizza near me');
        expect(prompt).toContain('Google API timeout');
        expect(prompt).toContain('Language: fr');
        expect(prompt).toContain('French');
      });

      it('builds prompt for PROVIDER_ERROR', () => {
        const context: AssistantContext = {
          type: 'SEARCH_FAILED',
          reason: 'PROVIDER_ERROR',
          query: 'sushi',
          language: 'es'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('SEARCH_FAILED');
        expect(prompt).toContain('sushi');
        expect(prompt).toContain('provider error');
        expect(prompt).toContain('Language: es');
        expect(prompt).toContain('Spanish');
      });
    });

    describe('GENERIC_QUERY_NARRATION context', () => {
      it('builds prompt with current location used', () => {
        const context: AssistantContext = {
          type: 'GENERIC_QUERY_NARRATION',
          query: 'restaurants',
          language: 'en',
          resultCount: 25,
          usedCurrentLocation: true
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('GENERIC_QUERY_NARRATION');
        expect(prompt).toContain('restaurants');
        expect(prompt).toContain('Results: 25');
        expect(prompt).toContain('current location');
        expect(prompt).toContain('Language: en');
        expect(prompt).toContain('blocksSearch=false');
        expect(prompt).toContain('suggestedAction="REFINE"');
      });

      it('builds prompt with default area used', () => {
        const context: AssistantContext = {
          type: 'GENERIC_QUERY_NARRATION',
          query: 'food',
          language: 'ar',
          resultCount: 10,
          usedCurrentLocation: false
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('GENERIC_QUERY_NARRATION');
        expect(prompt).toContain('food');
        expect(prompt).toContain('Results: 10');
        expect(prompt).toContain('default area');
        expect(prompt).toContain('Language: ar');
      });
    });

    describe('SUMMARY context', () => {
      it('builds prompt with basic metadata', () => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza Tel Aviv',
          language: 'en',
          resultCount: 15,
          top: [{ name: 'Restaurant A' }, { name: 'Restaurant B' }, { name: 'Restaurant C' }], analysisMode: 'COMPARISON'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('SUMMARY');
        expect(prompt).toContain('pizza Tel Aviv');
        expect(prompt).toContain('Results: 15');
        expect(prompt).toContain('Restaurant A');
        expect(prompt).toContain('Restaurant B');
        expect(prompt).toContain('Restaurant C');
        expect(prompt).toContain('Language: en');
      });

      it('includes openNowCount metadata when provided', () => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'sushi',
          language: 'he',
          resultCount: 20,
          top: [{ name: 'Place 1' }, { name: 'Place 2' }, { name: 'Place 3' }], analysisMode: 'COMPARISON',
          metadata: {
            openNowCount: 12,
            currentHour: 18
          }
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('Open now: 12/20');
        expect(prompt).toContain('Current hour: 18:00');
      });

      it('includes radius metadata when provided', () => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'burgers',
          language: 'en',
          resultCount: 8,
          top: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], analysisMode: 'COMPARISON',
          metadata: {
            radiusKm: 5
          }
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('Search radius: 5km');
      });

      it('includes filters metadata when provided', () => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'vegan',
          language: 'en',
          resultCount: 5,
          top: [{ name: 'X' }, { name: 'Y' }, { name: 'Z' }], analysisMode: 'COMPARISON',
          metadata: {
            filtersApplied: ['vegan', 'open_now']
          }
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('Active filters: vegan, open_now');
      });

      it('includes dietary note when shouldInclude is true', () => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'gluten free pizza',
          language: 'en',
          resultCount: 10,
          top: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], analysisMode: 'COMPARISON',
          dietaryNote: {
            type: 'gluten-free',
            shouldInclude: true
          }
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('Dietary Note');
        expect(prompt).toContain('gluten-free');
      });

      it('excludes dietary note when shouldInclude is false', () => {
        const context: AssistantContext = {
          type: 'SUMMARY',
          query: 'pizza',
          language: 'en',
          resultCount: 10,
          top: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], analysisMode: 'COMPARISON',
          dietaryNote: {
            type: 'gluten-free',
            shouldInclude: false
          }
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).not.toContain('Dietary Note');
        expect(prompt).not.toContain('gluten-free');
      });
    });

    describe('Language normalization', () => {
      it('normalizes "other" to "en"', () => {
        const context: AssistantContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: 'test',
          language: 'other'
        };

        const prompt = buildUserPrompt(context);

        expect(prompt).toContain('Language: en');
        expect(prompt).toContain('English');
      });
    });
  });
});
