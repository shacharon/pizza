/**
 * Language Context Resolver Tests
 * 
 * Tests deterministic language resolution rules across all scenarios
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveLanguageContext,
  validateLanguageContext,
  getRegionLanguagePolicy,
  PROVIDER_LANGUAGE_POLICY,
  type LanguageContext,
  type LanguageContextInput
} from '../language-context.js';

describe('Language Context Resolver', () => {
  describe('CRITICAL RULE: assistantLanguage ALWAYS = queryLanguage', () => {
    it('should set assistantLanguage = queryLanguage for Spanish query (he UI)', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'en', // Simulating Spanish detected as 'en'
        regionCode: 'IL',
        intentLanguage: 'es',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);

      // CRITICAL: assistantLanguage MUST = queryLanguage (not intentLanguage!)
      assert.strictEqual(context.assistantLanguage, 'en');
      assert.strictEqual(context.assistantLanguage, context.queryLanguage);
      assert.strictEqual(context.sources.assistantLanguage, 'query_language_deterministic');
    });

    it('should set assistantLanguage = queryLanguage for Hebrew query (en UI)', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'he',
        regionCode: 'IL'
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'he');
      assert.strictEqual(context.assistantLanguage, context.queryLanguage);
      assert.notStrictEqual(context.assistantLanguage, context.uiLanguage);
    });

    it('should set assistantLanguage = queryLanguage for English query', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'en',
        regionCode: 'US'
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'en');
      assert.strictEqual(context.assistantLanguage, context.queryLanguage);
    });

    it('should ignore intentLanguage even if confident (use queryLanguage)', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'he',
        regionCode: 'IL',
        intentLanguage: 'en', // LLM says English
        intentLanguageConfidence: 0.95 // High confidence
      };

      const context = resolveLanguageContext(input);

      // MUST use queryLanguage, NOT intentLanguage
      assert.strictEqual(context.assistantLanguage, 'he');
      assert.notStrictEqual(context.assistantLanguage, 'en');
      assert.strictEqual(context.intentLanguage, 'en'); // Logged for transparency
    });

    it('should ignore uiLanguage preference for assistant', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en', // User prefers English UI
        queryLanguage: 'he', // But typed Hebrew query
        regionCode: 'IL'
      };

      const context = resolveLanguageContext(input);

      // Assistant MUST match query language, not UI preference
      assert.strictEqual(context.assistantLanguage, 'he');
      assert.strictEqual(context.uiLanguage, 'en'); // UI stays English
    });
  });

  describe('searchLanguage (providerLanguage) resolution', () => {
    it('should use query language (not region) for IL region', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'en',  // User typed English
        regionCode: 'IL'  // Located in Israel (Hebrew region)
      };

      const context = resolveLanguageContext(input);

      // NEW: Query-driven policy - searchLanguage follows queryLanguage
      assert.strictEqual(context.searchLanguage, 'en', 'searchLanguage should match queryLanguage');
      assert.strictEqual(context.providerLanguage, 'en');
      assert.strictEqual(context.sources.searchLanguage, 'query_language_policy');
    });

    it('should use query language (not region) for US region', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'he',  // User typed Hebrew
        regionCode: 'US'  // Located in US (English region)
      };

      const context = resolveLanguageContext(input);

      // NEW: Query-driven policy - searchLanguage follows queryLanguage
      assert.strictEqual(context.searchLanguage, 'he', 'searchLanguage should match queryLanguage');
      assert.strictEqual(context.providerLanguage, 'he');
    });

    it('should use query language regardless of unknown region', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',  // User typed Hebrew
        regionCode: 'FR'  // Not in policy map
      };

      const context = resolveLanguageContext(input);

      // NEW: Query-driven policy - searchLanguage follows queryLanguage (ignores region)
      assert.strictEqual(context.searchLanguage, 'he', 'searchLanguage should match queryLanguage');
      assert.strictEqual(context.sources.searchLanguage, 'query_language_policy');
    });

    it('should ALWAYS use queryLanguage for searchLanguage (queryLanguage policy)', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',
        queryLanguage: 'he', // Hebrew query
        regionCode: 'US' // US region (English)
      };

      const context = resolveLanguageContext(input);

      // NEW BEHAVIOR: searchLanguage MUST come from query, NOT region
      assert.strictEqual(context.searchLanguage, 'he', 'searchLanguage should match queryLanguage');
      assert.strictEqual(context.searchLanguage, context.queryLanguage);
      assert.strictEqual(context.sources.searchLanguage, 'query_language_policy');
    });

    it('should create providerLanguage alias = searchLanguage', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL'
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.providerLanguage, context.searchLanguage);
    });
  });

  describe('Language separation (no cross-contamination)', () => {
    it('should keep all languages independent', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'en',       // User prefers English UI
        queryLanguage: 'he',    // But typed Hebrew query
        regionCode: 'US',       // Searching in US
        intentLanguage: 'he',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);

      // NEW BEHAVIOR: Query language drives search language
      assert.strictEqual(context.uiLanguage, 'en');           // UI stays English
      assert.strictEqual(context.queryLanguage, 'he');        // Query detected as Hebrew
      assert.strictEqual(context.assistantLanguage, 'he');    // Assistant matches query
      assert.strictEqual(context.searchLanguage, 'he');       // NEW: Google uses query language (not region)
    });

    it('should log intentLanguage for transparency without affecting behavior', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL',
        intentLanguage: 'es', // Spanish detected by LLM
        intentLanguageConfidence: 0.8
      };

      const context = resolveLanguageContext(input);

      // intentLanguage logged but doesn't affect any output language
      assert.strictEqual(context.intentLanguage, 'es');
      assert.strictEqual(context.assistantLanguage, 'he'); // Still uses queryLanguage
      assert.strictEqual(context.searchLanguage, 'he'); // Still uses region policy
    });
  });

  describe('Edge cases', () => {
    it('should handle missing intentLanguage gracefully', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL'
        // No intentLanguage/confidence
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.assistantLanguage, 'he');
      assert.strictEqual(context.intentLanguage, undefined);
    });

    it('should handle low intentLanguageConfidence', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL',
        intentLanguage: 'en',
        intentLanguageConfidence: 0.3 // Low confidence
      };

      const context = resolveLanguageContext(input);

      // Still uses queryLanguage (confidence doesn't matter)
      assert.strictEqual(context.assistantLanguage, 'he');
    });

    it('should use query language for all regions (query-driven policy)', () => {
      const policy = getRegionLanguagePolicy();
      const regions = Object.keys(policy);

      for (const region of regions) {
        const input: LanguageContextInput = {
          uiLanguage: 'he',
          queryLanguage: 'en',  // User typed English
          regionCode: region
        };

        const context = resolveLanguageContext(input);

        // NEW: Query language overrides region policy
        assert.strictEqual(context.searchLanguage, 'en', `searchLanguage should match queryLanguage for region ${region}`);
        assert.strictEqual(context.sources.searchLanguage, 'query_language_policy');
      }
    });
  });

  describe('Validation (validateLanguageContext)', () => {
    it('should pass validation for valid context', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL'
      };

      const context = resolveLanguageContext(input);

      // Should not throw
      assert.doesNotThrow(() => validateLanguageContext(context));
    });

    it('should fail if assistantLanguage != queryLanguage', () => {
      const invalidContext: LanguageContext = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        assistantLanguage: 'en', // INVALID: must = queryLanguage
        searchLanguage: 'he',
        providerLanguage: 'he',
        regionCode: 'IL',
        sources: {
          assistantLanguage: 'test',
          searchLanguage: 'region_policy:IL'
        }
      };

      assert.throws(
        () => validateLanguageContext(invalidContext),
        /assistantLanguage.*must equal queryLanguage/
      );
    });

    it('should fail if providerLanguage != searchLanguage', () => {
      const invalidContext: LanguageContext = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        assistantLanguage: 'he',
        searchLanguage: 'he',
        providerLanguage: 'en', // INVALID: must = searchLanguage
        regionCode: 'IL',
        sources: {
          assistantLanguage: 'query_language_deterministic',
          searchLanguage: 'region_policy:IL'
        }
      };

      assert.throws(
        () => validateLanguageContext(invalidContext),
        /providerLanguage.*must equal searchLanguage/
      );
    });

    it('should fail if missing required fields', () => {
      const invalidContext = {
        uiLanguage: 'he',
        // Missing other fields
      } as any;

      assert.throws(
        () => validateLanguageContext(invalidContext),
        /missing required fields/
      );
    });

    it('should fail if searchLanguage source is query-based (regionDefault mode)', () => {
      if (PROVIDER_LANGUAGE_POLICY !== 'regionDefault') {
        // Skip if policy changed
        return;
      }

      const invalidContext: LanguageContext = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        assistantLanguage: 'he',
        searchLanguage: 'he',
        providerLanguage: 'he',
        regionCode: 'IL',
        sources: {
          assistantLanguage: 'query_language_deterministic',
          searchLanguage: 'query_based' // INVALID in regionDefault mode
        }
      };

      assert.throws(
        () => validateLanguageContext(invalidContext),
        /must be region-based in regionDefault mode/
      );
    });
  });

  describe('Real-world scenarios', () => {
    it('Scenario: Spanish user with English UI in Israel', () => {
      // User typed Spanish query, has English UI, searches in Israel
      const input: LanguageContextInput = {
        uiLanguage: 'en',       // UI preference
        queryLanguage: 'en',    // Detected (Spanish mapped to 'en')
        regionCode: 'IL',
        intentLanguage: 'es',   // LLM detected Spanish
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input);

      // UI stays English
      assert.strictEqual(context.uiLanguage, 'en');
      
      // Assistant matches query language (not LLM detection!)
      assert.strictEqual(context.assistantLanguage, 'en');
      assert.strictEqual(context.assistantLanguage, context.queryLanguage);
      
      // NEW: Google uses query language (English), NOT region policy
      assert.strictEqual(context.searchLanguage, 'en', 'searchLanguage should match queryLanguage');
      assert.strictEqual(context.providerLanguage, 'en');
      
      // intentLanguage logged for observability
      assert.strictEqual(context.intentLanguage, 'es');
    });

    it('Scenario: Hebrew user searching in US', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'US'
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.uiLanguage, 'he');
      assert.strictEqual(context.assistantLanguage, 'he'); // Matches query
      // NEW: Google uses query language (Hebrew), NOT region policy (English)
      assert.strictEqual(context.searchLanguage, 'he', 'searchLanguage should match queryLanguage');
    });

    it('Scenario: English query in Israel with Hebrew UI', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'en',  // User typed English
        regionCode: 'IL'  // Located in Israel
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.uiLanguage, 'he');
      assert.strictEqual(context.assistantLanguage, 'en'); // Matches query
      // NEW: Google uses query language (English), NOT region policy (Hebrew)
      assert.strictEqual(context.searchLanguage, 'en', 'searchLanguage should match queryLanguage');
    });
  });

  describe('Logging and observability', () => {
    it('should include all required fields in context', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL',
        intentLanguage: 'he',
        intentLanguageConfidence: 0.9
      };

      const context = resolveLanguageContext(input, 'test-request-id');

      // All fields present
      assert.ok(context.uiLanguage);
      assert.ok(context.queryLanguage);
      assert.ok(context.assistantLanguage);
      assert.ok(context.searchLanguage);
      assert.ok(context.providerLanguage);
      assert.ok(context.regionCode);
      assert.ok(context.sources.assistantLanguage);
      assert.ok(context.sources.searchLanguage);
    });

    it('should have deterministic source for assistantLanguage', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL'
      };

      const context = resolveLanguageContext(input);

      assert.strictEqual(context.sources.assistantLanguage, 'query_language_deterministic');
    });

    it('should have query-based source for searchLanguage (queryLanguage policy)', () => {
      const input: LanguageContextInput = {
        uiLanguage: 'he',
        queryLanguage: 'he',
        regionCode: 'IL'
      };

      const context = resolveLanguageContext(input);

      // NEW: Source must be query_language_policy (not region-based)
      assert.strictEqual(
        context.sources.searchLanguage,
        'query_language_policy',
        'searchLanguage source must be query-driven'
      );
    });
  });
});
