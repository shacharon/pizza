/**
 * Language Enforcement Tests
 * Validates strict end-to-end language enforcement invariants
 */

import { strict as assert } from 'assert';
import {
  initLangCtx,
  updateLangCtx,
  assertLangCtxImmutable,
  assertAssistantLanguage,
  assertProviderLanguage,
  validateLangCtx,
  serializeLangCtx,
  gate2LanguageToLangCode,
  type LangCtx,
  type LangCode
} from '../language-enforcement.js';

describe('Language Enforcement', () => {
  describe('initLangCtx', () => {
    it('should initialize langCtx with Gate2 output', () => {
      const langCtx = initLangCtx('ru', 0.9, 'IL');

      assert.strictEqual(langCtx.assistantLanguage, 'ru');
      assert.strictEqual(langCtx.assistantLanguageConfidence, 0.9);
      assert.strictEqual(langCtx.uiLanguage, 'ru');
      assert.strictEqual(langCtx.providerLanguage, 'ru');
      assert.strictEqual(langCtx.region, 'IL');
    });

    it('should handle "other" language by defaulting ui/provider to English', () => {
      const langCtx = initLangCtx('other', 0.5, 'US');

      assert.strictEqual(langCtx.assistantLanguage, 'other');
      assert.strictEqual(langCtx.uiLanguage, 'en');
      assert.strictEqual(langCtx.providerLanguage, 'en');
    });

    it('should throw on invalid confidence', () => {
      assert.throws(() => {
        initLangCtx('en', 1.5, 'IL');
      }, /Invalid assistantLanguageConfidence/);

      assert.throws(() => {
        initLangCtx('en', -0.1, 'IL');
      }, /Invalid assistantLanguageConfidence/);
    });
  });

  describe('updateLangCtx', () => {
    it('should update only mutable fields', () => {
      const original = initLangCtx('ru', 0.9, 'IL');
      
      const updated = updateLangCtx(
        original,
        { uiLanguage: 'en', providerLanguage: 'he', region: 'US' },
        'intent',
        'test-req'
      );

      // Immutable fields unchanged
      assert.strictEqual(updated.assistantLanguage, 'ru');
      assert.strictEqual(updated.assistantLanguageConfidence, 0.9);

      // Mutable fields updated
      assert.strictEqual(updated.uiLanguage, 'en');
      assert.strictEqual(updated.providerLanguage, 'he');
      assert.strictEqual(updated.region, 'US');
    });

    it('should preserve immutable fields even if not in updates', () => {
      const original = initLangCtx('ar', 0.85, 'IL');
      
      const updated = updateLangCtx(
        original,
        { region: 'FR' },
        'route_llm',
        'test-req-2'
      );

      assert.strictEqual(updated.assistantLanguage, 'ar');
      assert.strictEqual(updated.assistantLanguageConfidence, 0.85);
      assert.strictEqual(updated.region, 'FR');
    });
  });

  describe('assertLangCtxImmutable', () => {
    it('should pass when assistantLanguage is unchanged', () => {
      const original = initLangCtx('he', 0.95, 'IL');
      const received = { uiLanguage: 'en', providerLanguage: 'he' };

      assert.doesNotThrow(() => {
        assertLangCtxImmutable(original, received, 'intent', 'test-req');
      });
    });

    it('should throw when assistantLanguage is changed', () => {
      const original = initLangCtx('he', 0.95, 'IL');
      const received = { assistantLanguage: 'ru' };

      assert.throws(() => {
        assertLangCtxImmutable(original, received, 'intent', 'test-req');
      }, /LANG_ENFORCEMENT_VIOLATION.*assistantLanguage/);
    });

    it('should throw when assistantLanguageConfidence is changed', () => {
      const original = initLangCtx('en', 0.9, 'US');
      const received = { assistantLanguageConfidence: 0.5 };

      assert.throws(() => {
        assertLangCtxImmutable(original, received, 'route_llm', 'test-req-2');
      }, /LANG_ENFORCEMENT_VIOLATION.*assistantLanguageConfidence/);
    });

    it('should detect multiple simultaneous violations', () => {
      const original = initLangCtx('fr', 0.88, 'FR');
      const received = { assistantLanguage: 'en', assistantLanguageConfidence: 1.0 };

      // Should throw on first violation (assistantLanguage)
      assert.throws(() => {
        assertLangCtxImmutable(original, received, 'intent', 'test-req-3');
      }, /LANG_ENFORCEMENT_VIOLATION.*assistantLanguage/);
    });
  });

  describe('assertAssistantLanguage', () => {
    it('should pass when payload language matches langCtx', () => {
      const langCtx = initLangCtx('ru', 0.9, 'IL');

      assert.doesNotThrow(() => {
        assertAssistantLanguage(langCtx, 'ru', 'test-req', 'SUMMARY');
      });
    });

    it('should throw when payload language differs', () => {
      const langCtx = initLangCtx('he', 0.95, 'IL');

      assert.throws(() => {
        assertAssistantLanguage(langCtx, 'en', 'test-req', 'GATE_FAIL');
      }, /LANG_ENFORCEMENT_VIOLATION.*Assistant message language mismatch/);
    });

    it('should handle undefined payload language (defaults to en)', () => {
      const langCtx = initLangCtx('en', 0.9, 'US');

      assert.doesNotThrow(() => {
        assertAssistantLanguage(langCtx, undefined, 'test-req-2', 'CLARIFY');
      });
    });

    it('should normalize payload language codes', () => {
      const langCtx = initLangCtx('ar', 0.85, 'IL');

      // Should normalize 'AR' to 'ar' and match
      assert.doesNotThrow(() => {
        assertAssistantLanguage(langCtx, 'AR', 'test-req-3', 'SUMMARY');
      });
    });
  });

  describe('assertProviderLanguage', () => {
    it('should pass when provider language matches langCtx', () => {
      const langCtx = initLangCtx('es', 0.92, 'ES');

      assert.doesNotThrow(() => {
        assertProviderLanguage(langCtx, 'es', 'test-req', 'google_places');
      });
    });

    it('should throw when provider language differs', () => {
      const langCtx = initLangCtx('he', 0.95, 'IL');
      
      // Update providerLanguage to 'en' (allowed)
      const updated = updateLangCtx(langCtx, { providerLanguage: 'en' }, 'intent', 'test-req');

      assert.throws(() => {
        assertProviderLanguage(updated, 'he', 'test-req', 'google_places');
      }, /LANG_ENFORCEMENT_VIOLATION.*Provider language mismatch/);
    });

    it('should handle undefined provider language (defaults to en)', () => {
      const langCtx = initLangCtx('en', 0.9, 'US');

      assert.doesNotThrow(() => {
        assertProviderLanguage(langCtx, undefined, 'test-req-2', 'google_places');
      });
    });
  });

  describe('validateLangCtx', () => {
    it('should pass for valid langCtx', () => {
      const langCtx = initLangCtx('ru', 0.88, 'IL');

      assert.doesNotThrow(() => {
        validateLangCtx(langCtx, 'test-req');
      });
    });

    it('should throw on invalid assistantLanguage', () => {
      const langCtx: any = {
        assistantLanguage: 'invalid',
        assistantLanguageConfidence: 0.9,
        uiLanguage: 'en',
        providerLanguage: 'en',
        region: 'IL'
      };

      assert.throws(() => {
        validateLangCtx(langCtx, 'test-req');
      }, /Invalid assistantLanguage/);
    });

    it('should throw on invalid confidence', () => {
      const langCtx: any = {
        assistantLanguage: 'en',
        assistantLanguageConfidence: 1.5,
        uiLanguage: 'en',
        providerLanguage: 'en',
        region: 'IL'
      };

      assert.throws(() => {
        validateLangCtx(langCtx, 'test-req');
      }, /Invalid assistantLanguageConfidence/);
    });

    it('should throw on missing fields', () => {
      const langCtx: any = {
        assistantLanguage: 'en',
        assistantLanguageConfidence: 0.9,
        // Missing: uiLanguage, providerLanguage, region
      };

      assert.throws(() => {
        validateLangCtx(langCtx, 'test-req');
      }, /langCtx missing required fields/);
    });
  });

  describe('serializeLangCtx', () => {
    it('should serialize langCtx for result meta', () => {
      const langCtx = initLangCtx('he', 0.95, 'IL');
      const updated = updateLangCtx(langCtx, { providerLanguage: 'en' }, 'intent', 'test-req');

      const serialized = serializeLangCtx(updated);

      assert.strictEqual(serialized.assistantLanguage, 'he');
      assert.strictEqual(serialized.assistantLanguageConfidence, 0.95);
      assert.strictEqual(serialized.uiLanguage, 'he');
      assert.strictEqual(serialized.providerLanguage, 'en');
      assert.strictEqual(serialized.searchLanguage, 'en'); // Alias
      assert.strictEqual(serialized.region, 'IL');
    });

    it('should include searchLanguage alias for backward compatibility', () => {
      const langCtx = initLangCtx('ru', 0.9, 'IL');
      const serialized = serializeLangCtx(langCtx);

      assert.strictEqual(serialized.searchLanguage, serialized.providerLanguage);
    });
  });

  describe('gate2LanguageToLangCode', () => {
    it('should convert valid Gate2 language to LangCode', () => {
      assert.strictEqual(gate2LanguageToLangCode('he'), 'he');
      assert.strictEqual(gate2LanguageToLangCode('en'), 'en');
      assert.strictEqual(gate2LanguageToLangCode('ru'), 'ru');
      assert.strictEqual(gate2LanguageToLangCode('ar'), 'ar');
      assert.strictEqual(gate2LanguageToLangCode('fr'), 'fr');
      assert.strictEqual(gate2LanguageToLangCode('es'), 'es');
      assert.strictEqual(gate2LanguageToLangCode('other'), 'other');
    });

    it('should handle uppercase input', () => {
      assert.strictEqual(gate2LanguageToLangCode('HE'), 'he');
      assert.strictEqual(gate2LanguageToLangCode('RU'), 'ru');
    });

    it('should return "other" for invalid codes', () => {
      assert.strictEqual(gate2LanguageToLangCode('invalid'), 'other');
      assert.strictEqual(gate2LanguageToLangCode('de'), 'other');
      assert.strictEqual(gate2LanguageToLangCode('zh'), 'other');
    });
  });

  describe('Integration: Full pipeline flow', () => {
    it('should maintain immutability through pipeline stages', () => {
      // Stage 1: Gate2 initializes langCtx
      const gate2Output = initLangCtx('ru', 0.92, 'IL');

      // Stage 2: Intent stage updates mutable fields only
      const intentOutput = updateLangCtx(
        gate2Output,
        { uiLanguage: 'en', providerLanguage: 'ru' },
        'intent',
        'test-pipeline'
      );

      // Verify immutable fields preserved
      assert.strictEqual(intentOutput.assistantLanguage, 'ru');
      assert.strictEqual(intentOutput.assistantLanguageConfidence, 0.92);

      // Stage 3: Route LLM tries to change assistantLanguage (should be caught)
      const routeLLMOutput = { assistantLanguage: 'he', providerLanguage: 'he' };

      assert.throws(() => {
        assertLangCtxImmutable(intentOutput, routeLLMOutput, 'route_llm', 'test-pipeline');
      }, /LANG_ENFORCEMENT_VIOLATION/);

      // Stage 4: Assistant publisher enforces language
      assert.doesNotThrow(() => {
        assertAssistantLanguage(intentOutput, 'ru', 'test-pipeline', 'SUMMARY');
      });

      // Wrong language should throw
      assert.throws(() => {
        assertAssistantLanguage(intentOutput, 'he', 'test-pipeline', 'SUMMARY');
      }, /LANG_ENFORCEMENT_VIOLATION/);

      // Stage 5: Provider call enforces language
      assert.doesNotThrow(() => {
        assertProviderLanguage(intentOutput, 'ru', 'test-pipeline', 'google_places');
      });
    });

    it('should handle Hebrew query with English provider override', () => {
      // Hebrew query detected by Gate2
      const gate2Output = initLangCtx('he', 0.95, 'IL');

      // Intent decides to use English for Google API (policy decision)
      const intentOutput = updateLangCtx(
        gate2Output,
        { providerLanguage: 'en' },
        'intent',
        'test-he-en'
      );

      // Assistant messages MUST still be in Hebrew (immutable)
      assert.strictEqual(intentOutput.assistantLanguage, 'he');
      assert.doesNotThrow(() => {
        assertAssistantLanguage(intentOutput, 'he', 'test-he-en', 'SUMMARY');
      });

      // But provider calls use English (mutable)
      assert.doesNotThrow(() => {
        assertProviderLanguage(intentOutput, 'en', 'test-he-en', 'google_places');
      });
    });
  });
});
