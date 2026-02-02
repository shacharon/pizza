/**
 * Gate2 Routing Engine - Backward Compatibility Tests
 * 
 * Ensures that the new Gate2RoutingEngine produces identical routing decisions
 * to the legacy inline routing logic.
 * 
 * This verifies ZERO behavior changes after refactoring.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Gate2RoutingEngine, type Gate2LLMResult } from '../gate2.routing-engine.js';
import type { Gate2Result } from '../../../types.js';

describe('Gate2RoutingEngine - Backward Compatibility', () => {
  /**
   * Legacy routing logic (EXACT copy from gate2.stage.ts before refactoring)
   * This is what we're replacing and must match exactly
   */
  function legacyApplyDeterministicRouting(llmResult: Gate2LLMResult): Gate2Result {
    let route: 'CONTINUE' | 'ASK_CLARIFY' | 'STOP';

    if (llmResult.foodSignal === 'NO') {
      route = 'STOP';
    } else if (llmResult.foodSignal === 'UNCERTAIN') {
      route = 'ASK_CLARIFY';
    } else {
      route = 'CONTINUE';
    }

    return {
      foodSignal: llmResult.foodSignal,
      language: llmResult.assistantLanguage,
      languageConfidence: llmResult.assistantLanguageConfidence,
      route,
      confidence: llmResult.confidence,
      stop: llmResult.stop
    };
  }

  /**
   * Helper to create LLM result
   */
  const createLLMResult = (
    foodSignal: 'NO' | 'UNCERTAIN' | 'YES',
    overrides?: Partial<Gate2LLMResult>
  ): Gate2LLMResult => ({
    foodSignal,
    confidence: 0.9,
    assistantLanguage: 'he',
    assistantLanguageConfidence: 0.95,
    stop: null,
    ...overrides
  });

  /**
   * Deep compare Gate2Result objects
   */
  function assertGate2ResultsEqual(actual: Gate2Result, expected: Gate2Result, testName: string) {
    assert.strictEqual(actual.foodSignal, expected.foodSignal, `${testName}: foodSignal mismatch`);
    assert.strictEqual(actual.language, expected.language, `${testName}: language mismatch`);
    assert.strictEqual(actual.languageConfidence, expected.languageConfidence, `${testName}: languageConfidence mismatch`);
    assert.strictEqual(actual.route, expected.route, `${testName}: route mismatch`);
    assert.strictEqual(actual.confidence, expected.confidence, `${testName}: confidence mismatch`);
    assert.deepStrictEqual(actual.stop, expected.stop, `${testName}: stop payload mismatch`);
  }

  describe('YES foodSignal compatibility', () => {
    it('should match legacy for simple YES case', () => {
      const llmResult = createLLMResult('YES');

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Simple YES');
    });

    it('should match legacy for YES with English', () => {
      const llmResult = createLLMResult('YES', {
        assistantLanguage: 'en',
        assistantLanguageConfidence: 0.92,
        confidence: 0.88
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'YES with English');
    });

    it('should match legacy for YES with low confidence', () => {
      const llmResult = createLLMResult('YES', {
        confidence: 0.51,
        assistantLanguageConfidence: 0.65
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'YES with low confidence');
    });

    it('should match legacy for YES with all languages', () => {
      const languages: Array<'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'> = [
        'he', 'en', 'ru', 'ar', 'fr', 'es', 'other'
      ];

      languages.forEach(lang => {
        const llmResult = createLLMResult('YES', { assistantLanguage: lang });

        const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
        const legacyResult = legacyApplyDeterministicRouting(llmResult);

        assertGate2ResultsEqual(newResult, legacyResult, `YES with language: ${lang}`);
      });
    });
  });

  describe('UNCERTAIN foodSignal compatibility', () => {
    it('should match legacy for UNCERTAIN with stop payload', () => {
      const llmResult = createLLMResult('UNCERTAIN', {
        stop: {
          type: 'CLARIFY',
          reason: 'UNCERTAIN_DOMAIN',
          blocksSearch: true,
          suggestedAction: 'ASK_FOOD',
          message: 'לא בטוח מה אתה מחפש',
          question: 'אתה רוצה מסעדות?'
        }
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'UNCERTAIN with stop');
    });

    it('should match legacy for UNCERTAIN without stop payload', () => {
      const llmResult = createLLMResult('UNCERTAIN', {
        stop: null,
        confidence: 0.6
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'UNCERTAIN without stop');
    });

    it('should match legacy for UNCERTAIN with different languages', () => {
      const languages: Array<'he' | 'en' | 'ar' | 'ru'> = ['he', 'en', 'ar', 'ru'];

      languages.forEach(lang => {
        const llmResult = createLLMResult('UNCERTAIN', {
          assistantLanguage: lang,
          stop: {
            type: 'CLARIFY',
            reason: 'UNCERTAIN_DOMAIN',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'Message',
            question: 'Question?'
          }
        });

        const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
        const legacyResult = legacyApplyDeterministicRouting(llmResult);

        assertGate2ResultsEqual(newResult, legacyResult, `UNCERTAIN with language: ${lang}`);
      });
    });

    it('should match legacy for UNCERTAIN with edge case confidence', () => {
      const confidences = [0.0, 0.3, 0.5, 0.7, 1.0];

      confidences.forEach(confidence => {
        const llmResult = createLLMResult('UNCERTAIN', {
          confidence,
          stop: {
            type: 'CLARIFY',
            reason: 'UNCERTAIN_DOMAIN',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'Not sure',
            question: 'Want food?'
          }
        });

        const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
        const legacyResult = legacyApplyDeterministicRouting(llmResult);

        assertGate2ResultsEqual(newResult, legacyResult, `UNCERTAIN with confidence: ${confidence}`);
      });
    });
  });

  describe('NO foodSignal compatibility', () => {
    it('should match legacy for NO with stop payload', () => {
      const llmResult = createLLMResult('NO', {
        stop: {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          blocksSearch: true,
          suggestedAction: 'ASK_DOMAIN',
          message: 'זה לא נראה כמו חיפוש אוכל',
          question: 'מה אתה מחפש?'
        }
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'NO with stop');
    });

    it('should match legacy for NO without stop payload', () => {
      const llmResult = createLLMResult('NO', {
        stop: null,
        confidence: 0.95
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'NO without stop');
    });

    it('should match legacy for NO with high confidence', () => {
      const llmResult = createLLMResult('NO', {
        confidence: 0.98,
        assistantLanguageConfidence: 0.97,
        stop: {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          blocksSearch: true,
          suggestedAction: 'ASK_DOMAIN',
          message: 'Weather query detected',
          question: 'Want restaurants instead?'
        }
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'NO with high confidence');
    });

    it('should match legacy for NO with all stop reasons', () => {
      const reasons: Array<'NO_FOOD' | 'UNCERTAIN_DOMAIN' | 'MISSING_LOCATION'> = [
        'NO_FOOD',
        'UNCERTAIN_DOMAIN',
        'MISSING_LOCATION'
      ];

      reasons.forEach(reason => {
        const llmResult = createLLMResult('NO', {
          stop: {
            type: 'GATE_FAIL',
            reason,
            blocksSearch: true,
            suggestedAction: 'ASK_DOMAIN',
            message: `Message for ${reason}`,
            question: `Question for ${reason}?`
          }
        });

        const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
        const legacyResult = legacyApplyDeterministicRouting(llmResult);

        assertGate2ResultsEqual(newResult, legacyResult, `NO with reason: ${reason}`);
      });
    });
  });

  describe('Comprehensive scenarios', () => {
    it('should match legacy for typical food search (Hebrew YES)', () => {
      const llmResult: Gate2LLMResult = {
        foodSignal: 'YES',
        confidence: 0.95,
        assistantLanguage: 'he',
        assistantLanguageConfidence: 0.98,
        stop: null
      };

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Typical Hebrew food search');
    });

    it('should match legacy for English clarification', () => {
      const llmResult: Gate2LLMResult = {
        foodSignal: 'UNCERTAIN',
        confidence: 0.6,
        assistantLanguage: 'en',
        assistantLanguageConfidence: 0.9,
        stop: {
          type: 'CLARIFY',
          reason: 'UNCERTAIN_DOMAIN',
          blocksSearch: true,
          suggestedAction: 'ASK_FOOD',
          message: "I'm not sure what you're looking for.",
          question: 'Are you looking for restaurants?'
        }
      };

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'English clarification');
    });

    it('should match legacy for Arabic rejection', () => {
      const llmResult: Gate2LLMResult = {
        foodSignal: 'NO',
        confidence: 0.93,
        assistantLanguage: 'ar',
        assistantLanguageConfidence: 0.95,
        stop: {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          blocksSearch: true,
          suggestedAction: 'ASK_DOMAIN',
          message: 'هذا لا يبدو كبحث عن الطعام',
          question: 'هل تبحث عن مطاعم؟'
        }
      };

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Arabic rejection');
    });

    it('should match legacy for Russian uncertain', () => {
      const llmResult: Gate2LLMResult = {
        foodSignal: 'UNCERTAIN',
        confidence: 0.55,
        assistantLanguage: 'ru',
        assistantLanguageConfidence: 0.88,
        stop: {
          type: 'CLARIFY',
          reason: 'UNCERTAIN_DOMAIN',
          blocksSearch: true,
          suggestedAction: 'ASK_FOOD',
          message: 'Не уверен, что вы ищете',
          question: 'Вы ищете рестораны?'
        }
      };

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Russian uncertain');
    });

    it('should match legacy for "other" language with YES', () => {
      const llmResult: Gate2LLMResult = {
        foodSignal: 'YES',
        confidence: 0.7,
        assistantLanguage: 'other',
        assistantLanguageConfidence: 0.4,
        stop: null
      };

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Other language YES');
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should match legacy for minimum confidence', () => {
      const llmResult = createLLMResult('YES', {
        confidence: 0,
        assistantLanguageConfidence: 0
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Minimum confidence');
    });

    it('should match legacy for maximum confidence', () => {
      const llmResult = createLLMResult('YES', {
        confidence: 1,
        assistantLanguageConfidence: 1
      });

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      assertGate2ResultsEqual(newResult, legacyResult, 'Maximum confidence');
    });

    it('should match legacy for all combinations of foodSignal x language', () => {
      const foodSignals: Array<'NO' | 'UNCERTAIN' | 'YES'> = ['NO', 'UNCERTAIN', 'YES'];
      const languages: Array<'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'> = [
        'he', 'en', 'ru', 'ar', 'fr', 'es', 'other'
      ];

      foodSignals.forEach(foodSignal => {
        languages.forEach(lang => {
          const llmResult = createLLMResult(foodSignal, {
            assistantLanguage: lang,
            stop: foodSignal !== 'YES' ? {
              type: foodSignal === 'UNCERTAIN' ? 'CLARIFY' : 'GATE_FAIL',
              reason: foodSignal === 'NO' ? 'NO_FOOD' : 'UNCERTAIN_DOMAIN',
              blocksSearch: true,
              suggestedAction: 'ASK_FOOD',
              message: 'msg',
              question: 'q?'
            } : null
          });

          const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
          const legacyResult = legacyApplyDeterministicRouting(llmResult);

          assertGate2ResultsEqual(
            newResult,
            legacyResult,
            `${foodSignal} x ${lang}`
          );
        });
      });
    });
  });

  describe('Field preservation', () => {
    it('should preserve all fields exactly like legacy', () => {
      const llmResult: Gate2LLMResult = {
        foodSignal: 'UNCERTAIN',
        confidence: 0.73,
        assistantLanguage: 'fr',
        assistantLanguageConfidence: 0.82,
        stop: {
          type: 'CLARIFY',
          reason: 'UNCERTAIN_DOMAIN',
          blocksSearch: true,
          suggestedAction: 'ASK_FOOD',
          message: 'Je ne suis pas sûr',
          question: 'Cherchez-vous des restaurants?'
        }
      };

      const newResult = Gate2RoutingEngine.applyDeterministicRouting(llmResult);
      const legacyResult = legacyApplyDeterministicRouting(llmResult);

      // Check every field individually
      assert.strictEqual(newResult.foodSignal, legacyResult.foodSignal);
      assert.strictEqual(newResult.language, legacyResult.language);
      assert.strictEqual(newResult.languageConfidence, legacyResult.languageConfidence);
      assert.strictEqual(newResult.route, legacyResult.route);
      assert.strictEqual(newResult.confidence, legacyResult.confidence);
      assert.deepStrictEqual(newResult.stop, legacyResult.stop);

      // Check complete equality
      assert.deepStrictEqual(newResult, legacyResult, 'All fields should match exactly');
    });
  });
});
