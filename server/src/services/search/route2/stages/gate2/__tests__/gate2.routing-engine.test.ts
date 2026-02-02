/**
 * Gate2 Routing Engine Tests
 * 
 * Tests the pure deterministic routing logic that maps
 * LLM classification results to routing decisions.
 * 
 * Decision Matrix:
 * - foodSignal="YES"       => route="CONTINUE"
 * - foodSignal="UNCERTAIN" => route="ASK_CLARIFY"
 * - foodSignal="NO"        => route="STOP"
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Gate2RoutingEngine, type Gate2LLMResult } from '../gate2.routing-engine.js';

describe('Gate2RoutingEngine', () => {
  // Helper to create base LLM result
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

  describe('Decision Matrix - Core Routing Logic', () => {
    describe('foodSignal="YES" => CONTINUE', () => {
      it('should route to CONTINUE when foodSignal is YES', () => {
        const llmResult = createLLMResult('YES');
        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'CONTINUE', 'Route must be CONTINUE for YES signal');
        assert.strictEqual(result.foodSignal, 'YES');
        assert.strictEqual(result.stop, null, 'Stop payload should be null for CONTINUE');
      });

      it('should preserve all LLM fields when routing to CONTINUE', () => {
        const llmResult = createLLMResult('YES', {
          confidence: 0.87,
          assistantLanguage: 'en',
          assistantLanguageConfidence: 0.92
        });

        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'CONTINUE');
        assert.strictEqual(result.confidence, 0.87, 'Should preserve confidence');
        assert.strictEqual(result.language, 'en', 'Should preserve language');
        assert.strictEqual(result.languageConfidence, 0.92, 'Should preserve language confidence');
      });

      it('should handle YES with different languages', () => {
        const languages: Array<'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'> = [
          'he', 'en', 'ru', 'ar', 'fr', 'es', 'other'
        ];

        languages.forEach(lang => {
          const llmResult = createLLMResult('YES', { assistantLanguage: lang });
          const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

          assert.strictEqual(result.route, 'CONTINUE', `Should route to CONTINUE for language: ${lang}`);
          assert.strictEqual(result.language, lang, `Should preserve language: ${lang}`);
        });
      });
    });

    describe('foodSignal="UNCERTAIN" => ASK_CLARIFY', () => {
      it('should route to ASK_CLARIFY when foodSignal is UNCERTAIN', () => {
        const llmResult = createLLMResult('UNCERTAIN', {
          stop: {
            type: 'CLARIFY',
            reason: 'UNCERTAIN_DOMAIN',
            blocksSearch: true,
            suggestedAction: 'ASK_FOOD',
            message: 'לא בטוח מה אתה מחפש',
            question: 'אתה מחפש מסעדות?'
          }
        });

        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'ASK_CLARIFY', 'Route must be ASK_CLARIFY for UNCERTAIN signal');
        assert.strictEqual(result.foodSignal, 'UNCERTAIN');
        assert.ok(result.stop !== null, 'Stop payload should be present');
        assert.strictEqual(result.stop?.type, 'CLARIFY');
      });

      it('should preserve stop payload for UNCERTAIN', () => {
        const stopPayload = {
          type: 'CLARIFY' as const,
          reason: 'UNCERTAIN_DOMAIN' as const,
          blocksSearch: true as const,
          suggestedAction: 'ASK_FOOD' as const,
          message: 'Not sure what you want',
          question: 'Looking for food?'
        };

        const llmResult = createLLMResult('UNCERTAIN', { stop: stopPayload });
        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'ASK_CLARIFY');
        assert.deepStrictEqual(result.stop, stopPayload, 'Should preserve stop payload exactly');
      });

      it('should handle UNCERTAIN with different confidence levels', () => {
        const confidenceLevels = [0.3, 0.5, 0.7, 0.9];

        confidenceLevels.forEach(confidence => {
          const llmResult = createLLMResult('UNCERTAIN', { confidence });
          const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

          assert.strictEqual(result.route, 'ASK_CLARIFY', `Should route to ASK_CLARIFY for confidence: ${confidence}`);
          assert.strictEqual(result.confidence, confidence, `Should preserve confidence: ${confidence}`);
        });
      });
    });

    describe('foodSignal="NO" => STOP', () => {
      it('should route to STOP when foodSignal is NO', () => {
        const llmResult = createLLMResult('NO', {
          stop: {
            type: 'GATE_FAIL',
            reason: 'NO_FOOD',
            blocksSearch: true,
            suggestedAction: 'ASK_DOMAIN',
            message: 'זה לא נראה כמו חיפוש אוכל',
            question: 'אתה מחפש משהו אחר?'
          }
        });

        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'STOP', 'Route must be STOP for NO signal');
        assert.strictEqual(result.foodSignal, 'NO');
        assert.ok(result.stop !== null, 'Stop payload should be present');
        assert.strictEqual(result.stop?.type, 'GATE_FAIL');
      });

      it('should preserve stop payload for NO', () => {
        const stopPayload = {
          type: 'GATE_FAIL' as const,
          reason: 'NO_FOOD' as const,
          blocksSearch: true as const,
          suggestedAction: 'ASK_DOMAIN' as const,
          message: 'Not a food query',
          question: 'What are you looking for?'
        };

        const llmResult = createLLMResult('NO', { stop: stopPayload });
        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'STOP');
        assert.deepStrictEqual(result.stop, stopPayload, 'Should preserve stop payload exactly');
      });

      it('should handle NO with high confidence', () => {
        const llmResult = createLLMResult('NO', {
          confidence: 0.98,
          stop: {
            type: 'GATE_FAIL',
            reason: 'NO_FOOD',
            blocksSearch: true,
            suggestedAction: 'ASK_DOMAIN',
            message: 'Weather query',
            question: 'Want restaurants instead?'
          }
        });

        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'STOP');
        assert.strictEqual(result.confidence, 0.98, 'Should preserve high confidence');
      });
    });
  });

  describe('determineRoute - Direct Decision Matrix', () => {
    it('should map YES to CONTINUE', () => {
      const route = Gate2RoutingEngine.determineRoute('YES');
      assert.strictEqual(route, 'CONTINUE');
    });

    it('should map UNCERTAIN to ASK_CLARIFY', () => {
      const route = Gate2RoutingEngine.determineRoute('UNCERTAIN');
      assert.strictEqual(route, 'ASK_CLARIFY');
    });

    it('should map NO to STOP', () => {
      const route = Gate2RoutingEngine.determineRoute('NO');
      assert.strictEqual(route, 'STOP');
    });
  });

  describe('getRoutingDecision - Decision Details', () => {
    it('should provide details for YES decision', () => {
      const decision = Gate2RoutingEngine.getRoutingDecision('YES');

      assert.strictEqual(decision.route, 'CONTINUE');
      assert.ok(decision.reason.length > 0, 'Should have a reason');
      assert.ok(decision.expectedBehavior.length > 0, 'Should have expected behavior');
    });

    it('should provide details for UNCERTAIN decision', () => {
      const decision = Gate2RoutingEngine.getRoutingDecision('UNCERTAIN');

      assert.strictEqual(decision.route, 'ASK_CLARIFY');
      assert.ok(decision.reason.includes('clarif'), 'Reason should mention clarification');
      assert.ok(decision.expectedBehavior.includes('Ask'), 'Behavior should mention asking user');
    });

    it('should provide details for NO decision', () => {
      const decision = Gate2RoutingEngine.getRoutingDecision('NO');

      assert.strictEqual(decision.route, 'STOP');
      assert.ok(decision.reason.includes('Non-food'), 'Reason should mention non-food');
      assert.ok(decision.expectedBehavior.includes('Stop'), 'Behavior should mention stopping');
    });
  });

  describe('validateStopPayload - Consistency Checks', () => {
    it('should validate that YES has null stop payload', () => {
      const llmResult = createLLMResult('YES', { stop: null });
      const isValid = Gate2RoutingEngine.validateStopPayload(llmResult);

      assert.strictEqual(isValid, true, 'YES with null stop should be valid');
    });

    it('should invalidate YES with non-null stop payload', () => {
      const llmResult = createLLMResult('YES', {
        stop: {
          type: 'CLARIFY',
          reason: 'UNCERTAIN_DOMAIN',
          blocksSearch: true,
          suggestedAction: 'ASK_FOOD',
          message: 'test',
          question: 'test?'
        }
      });

      const isValid = Gate2RoutingEngine.validateStopPayload(llmResult);

      assert.strictEqual(isValid, false, 'YES with stop payload should be invalid');
    });

    it('should be lenient with UNCERTAIN missing stop payload', () => {
      const llmResult = createLLMResult('UNCERTAIN', { stop: null });
      const isValid = Gate2RoutingEngine.validateStopPayload(llmResult);

      // We're lenient - LLM may not always provide stop payload
      assert.strictEqual(isValid, true, 'Should be lenient with missing stop');
    });

    it('should be lenient with NO missing stop payload', () => {
      const llmResult = createLLMResult('NO', { stop: null });
      const isValid = Gate2RoutingEngine.validateStopPayload(llmResult);

      // We're lenient - LLM may not always provide stop payload
      assert.strictEqual(isValid, true, 'Should be lenient with missing stop');
    });
  });

  describe('summarize - Human-Readable Output', () => {
    it('should summarize YES decision', () => {
      const llmResult = createLLMResult('YES');
      const summary = Gate2RoutingEngine.summarize(llmResult);

      assert.ok(summary.includes('YES'), 'Should include YES');
      assert.ok(summary.includes('CONTINUE'), 'Should include CONTINUE');
    });

    it('should summarize UNCERTAIN decision', () => {
      const llmResult = createLLMResult('UNCERTAIN');
      const summary = Gate2RoutingEngine.summarize(llmResult);

      assert.ok(summary.includes('UNCERTAIN'), 'Should include UNCERTAIN');
      assert.ok(summary.includes('ASK_CLARIFY'), 'Should include ASK_CLARIFY');
    });

    it('should summarize NO decision', () => {
      const llmResult = createLLMResult('NO');
      const summary = Gate2RoutingEngine.summarize(llmResult);

      assert.ok(summary.includes('NO'), 'Should include NO');
      assert.ok(summary.includes('STOP'), 'Should include STOP');
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum confidence (0)', () => {
      const llmResult = createLLMResult('YES', { confidence: 0 });
      const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

      assert.strictEqual(result.route, 'CONTINUE');
      assert.strictEqual(result.confidence, 0);
    });

    it('should handle maximum confidence (1)', () => {
      const llmResult = createLLMResult('YES', { confidence: 1 });
      const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

      assert.strictEqual(result.route, 'CONTINUE');
      assert.strictEqual(result.confidence, 1);
    });

    it('should handle language="other"', () => {
      const llmResult = createLLMResult('YES', {
        assistantLanguage: 'other',
        assistantLanguageConfidence: 0.3
      });

      const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

      assert.strictEqual(result.route, 'CONTINUE');
      assert.strictEqual(result.language, 'other');
      assert.strictEqual(result.languageConfidence, 0.3);
    });

    it('should handle all stop payload reasons', () => {
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

        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'STOP', `Should STOP for reason: ${reason}`);
        assert.strictEqual(result.stop?.reason, reason, `Should preserve reason: ${reason}`);
      });
    });

    it('should handle all suggested actions', () => {
      const actions: Array<'ASK_FOOD' | 'ASK_DOMAIN' | 'ASK_LOCATION'> = [
        'ASK_FOOD',
        'ASK_DOMAIN',
        'ASK_LOCATION'
      ];

      actions.forEach(action => {
        const llmResult = createLLMResult('UNCERTAIN', {
          stop: {
            type: 'CLARIFY',
            reason: 'UNCERTAIN_DOMAIN',
            blocksSearch: true,
            suggestedAction: action,
            message: `Message for ${action}`,
            question: `Question for ${action}?`
          }
        });

        const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

        assert.strictEqual(result.route, 'ASK_CLARIFY', `Should ASK_CLARIFY for action: ${action}`);
        assert.strictEqual(result.stop?.suggestedAction, action, `Should preserve action: ${action}`);
      });
    });
  });

  describe('No Mutation Guarantee', () => {
    it('should not mutate input LLM result', () => {
      const llmResult = createLLMResult('YES', {
        confidence: 0.85,
        assistantLanguage: 'he'
      });

      const originalCopy = JSON.parse(JSON.stringify(llmResult));

      Gate2RoutingEngine.applyDeterministicRouting(llmResult);

      // Original should be unchanged
      assert.deepStrictEqual(llmResult, originalCopy, 'Input should not be mutated');
    });

    it('should return new object, not input reference', () => {
      const llmResult = createLLMResult('YES');
      const result = Gate2RoutingEngine.applyDeterministicRouting(llmResult);

      // Should be different objects (though some fields may have same values)
      assert.notStrictEqual(result, llmResult, 'Should return new object');
    });
  });
});
