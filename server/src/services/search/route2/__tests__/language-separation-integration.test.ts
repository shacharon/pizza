/**
 * Integration Test: Language Separation Enforcement
 * 
 * Verifies that queries in different languages produce identical Google payloads
 * when they have the same intent (location, cuisine, etc.)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguageContext, validateLanguageContext } from '../shared/language-context.js';
import { detectQueryLanguage } from '../utils/query-language-detector.js';

describe('Language Separation Integration Tests', () => {
  describe('Same intent (Paris), different query languages -> same search payload', () => {
    it('Hebrew query about Paris -> English search (region policy)', () => {
      const query = 'מסעדות איטלקיות בפריז';  // Italian restaurants in Paris
      const queryLanguage = detectQueryLanguage(query);
      
      const context = resolveLanguageContext({
        uiLanguage: 'he',
        queryLanguage,
        regionCode: 'FR',
        cityText: 'Paris',
        countryCode: 'FR',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      }, 'test-he-paris');

      // Assertions
      assert.strictEqual(context.queryLanguage, 'he', 'Query detected as Hebrew');
      assert.strictEqual(context.assistantLanguage, 'he', 'Assistant responds in Hebrew');
      assert.strictEqual(context.searchLanguage, 'en', 'Google search uses English (FR policy)');
      assert.strictEqual(context.sources.searchLanguage, 'global_default', 'searchLanguage from policy, not query');
      
      // Validate invariants
      assert.doesNotThrow(() => validateLanguageContext(context));
    });

    it('English query about Paris -> English search (region policy)', () => {
      const query = 'Italian restaurants in Paris';
      const queryLanguage = detectQueryLanguage(query);
      
      const context = resolveLanguageContext({
        uiLanguage: 'en',
        queryLanguage,
        regionCode: 'FR',
        cityText: 'Paris',
        countryCode: 'FR',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.95
      }, 'test-en-paris');

      // Assertions
      assert.strictEqual(context.queryLanguage, 'en', 'Query detected as English');
      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant responds in English');
      assert.strictEqual(context.searchLanguage, 'en', 'Google search uses English (FR policy)');
      assert.strictEqual(context.sources.searchLanguage, 'global_default', 'searchLanguage from policy, not query');
      
      // Validate invariants
      assert.doesNotThrow(() => validateLanguageContext(context));
    });

    it('French query about Paris -> English search (region policy, French not supported)', () => {
      const query = 'restaurants italiens à Paris';
      const queryLanguage = detectQueryLanguage(query);  // Will detect as 'en' (no French chars)
      
      const context = resolveLanguageContext({
        uiLanguage: 'en',
        queryLanguage,
        regionCode: 'FR',
        cityText: 'Paris',
        countryCode: 'FR',
        intentLanguage: 'fr',  // LLM detects French
        intentLanguageConfidence: 0.95
      }, 'test-fr-paris');

      // Assertions
      assert.strictEqual(context.queryLanguage, 'en', 'Query detected as English (no French detection)');
      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant uses uiLanguage fallback (French not supported)');
      assert.strictEqual(context.searchLanguage, 'en', 'Google search uses English (FR policy)');
      
      // Validate invariants
      assert.doesNotThrow(() => validateLanguageContext(context));
    });

    it('All Paris queries should have same searchLanguage (policy enforcement)', () => {
      const queries = [
        { text: 'מסעדות איטלקיות בפריז', lang: 'he' },
        { text: 'Italian restaurants in Paris', lang: 'en' },
        { text: 'restaurants italiens à Paris', lang: 'fr' }
      ];

      const contexts = queries.map(q => {
        const queryLanguage = detectQueryLanguage(q.text);
        return resolveLanguageContext({
          uiLanguage: 'en',
          queryLanguage,
          regionCode: 'FR',
          cityText: 'Paris',
          intentLanguage: q.lang,
          intentLanguageConfidence: 0.95
        });
      });

      // All should use same searchLanguage (policy-based, not query-based)
      const searchLanguages = contexts.map(c => c.searchLanguage);
      assert.ok(
        searchLanguages.every(lang => lang === 'en'),
        'All Paris queries must have same searchLanguage (region policy)'
      );

      // But assistantLanguage can differ
      assert.strictEqual(contexts[0].assistantLanguage, 'he', 'Hebrew query -> Hebrew assistant');
      assert.strictEqual(contexts[1].assistantLanguage, 'en', 'English query -> English assistant');
      assert.strictEqual(contexts[2].assistantLanguage, 'en', 'French query -> English assistant (fallback)');
    });
  });

  describe('Same intent (Tel Aviv), different query languages -> same search payload', () => {
    it('Hebrew query about Tel Aviv -> Hebrew search (IL policy)', () => {
      const query = 'מסעדות איטלקיות בתל אביב';
      const queryLanguage = detectQueryLanguage(query);
      
      const context = resolveLanguageContext({
        uiLanguage: 'he',
        queryLanguage,
        regionCode: 'IL',
        cityText: 'תל אביב',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      }, 'test-he-telaviv');

      assert.strictEqual(context.searchLanguage, 'he', 'IL region -> Hebrew search');
      assert.strictEqual(context.sources.searchLanguage, 'region_policy:IL');
    });

    it('English query about Tel Aviv -> Hebrew search (IL policy)', () => {
      const query = 'Italian restaurants in Tel Aviv';
      const queryLanguage = detectQueryLanguage(query);
      
      const context = resolveLanguageContext({
        uiLanguage: 'en',
        queryLanguage,
        regionCode: 'IL',
        cityText: 'Tel Aviv',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.95
      }, 'test-en-telaviv');

      assert.strictEqual(context.queryLanguage, 'en', 'Query in English');
      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant in English');
      assert.strictEqual(context.searchLanguage, 'he', 'Google search uses Hebrew (IL policy)');
    });

    it('All Tel Aviv queries should have same searchLanguage', () => {
      const contexts = [
        resolveLanguageContext({
          uiLanguage: 'he',
          queryLanguage: 'he',
          regionCode: 'IL',
          cityText: 'תל אביב',
          intentLanguage: 'he',
          intentLanguageConfidence: 0.95
        }),
        resolveLanguageContext({
          uiLanguage: 'en',
          queryLanguage: 'en',
          regionCode: 'IL',
          cityText: 'Tel Aviv',
          intentLanguage: 'en',
          intentLanguageConfidence: 0.95
        })
      ];

      const searchLanguages = contexts.map(c => c.searchLanguage);
      assert.ok(
        searchLanguages.every(lang => lang === 'he'),
        'All Tel Aviv queries must use Hebrew for search (IL policy)'
      );
    });
  });

  describe('Cache key stability: assistant language does NOT affect search', () => {
    it('Same intent with different assistant languages -> identical search params', () => {
      const baseParams = {
        uiLanguage: 'en' as const,
        queryLanguage: 'en' as const,
        regionCode: 'FR',
        cityText: 'Paris',
        intentLanguageConfidence: 0.95
      };

      // Context 1: Hebrew assistant
      const context1 = resolveLanguageContext({
        ...baseParams,
        intentLanguage: 'he'
      });

      // Context 2: English assistant
      const context2 = resolveLanguageContext({
        ...baseParams,
        intentLanguage: 'en'
      });

      // searchLanguage MUST be identical (cache key stability)
      assert.strictEqual(context1.searchLanguage, context2.searchLanguage, 
        'searchLanguage must be same regardless of assistant language');
      
      // assistantLanguage CAN differ (not in cache key)
      assert.notStrictEqual(context1.assistantLanguage, context2.assistantLanguage,
        'assistantLanguage can differ without affecting search');
    });

    it('Assistant language change does not change search payload', () => {
      const params = {
        uiLanguage: 'en' as const,
        queryLanguage: 'en' as const,
        regionCode: 'IL',
        intentLanguageConfidence: 0.95
      };

      // Same query, different LLM assistant language detections
      const ctx1 = resolveLanguageContext({ ...params, intentLanguage: 'he' });
      const ctx2 = resolveLanguageContext({ ...params, intentLanguage: 'en' });

      // Search params MUST be identical
      assert.strictEqual(ctx1.searchLanguage, ctx2.searchLanguage);
      assert.strictEqual(ctx1.regionCode, ctx2.regionCode);
      assert.strictEqual(ctx1.uiLanguage, ctx2.uiLanguage);
      
      // Only assistant differs
      assert.notStrictEqual(ctx1.assistantLanguage, ctx2.assistantLanguage);
    });
  });

  describe('Invariant validation', () => {
    it('searchLanguage source must never be query-based', () => {
      const context = resolveLanguageContext({
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      });

      // Should not contain 'query', 'assistant', or 'ui'
      assert.ok(!context.sources.searchLanguage.includes('query'), 
        'searchLanguage source must not include "query"');
      assert.ok(!context.sources.searchLanguage.includes('assistant'), 
        'searchLanguage source must not include "assistant"');
      assert.ok(!context.sources.searchLanguage.includes('ui'), 
        'searchLanguage source must not include "ui"');
    });

    it('should validate all resolved contexts', () => {
      const testCases = [
        { regionCode: 'IL', expected: 'he' },
        { regionCode: 'US', expected: 'en' },
        { regionCode: 'FR', expected: 'en' },
        { regionCode: 'GB', expected: 'en' },
        { regionCode: 'PS', expected: 'he' }
      ];

      testCases.forEach(({ regionCode, expected }) => {
        const context = resolveLanguageContext({
          uiLanguage: 'en',
          queryLanguage: 'en',
          regionCode,
          intentLanguage: 'en',
          intentLanguageConfidence: 0.9
        });

        assert.strictEqual(context.searchLanguage, expected, 
          `Region ${regionCode} should map to ${expected}`);
        
        // All contexts should pass validation
        assert.doesNotThrow(() => validateLanguageContext(context));
      });
    });
  });

  describe('Real-world scenarios', () => {
    it('Tourist in Israel searches in English -> assistant English, search Hebrew', () => {
      const query = 'best falafel in Tel Aviv';
      const queryLanguage = detectQueryLanguage(query);
      
      const context = resolveLanguageContext({
        uiLanguage: 'en',
        queryLanguage,
        regionCode: 'IL',
        cityText: 'Tel Aviv',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.9
      });

      assert.strictEqual(context.assistantLanguage, 'en', 'Tourist gets English assistant');
      assert.strictEqual(context.searchLanguage, 'he', 'But search uses Hebrew (IL region)');
      assert.notStrictEqual(context.assistantLanguage, context.searchLanguage, 'Languages separated');
    });

    it('Israeli searches abroad in Hebrew -> assistant Hebrew, search local language', () => {
      const query = 'מסעדות יפניות בניו יורק';  // Japanese restaurants in New York
      const queryLanguage = detectQueryLanguage(query);
      
      const context = resolveLanguageContext({
        uiLanguage: 'he',
        queryLanguage,
        regionCode: 'US',
        cityText: 'New York',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      });

      assert.strictEqual(context.queryLanguage, 'he', 'Query in Hebrew');
      assert.strictEqual(context.assistantLanguage, 'he', 'Assistant responds in Hebrew');
      assert.strictEqual(context.searchLanguage, 'en', 'But search uses English (US region)');
    });

    it('Spanish tourist in Israel -> assistant fallback, search Hebrew', () => {
      const query = 'restaurantes buenos Tel Aviv';
      const queryLanguage = detectQueryLanguage(query);  // Will detect as 'en'
      
      const context = resolveLanguageContext({
        uiLanguage: 'en',
        queryLanguage,
        regionCode: 'IL',
        cityText: 'Tel Aviv',
        intentLanguage: 'es',  // Spanish (not supported)
        intentLanguageConfidence: 0.9
      });

      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant uses uiLanguage (Spanish not supported)');
      assert.strictEqual(context.searchLanguage, 'he', 'Search uses Hebrew (IL region policy)');
    });
  });

  describe('Canonical query generation (searchLanguage only)', () => {
    it('Canonical query must be in searchLanguage, not query language', () => {
      // Hebrew query for Paris location
      const hebrewQuery = 'מסעדות איטלקיות בפריז';
      const queryLanguage = detectQueryLanguage(hebrewQuery);
      
      const context = resolveLanguageContext({
        uiLanguage: 'he',
        queryLanguage,
        regionCode: 'FR',
        cityText: 'Paris',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      });

      // Canonical query should be generated in searchLanguage ('en'), not queryLanguage ('he')
      // This would be: "Italian restaurants Paris" (not "מסעדות איטלקיות Paris")
      assert.strictEqual(context.searchLanguage, 'en', 'Canonical query must use English');
      assert.notStrictEqual(context.searchLanguage, context.queryLanguage, 
        'Canonical query language must differ from query language for cross-region searches');
    });
  });
});
