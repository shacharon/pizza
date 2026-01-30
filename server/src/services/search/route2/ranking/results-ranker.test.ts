/**
 * Results Ranker Tests
 * Tests deterministic scoring and stable ordering
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { rankResults } from './results-ranker.js';
import type { RankingWeights } from './ranking-profile.schema.js';

describe('rankResults', () => {
  it('should preserve Google order when all scores are equal', () => {
    const results = [
      { id: 'a', rating: 4.0, userRatingsTotal: 100 },
      { id: 'b', rating: 4.0, userRatingsTotal: 100 },
      { id: 'c', rating: 4.0, userRatingsTotal: 100 }
    ];

    const weights: RankingWeights = {
      rating: 1,
      reviews: 0,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    // Order should be preserved (googleIndex tie-breaker)
    assert.strictEqual(ranked[0].id, 'a');
    assert.strictEqual(ranked[1].id, 'b');
    assert.strictEqual(ranked[2].id, 'c');
  });

  it('should rank by rating when rating weight is 1', () => {
    const results = [
      { id: 'low', rating: 3.5, userRatingsTotal: 100 },
      { id: 'high', rating: 4.8, userRatingsTotal: 100 },
      { id: 'mid', rating: 4.0, userRatingsTotal: 100 }
    ];

    const weights: RankingWeights = {
      rating: 1,
      reviews: 0,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    assert.strictEqual(ranked[0].id, 'high');
    assert.strictEqual(ranked[1].id, 'mid');
    assert.strictEqual(ranked[2].id, 'low');
  });

  it('should rank by review count when reviews weight is 1', () => {
    const results = [
      { id: 'few', rating: 4.5, userRatingsTotal: 10 },
      { id: 'many', rating: 4.5, userRatingsTotal: 1000 },
      { id: 'mid', rating: 4.5, userRatingsTotal: 100 }
    ];

    const weights: RankingWeights = {
      rating: 0,
      reviews: 1,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    assert.strictEqual(ranked[0].id, 'many');
    assert.strictEqual(ranked[1].id, 'mid');
    assert.strictEqual(ranked[2].id, 'few');
  });

  it('should rank by distance when user location provided', () => {
    const userLocation = { lat: 0, lng: 0 };

    const results = [
      { id: 'far', rating: 4.5, userRatingsTotal: 100, location: { lat: 10, lng: 10 } },
      { id: 'near', rating: 4.5, userRatingsTotal: 100, location: { lat: 0.01, lng: 0.01 } },
      { id: 'mid', rating: 4.5, userRatingsTotal: 100, location: { lat: 1, lng: 1 } }
    ];

    const weights: RankingWeights = {
      rating: 0,
      reviews: 0,
      distance: 1,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights, userLocation });

    assert.strictEqual(ranked[0].id, 'near');
    assert.strictEqual(ranked[1].id, 'mid');
    assert.strictEqual(ranked[2].id, 'far');
  });

  it('should ignore distance when no user location provided', () => {
    const results = [
      { id: 'a', rating: 4.0, userRatingsTotal: 100, location: { lat: 10, lng: 10 } },
      { id: 'b', rating: 4.5, userRatingsTotal: 100, location: { lat: 0, lng: 0 } }
    ];

    const weights: RankingWeights = {
      rating: 0.5,
      reviews: 0,
      distance: 0.5,
      openBoost: 0
    };

    // No user location - distance should be ignored
    const ranked = rankResults(results, { weights });

    // Should rank by rating only (b > a)
    assert.strictEqual(ranked[0].id, 'b');
    assert.strictEqual(ranked[1].id, 'a');
  });

  it('should boost open places when openBoost weight is set', () => {
    const results = [
      { id: 'closed', rating: 4.5, userRatingsTotal: 100, openNow: false },
      { id: 'open', rating: 4.5, userRatingsTotal: 100, openNow: true },
      { id: 'unknown', rating: 4.5, userRatingsTotal: 100, openNow: 'UNKNOWN' }
    ];

    const weights: RankingWeights = {
      rating: 0.5,
      reviews: 0,
      distance: 0,
      openBoost: 0.5
    };

    const ranked = rankResults(results, { weights });

    assert.strictEqual(ranked[0].id, 'open');
    assert.strictEqual(ranked[1].id, 'unknown');
    assert.strictEqual(ranked[2].id, 'closed');
  });

  it('should apply multi-factor ranking with balanced weights', () => {
    const userLocation = { lat: 0, lng: 0 };

    const results = [
      {
        id: 'perfect',
        rating: 5.0,
        userRatingsTotal: 1000,
        location: { lat: 0.01, lng: 0.01 },
        openNow: true
      },
      {
        id: 'good',
        rating: 4.0,
        userRatingsTotal: 500,
        location: { lat: 1, lng: 1 },
        openNow: true
      },
      {
        id: 'poor',
        rating: 3.0,
        userRatingsTotal: 50,
        location: { lat: 10, lng: 10 },
        openNow: false
      }
    ];

    const weights: RankingWeights = {
      rating: 0.25,
      reviews: 0.25,
      distance: 0.25,
      openBoost: 0.25
    };

    const ranked = rankResults(results, { weights, userLocation });

    assert.strictEqual(ranked[0].id, 'perfect');
    assert.strictEqual(ranked[1].id, 'good');
    assert.strictEqual(ranked[2].id, 'poor');
  });

  it('should apply rating tie-breaker when scores are equal', () => {
    const results = [
      { id: 'lower-rating', rating: 4.0, userRatingsTotal: 100 },
      { id: 'higher-rating', rating: 4.5, userRatingsTotal: 100 }
    ];

    const weights: RankingWeights = {
      rating: 0,
      reviews: 1,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    // Reviews are same, so rating tie-breaker should apply
    assert.strictEqual(ranked[0].id, 'higher-rating');
    assert.strictEqual(ranked[1].id, 'lower-rating');
  });

  it('should apply review count tie-breaker when scores and ratings are equal', () => {
    const results = [
      { id: 'fewer-reviews', rating: 4.5, userRatingsTotal: 50 },
      { id: 'more-reviews', rating: 4.5, userRatingsTotal: 200 }
    ];

    const weights: RankingWeights = {
      rating: 1,
      reviews: 0,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    // Ratings are same, so review count tie-breaker should apply
    assert.strictEqual(ranked[0].id, 'more-reviews');
    assert.strictEqual(ranked[1].id, 'fewer-reviews');
  });

  it('should apply googleIndex tie-breaker as final fallback', () => {
    const results = [
      { id: 'third', rating: 4.5, userRatingsTotal: 100 },
      { id: 'first', rating: 4.5, userRatingsTotal: 100 },
      { id: 'second', rating: 4.5, userRatingsTotal: 100 }
    ];

    const weights: RankingWeights = {
      rating: 1,
      reviews: 0,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    // All equal, should preserve Google order
    assert.strictEqual(ranked[0].id, 'third');
    assert.strictEqual(ranked[1].id, 'first');
    assert.strictEqual(ranked[2].id, 'second');
  });

  it('should handle missing optional fields gracefully', () => {
    const results = [
      { id: 'minimal', name: 'Test Restaurant' }, // No rating, reviews, location, openNow
      { id: 'complete', rating: 4.5, userRatingsTotal: 100, openNow: true }
    ];

    const weights: RankingWeights = {
      rating: 0.25,
      reviews: 0.25,
      distance: 0.25,
      openBoost: 0.25
    };

    const ranked = rankResults(results, { weights });

    // Should not crash, complete should rank higher
    assert.strictEqual(ranked.length, 2);
    assert.strictEqual(ranked[0].id, 'complete');
    assert.strictEqual(ranked[1].id, 'minimal');
  });

  it('should not mutate original results array', () => {
    const results = [
      { id: 'a', rating: 4.0 },
      { id: 'b', rating: 4.5 }
    ];

    const weights: RankingWeights = {
      rating: 1,
      reviews: 0,
      distance: 0,
      openBoost: 0
    };

    const ranked = rankResults(results, { weights });

    // Original array should be unchanged
    assert.strictEqual(results[0].id, 'a');
    assert.strictEqual(results[1].id, 'b');

    // Ranked should be different order
    assert.strictEqual(ranked[0].id, 'b');
    assert.strictEqual(ranked[1].id, 'a');

    // Should not have internal metadata
    assert.strictEqual((ranked[0] as any).__rankingScore, undefined);
    assert.strictEqual((ranked[0] as any).__googleIndex, undefined);
  });
});
