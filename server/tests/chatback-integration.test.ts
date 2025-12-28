/**
 * ChatBack Integration Tests
 * End-to-end validation: Query → RSE → ChatBack → Message
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ResultStateEngine, type CityFilterResult } from '../src/services/search/rse/result-state-engine.js';
import { ChatBackService } from '../src/services/search/chatback/chatback.service.js';
import type { RestaurantResult, ParsedIntent } from '../src/services/search/types/search.types.js';

describe('ChatBack Integration', () => {
  const rse = new ResultStateEngine();
  const chatBack = new ChatBackService();

  // Helper to create mock results
  const createMockResults = (count: number, overrides?: Partial<RestaurantResult>): RestaurantResult[] => {
    return Array.from({ length: count }, (_, i) => ({
      placeId: `place_${i}`,
      name: `Restaurant ${i}`,
      address: `Address ${i}`,
      location: { lat: 32.0853 + i * 0.001, lng: 34.7818 + i * 0.001 },
      rating: 4.0,
      priceLevel: 2,
      openNow: true,
      source: 'google_places' as const,
      ...overrides
    }));
  };

  // Helper to create mock intent
  const createMockIntent = (overrides?: Partial<ParsedIntent>): ParsedIntent => {
    return {
      query: 'pizza',
      location: {
        city: 'tel aviv',
        coords: { lat: 32.0853, lng: 34.7818 }
      },
      searchMode: 'textsearch' as const,
      filters: {},
      language: 'en',
      ...overrides
    };
  };

  // Helper to create mock filter result
  const createMockFilterResult = (kept: RestaurantResult[], dropped: RestaurantResult[]): CityFilterResult => {
    return {
      kept,
      dropped,
      stats: {
        dropReasons: {},
        nearbyCity: undefined,
        nearbyDistance: undefined
      }
    };
  };

  describe('End-to-End Flow', () => {
    it('should handle zero results with nearby scenario', async () => {
      // Step 1: RSE analyzes results
      const nearbyResults = createMockResults(5);
      const intent = createMockIntent({ language: 'he' });
      const filterResult = createMockFilterResult([], nearbyResults);
      filterResult.stats.droppedCount = 5;

      const plan = rse.analyze([], intent, filterResult, 0.8);

      // Verify RSE output
      assert.strictEqual(plan.scenario, 'zero_nearby_exists');
      assert.strictEqual(plan.results.total, 0);
      assert.ok(plan.fallback.length > 0);
      assert.ok(plan.suggestedActions.length > 0);

      // Step 2: ChatBack generates message
      const chatBackInput = {
        userText: 'פיצה',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(chatBackInput);

      // Verify ChatBack output
      assert.ok(output.message);
      assert.ok(output.message.length > 0);
      assert.strictEqual(output.mode, 'RECOVERY');
      assert.ok(output.actions.length > 0);
      
      // Verify message doesn't contain forbidden phrases
      assert.ok(!output.message.toLowerCase().includes('no results'));
      assert.ok(!output.message.includes('לא נמצאו תוצאות'));
    });

    it('should handle missing location scenario', async () => {
      // Step 1: RSE analyzes results
      const intent = createMockIntent({ location: undefined, language: 'en' });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze([], intent, filterResult, 0.8);

      // Verify RSE output
      assert.strictEqual(plan.scenario, 'missing_location');
      assert.ok(plan.suggestedActions.length > 0);
      assert.ok(plan.suggestedActions.some(a => a.label.includes('tel aviv') || a.label.includes('תל אביב')));

      // Step 2: ChatBack generates message
      const chatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(chatBackInput);

      // Verify ChatBack output
      assert.ok(output.message);
      assert.ok(output.actions.length > 0);
      // Should ask about location
      assert.ok(output.message.toLowerCase().includes('where') || output.message.includes('איפה'));
    });

    it('should handle good results (exact_match)', async () => {
      // Step 1: RSE analyzes results
      const results = createMockResults(10);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.9);

      // Verify RSE output
      assert.strictEqual(plan.scenario, 'exact_match');
      assert.strictEqual(plan.constraints.mustMentionCount, false);
      assert.strictEqual(plan.constraints.mustSuggestAction, false);

      // Step 2: ChatBack generates message (if needed)
      const chatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(chatBackInput);

      // For exact match, message might be simple or absent
      assert.ok(output.message);
    });

    it('should handle repeat scenario with memory', async () => {
      // Step 1: RSE analyzes results
      const intent = createMockIntent({ language: 'he' });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze([], intent, filterResult, 0.8);

      // Step 2: ChatBack generates message with memory (2nd time)
      const chatBackInput = {
        userText: 'פיצה',
        intent,
        responsePlan: plan,
        memory: {
          turnIndex: 2,
          lastMessages: ['אין משהו כאן אבל יש אופציות'],
          scenarioCount: 2  // Seen this scenario twice
        }
      };

      const output = await chatBack.generate(chatBackInput);

      // Should generate a varied message
      assert.ok(output.message);
      assert.ok(output.message.length > 0);
      // Message should be different from previous
      assert.notStrictEqual(output.message, chatBackInput.memory.lastMessages[0]);
    });
  });

  describe('Behavior Contract Compliance', () => {
    it('should never return "no results" message', async () => {
      const scenarios = ['zero_nearby_exists', 'zero_different_city', 'constraint_too_strict'];

      for (const scenario of scenarios) {
        const intent = createMockIntent();
        const filterResult = createMockFilterResult([], []);

        const plan = rse.analyze([], intent, filterResult, 0.8);
        plan.scenario = scenario as any;

        const chatBackInput = {
          userText: 'pizza',
          intent,
          responsePlan: plan
        };

        const output = await chatBack.generate(chatBackInput);

        // Verify no forbidden phrases
        assert.ok(!output.message.toLowerCase().includes('no results'));
        assert.ok(!output.message.toLowerCase().includes('nothing found'));
        assert.ok(!output.message.includes('לא נמצאו תוצאות'));
        assert.ok(!output.message.includes('אין תוצאות'));
      }
    });

    it('should always provide actionable next step', async () => {
      const scenarios = ['zero_nearby_exists', 'missing_location', 'low_confidence'];

      for (const scenario of scenarios) {
        const intent = createMockIntent();
        const filterResult = createMockFilterResult([], []);

        const plan = rse.analyze([], intent, filterResult, 0.7);
        plan.scenario = scenario as any;

        const chatBackInput = {
          userText: 'pizza',
          intent,
          responsePlan: plan
        };

        const output = await chatBack.generate(chatBackInput);

        // Must have at least one suggested action
        assert.ok(output.actions.length > 0);
      }
    });

    it('should respect language in responses', async () => {
      // Test Hebrew
      const heIntent = createMockIntent({ language: 'he' });
      const heFilterResult = createMockFilterResult([], []);
      const hePlan = rse.analyze([], heIntent, heFilterResult, 0.8);
      hePlan.scenario = 'missing_location';

      const heOutput = await chatBack.generate({
        userText: 'פיצה',
        intent: heIntent,
        responsePlan: hePlan
      });

      // Hebrew response should contain Hebrew characters
      assert.ok(/[\u0590-\u05FF]/.test(heOutput.message));

      // Test English
      const enIntent = createMockIntent({ language: 'en' });
      const enFilterResult = createMockFilterResult([], []);
      const enPlan = rse.analyze([], enIntent, enFilterResult, 0.8);
      enPlan.scenario = 'missing_location';

      const enOutput = await chatBack.generate({
        userText: 'pizza',
        intent: enIntent,
        responsePlan: enPlan
      });

      // English response should not contain Hebrew
      assert.ok(!/[\u0590-\u05FF]/.test(enOutput.message));
    });
  });
});








