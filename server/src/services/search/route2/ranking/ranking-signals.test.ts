/**
 * Ranking Signals Tests
 * Tests deterministic threshold logic and dominant factor detection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildRankingSignals, type RankingSignalsInput } from './ranking-signals.js';
import type { RankingWeights } from './ranking-profile.schema.js';

describe('buildRankingSignals', () => {
  it('should detect low results when afterFilters <= 10', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 10,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 10, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.lowResults, true);
  });

  it('should not detect low results when afterFilters > 10', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 11,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 11, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.lowResults, false);
  });

  it('should detect relaxUsed when priceIntent relaxed', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: { priceIntent: true },
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.relaxUsed, true);
  });

  it('should detect relaxUsed when minRating relaxed', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: { minRating: true },
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.relaxUsed, true);
  });

  it('should detect relaxUsed when both relaxed', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: { priceIntent: true, minRating: true },
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.relaxUsed, true);
  });

  it('should not detect relaxUsed when nothing relaxed', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.relaxUsed, false);
  });

  it('should detect manyOpenUnknown when >= 40% unknown', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 20,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 8, knownOpenCount: 10, knownClosedCount: 2 }
    };

    const signals = buildRankingSignals(input);

    // 8 / 20 = 0.4 (exactly 40%)
    assert.strictEqual(signals.triggers.manyOpenUnknown, true);
  });

  it('should not detect manyOpenUnknown when < 40% unknown', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 20,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 7, knownOpenCount: 11, knownClosedCount: 2 }
    };

    const signals = buildRankingSignals(input);

    // 7 / 20 = 0.35 (< 40%)
    assert.strictEqual(signals.triggers.manyOpenUnknown, false);
  });

  it('should handle zero results for manyOpenUnknown', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 0,
      resultsAfterFilters: 0,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 0, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.manyOpenUnknown, false);
  });

  it('should detect dominatedByOneFactor when weight >= 0.55', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'QUALITY',
      weights: { rating: 0.55, reviews: 0.25, distance: 0.1, openBoost: 0.1 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.dominatedByOneFactor, true);
  });

  it('should not detect dominatedByOneFactor when max weight < 0.55', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.3, reviews: 0.3, distance: 0.3, openBoost: 0.1 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.triggers.dominatedByOneFactor, false);
  });

  it('should derive dominantFactor DISTANCE when distance weight is highest', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'NEARBY',
      weights: { rating: 0.1, reviews: 0.1, distance: 0.6, openBoost: 0.2 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.dominantFactor, 'DISTANCE');
  });

  it('should derive dominantFactor RATING when rating weight is highest', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'QUALITY',
      weights: { rating: 0.6, reviews: 0.2, distance: 0.1, openBoost: 0.1 },
      hasUserLocation: false,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.dominantFactor, 'RATING');
  });

  it('should derive dominantFactor REVIEWS when reviews weight is highest', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'QUALITY',
      weights: { rating: 0.2, reviews: 0.6, distance: 0.1, openBoost: 0.1 },
      hasUserLocation: false,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.dominantFactor, 'REVIEWS');
  });

  it('should derive dominantFactor OPEN when openBoost weight is highest', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'OPEN_FOCUS',
      weights: { rating: 0.2, reviews: 0.2, distance: 0.1, openBoost: 0.5 },
      hasUserLocation: false,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    // 0.5 < 0.55, so should be NONE
    assert.strictEqual(signals.dominantFactor, 'NONE');
  });

  it('should derive dominantFactor OPEN when openBoost >= 0.55', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'OPEN_FOCUS',
      weights: { rating: 0.15, reviews: 0.15, distance: 0.15, openBoost: 0.55 },
      hasUserLocation: false,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.dominantFactor, 'OPEN');
  });

  it('should derive dominantFactor NONE when weights are balanced', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: true,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.dominantFactor, 'NONE');
  });

  it('should derive dominantFactor NONE when max weight < 0.55', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'QUALITY',
      weights: { rating: 0.5, reviews: 0.3, distance: 0.1, openBoost: 0.1 },
      hasUserLocation: false,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    // 0.5 < 0.55
    assert.strictEqual(signals.dominantFactor, 'NONE');
  });

  it('should populate facts correctly', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'NEARBY',
      weights: { rating: 0.2, reviews: 0.2, distance: 0.4, openBoost: 0.2 },
      hasUserLocation: true,
      resultsBeforeFilters: 50,
      resultsAfterFilters: 20,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 5, knownOpenCount: 10, knownClosedCount: 5 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.facts.shownNow, 20);
    assert.strictEqual(signals.facts.totalPool, 50);
    assert.strictEqual(signals.facts.hasUserLocation, true);
  });

  it('should preserve profile in signals', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'QUALITY',
      weights: { rating: 0.5, reviews: 0.3, distance: 0.1, openBoost: 0.1 },
      hasUserLocation: false,
      resultsBeforeFilters: 30,
      resultsAfterFilters: 15,
      relaxApplied: {},
      openUnknownStats: { unknownCount: 0, knownOpenCount: 15, knownClosedCount: 0 }
    };

    const signals = buildRankingSignals(input);

    assert.strictEqual(signals.profile, 'QUALITY');
  });

  it('should handle multiple triggers simultaneously', () => {
    const input: RankingSignalsInput = {
      query: 'test',
      profile: 'NEARBY',
      weights: { rating: 0.1, reviews: 0.1, distance: 0.7, openBoost: 0.1 },
      hasUserLocation: true,
      resultsBeforeFilters: 50,
      resultsAfterFilters: 8,
      relaxApplied: { priceIntent: true, minRating: true },
      openUnknownStats: { unknownCount: 5, knownOpenCount: 2, knownClosedCount: 1 }
    };

    const signals = buildRankingSignals(input);

    // All triggers should fire
    assert.strictEqual(signals.triggers.lowResults, true); // 8 <= 10
    assert.strictEqual(signals.triggers.relaxUsed, true); // both relaxed
    assert.strictEqual(signals.triggers.manyOpenUnknown, true); // 5/8 = 0.625 >= 0.4
    assert.strictEqual(signals.triggers.dominatedByOneFactor, true); // 0.7 >= 0.55
    assert.strictEqual(signals.dominantFactor, 'DISTANCE');
  });
});
