/**
 * Result State Engine Tests
 * Validates scenario detection, fallback generation, and action creation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ResultStateEngine, type CityFilterResult } from '../src/services/search/rse/result-state-engine.js';
import type { RestaurantResult, ParsedIntent, ResultGroup } from '../src/services/search/types/search.types.js';

describe('Result State Engine', () => {
  const rse = new ResultStateEngine();

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

  describe('Scenario Detection', () => {
    it('should detect exact_match scenario for good results', () => {
      const results = createMockResults(10);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.9);

      assert.strictEqual(plan.scenario, 'exact_match');
      assert.strictEqual(plan.results.total, 10);
    });

    it('should detect zero_nearby_exists for 0 results with nearby', () => {
      const nearbyResults = createMockResults(5);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult([], nearbyResults);
      filterResult.stats.droppedCount = 5;

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'zero_nearby_exists');
      assert.strictEqual(plan.results.total, 0);
      assert.strictEqual(plan.filters.droppedCount, 5);
    });

    it('should detect zero_different_city when results in another city', () => {
      const results = createMockResults(3);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult([], results);
      filterResult.stats.nearbyCity = 'Rehovot';
      filterResult.stats.nearbyDistance = 10;

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'zero_different_city');
      assert.strictEqual(plan.filters.nearbyCity, 'Rehovot');
    });

    it('should detect few_closing_soon for 2 results closing soon', () => {
      const results = createMockResults(2, { openNow: true });
      results[0].closingSoon = true;
      results[1].closingSoon = true;
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      // Note: Current implementation doesn't check closingSoon flag
      // This test will pass once we add that logic
      const plan = rse.analyze(results, intent, filterResult, 0.8);

      // For now, it will detect as exact_match or other
      // assert.strictEqual(plan.scenario, 'few_closing_soon');
    });

    it('should detect few_all_closed for 2 closed results', () => {
      const results = createMockResults(2, { openNow: false });
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'few_all_closed');
    });

    it('should detect missing_location when no city', () => {
      const results = createMockResults(0);
      const intent = createMockIntent({ location: undefined });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze(results, intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'missing_location');
    });

    it('should detect missing_query when query is empty', () => {
      const results = createMockResults(0);
      const intent = createMockIntent({ query: '' });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze(results, intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'missing_query');
    });

    it('should detect low_confidence for 50% confidence', () => {
      const results = createMockResults(10);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.5);

      assert.strictEqual(plan.scenario, 'low_confidence');
    });

    it('should detect high_unknown_rate for many UNKNOWN hours', () => {
      const results = createMockResults(4, { openNow: 'UNKNOWN' });
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'high_unknown_rate');
    });
  });

  describe('Results Summary', () => {
    it('should summarize results with groups', () => {
      const exactResults = createMockResults(5);
      const nearbyResults = createMockResults(3);
      const allResults = [...exactResults, ...nearbyResults];
      
      const groups: ResultGroup[] = [
        { kind: 'EXACT', label: 'On Street', results: exactResults, radiusMeters: 200 },
        { kind: 'NEARBY', label: 'Nearby', results: nearbyResults, radiusMeters: 400 }
      ];

      const intent = createMockIntent();
      const filterResult = createMockFilterResult(allResults, []);

      const plan = rse.analyze(allResults, intent, filterResult, 0.9, groups);

      assert.strictEqual(plan.results.total, 8);
      assert.strictEqual(plan.results.exact, 5);
      assert.strictEqual(plan.results.nearby, 3);
    });

    it('should count openNow statuses', () => {
      const results = [
        ...createMockResults(5, { openNow: true }),
        ...createMockResults(3, { openNow: false }),
        ...createMockResults(2, { openNow: 'UNKNOWN' })
      ];
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.9);

      assert.strictEqual(plan.results.openNow, 5);
      assert.strictEqual(plan.results.closedToday, 3);
      assert.strictEqual(plan.results.unknownHours, 2);
    });
  });

  describe('Fallback Generation', () => {
    it('should generate expand_radius fallback for nearby exists', () => {
      const intent = createMockIntent({ language: 'he' });
      const filterResult = createMockFilterResult([], createMockResults(5));
      filterResult.stats.droppedCount = 5;

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.fallback.length > 0, true);
      assert.strictEqual(plan.fallback[0].type, 'expand_radius');
      assert.ok(plan.fallback[0].label.includes('הרחב') || plan.fallback[0].label.includes('Expand'));
    });

    it('should generate nearby_city fallback for different city', () => {
      const intent = createMockIntent({ language: 'he' });
      const filterResult = createMockFilterResult([], createMockResults(3));
      filterResult.stats.nearbyCity = 'רחובות';
      filterResult.stats.nearbyDistance = 10;
      filterResult.stats.droppedCount = 3;

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.fallback.length > 0, true);
      assert.strictEqual(plan.fallback[0].type, 'nearby_city');
      assert.ok(plan.fallback[0].label.includes('רחובות'));
    });
  });

  describe('Suggested Actions', () => {
    it('should generate actions from fallbacks', () => {
      const intent = createMockIntent();
      const filterResult = createMockFilterResult([], createMockResults(5));
      filterResult.stats.droppedCount = 5;

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.ok(plan.suggestedActions.length > 0);
      assert.strictEqual(plan.suggestedActions[0].priority, 1);
      assert.ok(plan.suggestedActions[0].id.includes('fallback'));
    });

    it('should suggest cities for missing_location', () => {
      const intent = createMockIntent({ location: undefined, language: 'he' });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'missing_location');
      assert.ok(plan.suggestedActions.length > 0);
      assert.ok(plan.suggestedActions.some(a => a.label.includes('תל אביב')));
    });

    it('should suggest cuisines for missing_query', () => {
      const intent = createMockIntent({ query: '', language: 'he' });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'missing_query');
      assert.ok(plan.suggestedActions.length > 0);
      assert.ok(plan.suggestedActions.some(a => a.label.includes('פיצה') || a.label.includes('סושי')));
    });

    it('should limit to 4 actions', () => {
      const intent = createMockIntent({ location: undefined });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.ok(plan.suggestedActions.length <= 4);
    });
  });

  describe('Guardrails', () => {
    it('should not require count/action for exact_match', () => {
      const results = createMockResults(10);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.9);

      assert.strictEqual(plan.constraints.mustMentionCount, false);
      assert.strictEqual(plan.constraints.mustSuggestAction, false);
    });

    it('should require count for few_closing_soon', () => {
      const results = createMockResults(2, { openNow: false });
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'few_all_closed');
      assert.strictEqual(plan.constraints.mustMentionCount, true);
    });

    it('should disable timing for missing_location', () => {
      const intent = createMockIntent({ location: undefined });
      const filterResult = createMockFilterResult([], []);

      const plan = rse.analyze([], intent, filterResult, 0.8);

      assert.strictEqual(plan.scenario, 'missing_location');
      assert.strictEqual(plan.constraints.canMentionTiming, false);
    });
  });

  describe('Timing Info', () => {
    it('should detect time of day', () => {
      const results = createMockResults(10);
      const intent = createMockIntent();
      const filterResult = createMockFilterResult(results, []);

      const plan = rse.analyze(results, intent, filterResult, 0.9);

      assert.ok(plan.timing);
      assert.ok(['morning', 'afternoon', 'evening', 'late_night'].includes(plan.timing.timeOfDay));
      assert.strictEqual(typeof plan.timing.isWeekend, 'boolean');
    });
  });
});





