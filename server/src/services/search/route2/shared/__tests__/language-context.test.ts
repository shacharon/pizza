/**
 * Language Context Tests
 * Validates strict language separation and policy enforcement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLanguageContext,
  validateLanguageContext,
  getRegionLanguagePolicy,
  type LanguageContextInput
} from '../language-context.js';

describe('Language Context Resolution', () => {
  describe('Invariant: searchLanguage determined by region ONLY', () => {
    it('should use Hebrew for IL region regardless of query language', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',  // English query
        regionCode: 'IL',     // Israel region
        intentLanguage: 'en',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'he', 'IL region must use Hebrew for search');
      assert.strictEqual(context.sources.searchLanguage, 'region_policy:IL');
    });

    it('should use English for US region regardless of query language', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',  // Hebrew query
        regionCode: 'US',     // US region
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'en', 'US region must use English for search');
      assert.strictEqual(context.sources.searchLanguage, 'region_policy:US');
    });

    it('should use region policy even when assistantLanguage differs', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'IL',       // Hebrew region
        intentLanguage: 'en',   // English assistant
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant should be English');
      assert.strictEqual(context.searchLanguage, 'he', 'Search should be Hebrew (region policy)');
      assert.notStrictEqual(context.assistantLanguage, context.searchLanguage, 'Assistant and search languages must be independent');
    });
  });

  describe('Invariant: assistantLanguage independent of searchLanguage', () => {
    it('should resolve different languages for assistant vs search', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'IL',       // Hebrew for search
        intentLanguage: 'en',   // English for assistant
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'en');
      assert.strictEqual(context.searchLanguage, 'he');
      assert.strictEqual(context.sources.assistantLanguage, 'llm_confident');
      assert.strictEqual(context.sources.searchLanguage, 'region_policy:IL');
    });

    it('should use LLM detection for assistant when confident', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'US',
        intentLanguage: 'he',   // Hebrew detected by LLM
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'he', 'Should use LLM-detected Hebrew for assistant');
      assert.strictEqual(context.searchLanguage, 'en', 'Should use English for US region search');
    });

    it('should fallback to uiLanguage for assistant when confidence low', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'en',
        regionCode: 'US',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.5  // Low confidence
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'he', 'Should fallback to uiLanguage');
      assert.strictEqual(context.searchLanguage, 'en', 'Should still use region policy for search');
      assert.strictEqual(context.sources.assistantLanguage, 'uiLanguage_low_confidence');
    });
  });

  describe('Region language policy', () => {
    it('should map Israel to Hebrew', () => {
      const policy = getRegionLanguagePolicy();
      assert.strictEqual(policy['IL'], 'he');
    });

    it('should map Palestine to Hebrew', () => {
      const policy = getRegionLanguagePolicy();
      assert.strictEqual(policy['PS'], 'he');
    });

    it('should map English-speaking countries to English', () => {
      const policy = getRegionLanguagePolicy();
      assert.strictEqual(policy['US'], 'en');
      assert.strictEqual(policy['GB'], 'en');
      assert.strictEqual(policy['CA'], 'en');
      assert.strictEqual(policy['AU'], 'en');
      assert.strictEqual(policy['NZ'], 'en');
      assert.strictEqual(policy['IE'], 'en');
    });

    it('should use English as global default for unknown regions', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'FR',  // France - not in policy
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'en', 'Unknown regions should default to English');
      assert.strictEqual(context.sources.searchLanguage, 'global_default');
    });
  });

  describe('Same intent, different query languages -> same search payload', () => {
    const sharedIntent = {
      uiLanguage: 'en' as const,
      regionCode: 'FR',
      cityText: 'Paris',
      countryCode: 'FR'
    };

    it('Hebrew query about Paris -> English search (policy)', () => {
      const input: LanguageContextInput = {
        ...sharedIntent,
        queryLanguage: 'he',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'en', 'Paris query should use English for search');
      assert.strictEqual(context.assistantLanguage, 'he', 'Assistant should use Hebrew');
    });

    it('English query about Paris -> English search (policy)', () => {
      const input: LanguageContextInput = {
        ...sharedIntent,
        queryLanguage: 'en',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'en', 'Paris query should use English for search');
      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant should use English');
    });

    it('French query about Paris -> English search (policy, no French support)', () => {
      const input: LanguageContextInput = {
        ...sharedIntent,
        queryLanguage: 'en',  // Fallback
        intentLanguage: 'fr',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'en', 'Paris query should use English for search');
      // Assistant falls back to uiLanguage since 'fr' not supported
      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant should fallback to uiLanguage');
    });

    it('All Paris queries should have same searchLanguage', () => {
      const contexts = [
        resolveLanguageContext({ ...sharedIntent, queryLanguage: 'he', intentLanguage: 'he', intentLanguageConfidence: 0.9 }),
        resolveLanguageContext({ ...sharedIntent, queryLanguage: 'en', intentLanguage: 'en', intentLanguageConfidence: 0.9 }),
        resolveLanguageContext({ ...sharedIntent, queryLanguage: 'en', intentLanguage: 'fr', intentLanguageConfidence: 0.9 })
      ];

      const searchLanguages = contexts.map(c => c.searchLanguage);
      assert.ok(searchLanguages.every(lang => lang === 'en'), 'All Paris queries must have same searchLanguage');
    });
  });

  describe('Validation', () => {
    it('should pass validation for valid context', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'US',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);
      
      assert.doesNotThrow(() => {
        validateLanguageContext(context);
      });
    });

    it('should validate that searchLanguage source is region-based', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'IL',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);
      
      // Should not throw - searchLanguage source is 'region_policy:IL'
      assert.doesNotThrow(() => {
        validateLanguageContext(context);
      });
      
      // Verify source is region-based
      assert.ok(context.sources.searchLanguage.includes('region_policy') || 
                context.sources.searchLanguage === 'global_default',
                'searchLanguage source must be region-based');
    });

    it('should detect invalid searchLanguage source', () => {
      const context = {
        uiLanguage: 'en' as const,
        queryLanguage: 'en' as const,
        assistantLanguage: 'en' as const,
        searchLanguage: 'en' as const,
        regionCode: 'US',
        sources: {
          assistantLanguage: 'llm_confident',
          searchLanguage: 'query_based'  // INVALID - should never be query-based
        }
      };

      assert.throws(() => {
        validateLanguageContext(context);
      }, /Invalid searchLanguage source.*query/);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing intent language', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL'
        // No intentLanguage/intentLanguageConfidence
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'he', 'Should fallback to uiLanguage');
      assert.strictEqual(context.searchLanguage, 'he', 'Should use region policy');
      assert.strictEqual(context.sources.assistantLanguage, 'uiLanguage');
    });

    it('should handle "other" intent language', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'US',
        intentLanguage: 'ru',  // Russian - not supported
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'en', 'Should fallback to uiLanguage for unsupported language');
      assert.strictEqual(context.searchLanguage, 'en', 'Should use region policy');
    });

    it('should handle region code with no policy', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'DE',  // Germany - not in policy
        intentLanguage: 'he',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.searchLanguage, 'en', 'Should use global default');
      assert.strictEqual(context.sources.searchLanguage, 'global_default');
    });
  });

  describe('Real-world scenarios', () => {
    it('Israeli user searching for Paris restaurants in Hebrew', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'FR',
        cityText: 'Paris',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'he', 'Assistant responds in Hebrew');
      assert.strictEqual(context.searchLanguage, 'en', 'Google search uses English (FR not in policy)');
      assert.strictEqual(context.queryLanguage, 'he', 'Query was in Hebrew');
      assert.strictEqual(context.uiLanguage, 'he', 'UI is in Hebrew');
    });

    it('American user in Israel searching in English', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'IL',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant responds in English');
      assert.strictEqual(context.searchLanguage, 'he', 'Google search uses Hebrew (IL region policy)');
      assert.strictEqual(context.queryLanguage, 'en', 'Query was in English');
      assert.strictEqual(context.uiLanguage, 'en', 'UI is in English');
    });

    it('Tourist in Israel searches in their native language', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',
        regionCode: 'IL',
        cityText: 'Tel Aviv',
        intentLanguage: 'es',  // Spanish query
        intentLanguageConfidence: 0.95
      };

      const context = resolveLanguageContext(input);

      // Assistant falls back to uiLanguage (Spanish not supported)
      assert.strictEqual(context.assistantLanguage, 'en', 'Assistant uses uiLanguage fallback');
      assert.strictEqual(context.searchLanguage, 'he', 'Google search uses Hebrew (IL region)');
    });
  });
});
