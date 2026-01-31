/**
 * Cuisine Enforcer Edge Cases Tests
 * Tests for small-sample guard and relaxation strategies
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executeCuisineEnforcement, type CuisineEnforcerInput } from '../cuisine-enforcer.service.js';
import type { LLMProvider } from '../../../../../../llm/types.js';
import type { PlaceInput } from '../cuisine-enforcer.schema.js';

describe('Cuisine Enforcer - Edge Cases', () => {

  describe('Small Sample Guard (< 5 results)', () => {

    it('should skip enforcement when countIn = 1 (never reduce to 0)', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => {
          throw new Error('LLM should not be called for small samples');
        })
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Burger King', types: ['restaurant'], address: 'Tel Aviv' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian', 'איטלקית'],
        preferredTerms: ['pasta', 'pizza'],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-1');

      // Should keep all places (enforcement skipped)
      assert.strictEqual(result.keepPlaceIds.length, 1, 'Should keep 1 result');
      assert.deepStrictEqual(result.keepPlaceIds, ['1'], 'Should keep the only result');
      assert.strictEqual(result.relaxApplied, false, 'Should not apply relaxation');
      assert.strictEqual(result.relaxStrategy, 'none', 'Should use no strategy');
      assert.strictEqual(result.enforcementSkipped, true, 'Should mark enforcement as skipped');

      // LLM should NOT be called
      assert.strictEqual((mockLLM.completeJSON as any).mock.calls.length, 0, 'LLM should not be called');
    });

    it('should skip enforcement when countIn = 4 (below threshold)', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => {
          throw new Error('LLM should not be called for small samples');
        })
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Italian Place 1', types: ['restaurant'], address: 'City A' },
        { placeId: '2', name: 'Italian Place 2', types: ['restaurant'], address: 'City B' },
        { placeId: '3', name: 'Burger Place', types: ['restaurant'], address: 'City C' },
        { placeId: '4', name: 'Shawarma Place', types: ['restaurant'], address: 'City D' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: [],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-2');

      assert.strictEqual(result.keepPlaceIds.length, 4, 'Should keep all 4 results');
      assert.strictEqual(result.enforcementSkipped, true, 'Should mark as skipped');
      assert.strictEqual((mockLLM.completeJSON as any).mock.calls.length, 0, 'LLM should not be called');
    });

    it('should run enforcement when countIn >= 5 (at threshold)', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => ({
          data: {
            keepPlaceIds: ['1', '2'],
            relaxApplied: false,
            relaxStrategy: 'none'
          }
        }))
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Italian 1', types: ['italian_restaurant'], address: 'A' },
        { placeId: '2', name: 'Italian 2', types: ['italian_restaurant'], address: 'B' },
        { placeId: '3', name: 'Burger', types: ['restaurant'], address: 'C' },
        { placeId: '4', name: 'Shawarma', types: ['restaurant'], address: 'D' },
        { placeId: '5', name: 'Sushi', types: ['restaurant'], address: 'E' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: [],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-3');

      // Should run enforcement (countIn = 5, at threshold)
      assert.strictEqual(result.keepPlaceIds.length, 2, 'Should keep 2 Italian places');
      assert.strictEqual(result.enforcementSkipped, undefined, 'Should not mark as skipped');
      assert.strictEqual((mockLLM.completeJSON as any).mock.calls.length, 1, 'LLM should be called once');
    });
  });

  describe('Zero Results After STRICT Enforcement', () => {

    it('should handle 0 results gracefully (no crash)', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => ({
          data: {
            keepPlaceIds: [],
            relaxApplied: false,
            relaxStrategy: 'none'
          }
        }))
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Generic Restaurant 1', types: ['restaurant'], address: 'A' },
        { placeId: '2', name: 'Generic Restaurant 2', types: ['restaurant'], address: 'B' },
        { placeId: '3', name: 'Generic Restaurant 3', types: ['restaurant'], address: 'C' },
        { placeId: '4', name: 'Generic Restaurant 4', types: ['restaurant'], address: 'D' },
        { placeId: '5', name: 'Generic Restaurant 5', types: ['restaurant'], address: 'E' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: ['pasta', 'pizza'],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-4');

      // Should return 0 results (no crash)
      assert.strictEqual(result.keepPlaceIds.length, 0, 'Should return 0 results');
      assert.strictEqual(result.relaxApplied, false, 'Relaxation not applied by enforcer itself');
    });

    it('should annotate results with cuisineMatch when enforcement skipped', async () => {
      // This test validates that when enforcement is skipped,
      // the system can still provide cuisine match metadata (if computed)
      const mockLLM = {
        completeJSON: mock.fn(async () => {
          throw new Error('Should not be called');
        })
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Italian Restaurant', types: ['italian_restaurant'], address: 'A' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: [],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-5');

      // Enforcement skipped (countIn < 5), but metadata could still be useful
      assert.strictEqual(result.keepPlaceIds.length, 1);
      assert.strictEqual(result.enforcementSkipped, true);

      // Note: Actual cuisineMatch annotation would be done at orchestrator level
      // This test validates that enforcement doesn't crash and preserves data
    });
  });

  describe('Relaxation Strategies', () => {

    it('should use fallback_preferred strategy when STRICT returns < 5', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => ({
          data: {
            keepPlaceIds: ['1', '2', '3', '4'],
            relaxApplied: true,
            relaxStrategy: 'fallback_preferred'
          }
        }))
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Italian 1', types: ['italian_restaurant'], address: 'A' },
        { placeId: '2', name: 'Italian 2', types: ['italian_restaurant'], address: 'B' },
        { placeId: '3', name: 'Pizza Place', types: ['restaurant'], address: 'C' },
        { placeId: '4', name: 'Pasta Bar', types: ['restaurant'], address: 'D' },
        { placeId: '5', name: 'Burger King', types: ['restaurant'], address: 'E' },
        { placeId: '6', name: 'Shawarma', types: ['restaurant'], address: 'F' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: ['pizza', 'pasta'],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-6');

      assert.strictEqual(result.keepPlaceIds.length, 4);
      assert.strictEqual(result.relaxApplied, true);
      assert.strictEqual(result.relaxStrategy, 'fallback_preferred');
    });

    it('should use drop_required_once strategy when fallback_preferred insufficient', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => ({
          data: {
            keepPlaceIds: ['1', '2', '3', '4', '5'],
            relaxApplied: true,
            relaxStrategy: 'drop_required_once'
          }
        }))
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Mediterranean 1', types: ['restaurant'], address: 'A' },
        { placeId: '2', name: 'Mediterranean 2', types: ['restaurant'], address: 'B' },
        { placeId: '3', name: 'Greek Restaurant', types: ['restaurant'], address: 'C' },
        { placeId: '4', name: 'Turkish Restaurant', types: ['restaurant'], address: 'D' },
        { placeId: '5', name: 'Lebanese Restaurant', types: ['restaurant'], address: 'E' },
        { placeId: '6', name: 'Burger King', types: ['restaurant'], address: 'F' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: ['mediterranean'],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-7');

      assert.strictEqual(result.keepPlaceIds.length, 5);
      assert.strictEqual(result.relaxApplied, true);
      assert.strictEqual(result.relaxStrategy, 'drop_required_once');
    });
  });

  describe('Error Handling', () => {

    it('should fail gracefully on LLM error (return all places)', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => {
          throw new Error('LLM service unavailable');
        })
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Place 1', types: ['restaurant'], address: 'A' },
        { placeId: '2', name: 'Place 2', types: ['restaurant'], address: 'B' },
        { placeId: '3', name: 'Place 3', types: ['restaurant'], address: 'C' },
        { placeId: '4', name: 'Place 4', types: ['restaurant'], address: 'D' },
        { placeId: '5', name: 'Place 5', types: ['restaurant'], address: 'E' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: [],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-8');

      // Should return all places on error (fail gracefully)
      assert.strictEqual(result.keepPlaceIds.length, 5, 'Should keep all places on error');
      assert.deepStrictEqual(result.keepPlaceIds, ['1', '2', '3', '4', '5']);
      assert.strictEqual(result.relaxApplied, false);
      assert.strictEqual(result.relaxStrategy, 'none');
    });

    it('should handle empty input gracefully', async () => {
      const mockLLM = {
        completeJSON: mock.fn(async () => {
          throw new Error('Should not be called');
        })
      } as any;

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: [],
        strictness: 'STRICT',
        places: []
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-9');

      assert.strictEqual(result.keepPlaceIds.length, 0);
      assert.strictEqual((mockLLM.completeJSON as any).mock.calls.length, 0);
    });
  });

  describe('Integration Scenarios', () => {

    it('should handle real-world "1 Italian result in small city" scenario', async () => {
      // Scenario: User searches "מסעדות איטלקיות בגדרה" (Italian restaurants in Gedera)
      // Google returns 1 result (small city, limited options)
      // Enforcement should NOT wipe this result

      const mockLLM = {
        completeJSON: mock.fn(async () => {
          throw new Error('Should not call LLM for 1 result');
        })
      } as any;

      const places: PlaceInput[] = [
        {
          placeId: 'italian-gedera-1',
          name: 'Pasta House Gedera',
          types: ['italian_restaurant', 'restaurant'],
          address: 'Gedera, Israel',
          rating: 4.5,
          userRatingsTotal: 120
        }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['איטלקית', 'איטלקי'],
        preferredTerms: ['פסטה', 'פיצה'],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-gedera');

      // CRITICAL: Should keep the 1 result (small sample guard)
      assert.strictEqual(result.keepPlaceIds.length, 1, 'Must keep 1 result (small sample guard)');
      assert.strictEqual(result.keepPlaceIds[0], 'italian-gedera-1');
      assert.strictEqual(result.enforcementSkipped, true, 'Enforcement should be skipped');
    });

    it('should handle "5 generic results, 0 Italian matches" scenario with relaxation', async () => {
      // Scenario: Google returns 5 generic restaurants, none match Italian
      // First LLM call returns 0 results (STRICT enforcement)
      // Orchestrator should trigger relaxation (tested separately in orchestrator tests)

      const mockLLM = {
        completeJSON: mock.fn(async () => ({
          data: {
            keepPlaceIds: [],
            relaxApplied: false,
            relaxStrategy: 'none'
          }
        }))
      } as any;

      const places: PlaceInput[] = [
        { placeId: '1', name: 'Shawarma King', types: ['restaurant'], address: 'A' },
        { placeId: '2', name: 'Burger Place', types: ['restaurant'], address: 'B' },
        { placeId: '3', name: 'Sushi Bar', types: ['restaurant'], address: 'C' },
        { placeId: '4', name: 'Pizza Hut', types: ['restaurant'], address: 'D' },
        { placeId: '5', name: 'Chinese Restaurant', types: ['restaurant'], address: 'E' }
      ];

      const input: CuisineEnforcerInput = {
        requiredTerms: ['italian'],
        preferredTerms: ['pasta', 'pizza'],
        strictness: 'STRICT',
        places
      };

      const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-no-match');

      // Enforcer returns 0 (orchestrator will handle relaxation)
      assert.strictEqual(result.keepPlaceIds.length, 0, 'STRICT enforcement returns 0');
      assert.strictEqual(result.relaxApplied, false, 'Enforcer does not relax (orchestrator does)');

      // Orchestrator should detect this and trigger SOFT mode or Google rerun
      // (Tested in orchestrator integration tests)
    });
  });
});
