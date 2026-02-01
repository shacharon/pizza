/**
 * Tests for graceful language enforcement degradation
 * Verifies strict enforcement when langCtx present, graceful fallback when missing
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAssistantLanguageGraceful } from '../../language-enforcement.js';
import type { LangCtx } from '../../language-enforcement.js';

describe('Graceful Language Enforcement', () => {
  describe('Strict Enforcement (langCtx present)', () => {
    test('should enforce language match when langCtx is present', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'he',
        assistantLanguageConfidence: 0.95,
        uiLanguage: 'he',
        providerLanguage: 'he',
        region: 'IL'
      };

      const result = verifyAssistantLanguageGraceful(
        langCtx,
        'he', // matches
        'test-req-123',
        'test_context'
      );

      assert.strictEqual(result.allowed, true, 'Should allow matching language');
      assert.strictEqual(result.expectedLanguage, 'he', 'Expected should be he');
      assert.strictEqual(result.actualLanguage, 'he', 'Actual should be he');
      assert.strictEqual(result.wasEnforced, true, 'Should be strictly enforced');
      assert.strictEqual(result.source, 'langCtx_strict', 'Source should be langCtx_strict');
      assert.strictEqual(result.warning, undefined, 'Should have no warning');
    });

    test('should throw on language mismatch when langCtx is present', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'en',
        assistantLanguageConfidence: 0.95,
        uiLanguage: 'en',
        providerLanguage: 'en',
        region: 'US'
      };

      assert.throws(
        () => {
          verifyAssistantLanguageGraceful(
            langCtx,
            'he', // MISMATCH - expected en, got he
            'test-req-456',
            'test_context'
          );
        },
        {
          message: /LANG_ENFORCEMENT_VIOLATION.*expected en, got he/
        },
        'Should throw on language mismatch when langCtx present'
      );
    });
  });

  describe('Graceful Degradation (langCtx missing)', () => {
    test('should allow publish when langCtx missing and language derived from uiLanguage matches', () => {
      const result = verifyAssistantLanguageGraceful(
        undefined, // langCtx missing!
        'he', // message in Hebrew
        'test-req-789',
        'test_context',
        {
          uiLanguage: 'he' // Fallback source
        }
      );

      assert.strictEqual(result.allowed, true, 'Should allow publish');
      assert.strictEqual(result.expectedLanguage, 'he', 'Expected derived from uiLanguage');
      assert.strictEqual(result.actualLanguage, 'he', 'Actual should be he');
      assert.strictEqual(result.wasEnforced, false, 'Should NOT be strictly enforced');
      assert.strictEqual(result.source, 'ui_language', 'Source should be ui_language');
      assert.strictEqual(result.warning, undefined, 'Should have no warning (match)');
    });

    test('should allow publish when langCtx missing and language derived from queryLanguage matches', () => {
      const result = verifyAssistantLanguageGraceful(
        undefined, // langCtx missing!
        'he', // message in Hebrew
        'test-req-abc',
        'test_context',
        {
          queryLanguage: 'he', // Fallback source (priority over uiLanguage)
          uiLanguage: 'en'
        }
      );

      assert.strictEqual(result.allowed, true, 'Should allow publish');
      assert.strictEqual(result.expectedLanguage, 'he', 'Expected derived from queryLanguage');
      assert.strictEqual(result.actualLanguage, 'he', 'Actual should be he');
      assert.strictEqual(result.wasEnforced, false, 'Should NOT be strictly enforced');
      assert.strictEqual(result.source, 'query_language', 'Source should be query_language');
      assert.strictEqual(result.warning, undefined, 'Should have no warning (match)');
    });

    test('should allow publish with warning when langCtx missing and derived language mismatches', () => {
      const result = verifyAssistantLanguageGraceful(
        undefined, // langCtx missing!
        'he', // message in Hebrew
        'test-req-def',
        'test_context',
        {
          uiLanguage: 'en' // Derived expected=en, but actual=he
        }
      );

      assert.strictEqual(result.allowed, true, 'Should STILL allow publish (graceful)');
      assert.strictEqual(result.expectedLanguage, 'en', 'Expected derived from uiLanguage');
      assert.strictEqual(result.actualLanguage, 'he', 'Actual should be he');
      assert.strictEqual(result.wasEnforced, false, 'Should NOT be strictly enforced');
      assert.strictEqual(result.source, 'ui_language', 'Source should be ui_language');
      assert.ok(result.warning, 'Should have warning about mismatch');
      assert.ok(result.warning?.includes('expected=en'), 'Warning should mention expected=en');
      assert.ok(result.warning?.includes('actual=he'), 'Warning should mention actual=he');
    });

    test('should allow publish with unknown when langCtx missing and no fallback sources', () => {
      const result = verifyAssistantLanguageGraceful(
        undefined, // langCtx missing!
        'he', // message in Hebrew
        'test-req-xyz',
        'test_context',
        {} // No fallback sources!
      );

      assert.strictEqual(result.allowed, true, 'Should allow publish');
      assert.strictEqual(result.expectedLanguage, 'unknown', 'Expected should be unknown');
      assert.strictEqual(result.actualLanguage, 'he', 'Actual should be he');
      assert.strictEqual(result.wasEnforced, false, 'Should NOT be strictly enforced');
      assert.strictEqual(result.source, 'no_fallback_sources', 'Source should be no_fallback_sources');
      assert.ok(result.warning, 'Should have warning about unknown');
      assert.ok(result.warning?.includes('unknown'), 'Warning should mention unknown');
    });

    test('should prioritize storedLanguageContext over other fallback sources', () => {
      const result = verifyAssistantLanguageGraceful(
        undefined, // langCtx missing!
        'he', // message in Hebrew
        'test-req-stored',
        'test_context',
        {
          storedLanguageContext: { assistantLanguage: 'he' }, // Priority 1
          queryLanguage: 'en', // Would be used if stored missing
          uiLanguage: 'en'
        }
      );

      assert.strictEqual(result.allowed, true, 'Should allow publish');
      assert.strictEqual(result.expectedLanguage, 'he', 'Expected from storedLanguageContext');
      assert.strictEqual(result.actualLanguage, 'he', 'Actual should be he');
      assert.strictEqual(result.source, 'stored_context', 'Source should be stored_context');
      assert.strictEqual(result.warning, undefined, 'Should have no warning (match)');
    });
  });

  describe('Edge Cases', () => {
    test('should normalize undefined payload language to "en" and check enforcement', () => {
      const langCtx: LangCtx = {
        assistantLanguage: 'en', // Changed to 'en' so normalized undefined matches
        assistantLanguageConfidence: 0.95,
        uiLanguage: 'en',
        providerLanguage: 'en',
        region: 'US'
      };

      // Test normalization of undefined - should normalize to 'en'
      const result = verifyAssistantLanguageGraceful(
        langCtx,
        undefined, // Should normalize to 'en'
        'test-req-norm1',
        'test_context'
      );

      assert.strictEqual(result.allowed, true, 'Should allow when normalized matches');
      assert.strictEqual(result.expectedLanguage, 'en', 'Expected should be en');
      assert.strictEqual(result.actualLanguage, 'en', 'Normalized undefined should be en');
    });

    test('should handle other language codes gracefully', () => {
      const result = verifyAssistantLanguageGraceful(
        undefined, // langCtx missing!
        'ru', // Russian message
        'test-req-ru',
        'test_context',
        {
          queryLanguage: 'ru'
        }
      );

      assert.strictEqual(result.allowed, true, 'Should allow publish');
      assert.strictEqual(result.expectedLanguage, 'ru', 'Expected should be ru');
      assert.strictEqual(result.actualLanguage, 'ru', 'Actual should be ru');
      assert.strictEqual(result.source, 'query_language', 'Source should be query_language');
    });
  });

  describe('Integration with Publisher Flow', () => {
    test('should demonstrate end-to-end graceful degradation flow', () => {
      // Scenario: SUMMARY generation succeeds in Hebrew, but langCtx is missing
      // Expected: Publish should succeed with derived language from uiLanguage

      // Step 1: Verify language gracefully (no throw)
      const verification = verifyAssistantLanguageGraceful(
        undefined, // Bug: langCtx missing
        'he', // LLM returned Hebrew message
        'test-req-e2e',
        'assistant_type:SUMMARY',
        {
          uiLanguage: 'he' // Derive from request context
        }
      );

      // Step 2: Verification should allow publish
      assert.strictEqual(verification.allowed, true, 'Should allow publish');
      assert.strictEqual(verification.expectedLanguage, 'he', 'Expected derived as he');
      assert.strictEqual(verification.actualLanguage, 'he', 'Actual is he');
      assert.strictEqual(verification.wasEnforced, false, 'Not strictly enforced');

      // Step 3: Determine WS payload language
      let wsLanguage: 'he' | 'en';
      if (verification.actualLanguage === 'he') {
        wsLanguage = 'he';
      } else {
        wsLanguage = 'en';
      }

      assert.strictEqual(wsLanguage, 'he', 'WS payload should use Hebrew');

      // Step 4: Verify no errors thrown - publish would succeed
      assert.ok(true, 'No errors thrown - graceful degradation successful');
    });
  });
});
