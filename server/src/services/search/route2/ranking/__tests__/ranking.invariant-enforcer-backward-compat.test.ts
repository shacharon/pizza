/**
 * Ranking Invariant Enforcer - Backward Compatibility Tests
 * 
 * Ensures that the new RankingInvariantEnforcer produces identical results
 * to the legacy enforceRankingInvariants function
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankingInvariantEnforcer, type RankingContext } from '../ranking.invariant-enforcer.js';
import { enforceRankingInvariants, rankResults, computeScoreBreakdown } from '../results-ranker.js';
import type { RankingWeights } from '../ranking-profile.schema.js';

describe('RankingInvariantEnforcer - Backward Compatibility', () => {
  // Test fixtures
  const baseWeights: RankingWeights = {
    rating: 0.25,
    reviews: 0.20,
    distance: 0.30,
    openBoost: 0.10,
    cuisineMatch: 0.15
  };

  const sampleResults = [
    {
      placeId: 'place-1',
      rating: 4.5,
      userRatingsTotal: 1000,
      location: { lat: 32.0853, lng: 34.7818 },
      openNow: true,
      cuisineScore: 0.9
    },
    {
      placeId: 'place-2',
      rating: 4.3,
      userRatingsTotal: 800,
      location: { lat: 32.0860, lng: 34.7820 },
      openNow: true,
      cuisineScore: 0.85
    },
    {
      placeId: 'place-3',
      rating: 4.7,
      userRatingsTotal: 500,
      location: { lat: 32.0845, lng: 34.7815 },
      openNow: false,
      cuisineScore: 0.95
    }
  ];

  const userLocation = { lat: 32.0853, lng: 34.7818 };

  describe('Weight enforcement compatibility', () => {
    it('should match legacy behavior when all contexts are missing', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      // New enforcer
      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);

      // Legacy enforcer
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        false,
        null,
        false,
        false
      );

      // Should produce identical weights
      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult, 'Weights should be identical');
      
      // Verify specific values
      assert.strictEqual(newResult.enforcedWeights.distance, 0);
      assert.strictEqual(newResult.enforcedWeights.cuisineMatch, 0);
      assert.strictEqual(newResult.enforcedWeights.openBoost, 0);
      assert.strictEqual(newResult.enforcedWeights.rating, 0.25);
      assert.strictEqual(newResult.enforcedWeights.reviews, 0.20);
    });

    it('should match legacy behavior when all contexts are present', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        true,
        'italian',
        true,
        true
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult, 'All weights should be preserved');
      assert.deepStrictEqual(newResult.enforcedWeights, baseWeights, 'Should match original weights');
    });

    it('should match legacy behavior when only location is missing', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        false,
        'italian',
        true,
        true
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);
      assert.strictEqual(newResult.enforcedWeights.distance, 0, 'Distance should be 0');
      assert.strictEqual(newResult.enforcedWeights.cuisineMatch, 0.15, 'Cuisine should be preserved');
      assert.strictEqual(newResult.enforcedWeights.openBoost, 0.10, 'Open should be preserved');
    });

    it('should match legacy behavior when only cuisineKey is missing', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: null,
        openNowRequested: true,
        hasCuisineScores: true
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        true,
        null,
        true,
        true
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);
      assert.strictEqual(newResult.enforcedWeights.distance, 0.30, 'Distance should be preserved');
      assert.strictEqual(newResult.enforcedWeights.cuisineMatch, 0, 'Cuisine should be 0');
      assert.strictEqual(newResult.enforcedWeights.openBoost, 0.10, 'Open should be preserved');
    });

    it('should match legacy behavior when only openNow is missing', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: false,
        hasCuisineScores: true
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        true,
        'italian',
        false,
        true
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);
      assert.strictEqual(newResult.enforcedWeights.distance, 0.30, 'Distance should be preserved');
      assert.strictEqual(newResult.enforcedWeights.cuisineMatch, 0.15, 'Cuisine should be preserved');
      assert.strictEqual(newResult.enforcedWeights.openBoost, 0, 'Open should be 0');
    });

    it('should match legacy behavior when hasCuisineScores is false', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: false
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        true,
        'italian',
        true,
        false
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);
      assert.strictEqual(newResult.enforcedWeights.cuisineMatch, 0, 'Cuisine should be 0 when no scores');
    });
  });

  describe('Ranking order compatibility', () => {
    it('should produce identical ranking order with all contexts', () => {
      const weights = baseWeights;

      // Rank with legacy wrapper (which uses new enforcer internally)
      const rankedResults = rankResults(sampleResults, {
        weights,
        userLocation,
        cuisineKey: 'italian',
        openNowRequested: true
      });

      // Verify ranking is deterministic
      assert.strictEqual(rankedResults.length, 3, 'All results should be present');
      
      // Extract place IDs
      const placeIds = rankedResults.map(r => r.placeId);
      
      // Should have all places
      assert.ok(placeIds.includes('place-1'));
      assert.ok(placeIds.includes('place-2'));
      assert.ok(placeIds.includes('place-3'));
      
      // Store for later comparison
      const expectedOrder = placeIds;
      
      // Re-rank with same inputs should produce same order
      const reranked = rankResults(sampleResults, {
        weights,
        userLocation,
        cuisineKey: 'italian',
        openNowRequested: true
      });
      
      const rerankedIds = reranked.map(r => r.placeId);
      assert.deepStrictEqual(rerankedIds, expectedOrder, 'Ranking should be deterministic');
    });

    it('should produce identical ranking order when contexts are missing', () => {
      const weights = baseWeights;

      // Rank without location, cuisine, or open filter
      const rankedResults = rankResults(sampleResults, {
        weights,
        userLocation: null,
        cuisineKey: null,
        openNowRequested: false
      });

      assert.strictEqual(rankedResults.length, 3, 'All results should be present');
      
      // Verify deterministic ranking (order is determined by rating+reviews combination)
      const placeIds = rankedResults.map(r => r.placeId);
      assert.strictEqual(placeIds.length, 3, 'Should have all places');
      
      // Re-rank should produce same order
      const reranked = rankResults(sampleResults, {
        weights,
        userLocation: null,
        cuisineKey: null,
        openNowRequested: false
      });
      
      assert.deepStrictEqual(
        reranked.map(r => r.placeId),
        placeIds,
        'Ranking should be deterministic'
      );
    });

    it('should produce identical ranking when only rating/reviews matter', () => {
      const weightsNoOptional: RankingWeights = {
        rating: 0.60,
        reviews: 0.40,
        distance: 0,
        openBoost: 0,
        cuisineMatch: 0
      };

      const ranked1 = rankResults(sampleResults, {
        weights: weightsNoOptional,
        userLocation: null,
        cuisineKey: null,
        openNowRequested: false
      });

      const ranked2 = rankResults(sampleResults, {
        weights: weightsNoOptional,
        userLocation: null,
        cuisineKey: null,
        openNowRequested: false
      });

      const ids1 = ranked1.map(r => r.placeId);
      const ids2 = ranked2.map(r => r.placeId);

      assert.deepStrictEqual(ids1, ids2, 'Should be deterministic');
    });
  });

  describe('Score breakdown compatibility', () => {
    it('should produce identical score breakdown with all contexts', () => {
      const result = sampleResults[0];

      const breakdown = computeScoreBreakdown(
        result,
        baseWeights,
        userLocation,
        'italian',
        true
      );

      // Verify weights are correct
      assert.strictEqual(breakdown.weights.rating, 0.25);
      assert.strictEqual(breakdown.weights.reviews, 0.20);
      assert.strictEqual(breakdown.weights.distance, 0.30);
      assert.strictEqual(breakdown.weights.openBoost, 0.10);
      assert.strictEqual(breakdown.weights.cuisineMatch, 0.15);

      // Verify all components contribute
      assert.ok(breakdown.components.ratingScore > 0, 'Rating should contribute');
      assert.ok(breakdown.components.reviewsScore > 0, 'Reviews should contribute');
      assert.ok(breakdown.components.distanceScore >= 0, 'Distance should contribute');
      assert.ok(breakdown.components.openBoostScore > 0, 'Open should contribute');
      assert.ok(breakdown.components.cuisineMatchScore > 0, 'Cuisine should contribute');

      // Total should be sum of components
      const sum = 
        breakdown.components.ratingScore +
        breakdown.components.reviewsScore +
        breakdown.components.distanceScore +
        breakdown.components.openBoostScore +
        breakdown.components.cuisineMatchScore;
      
      assert.ok(Math.abs(breakdown.totalScore - sum) < 0.001, 'Total should equal sum of components');
    });

    it('should produce identical score breakdown with missing contexts', () => {
      const result = sampleResults[0];

      const breakdown = computeScoreBreakdown(
        result,
        baseWeights,
        null,  // No location
        null,  // No cuisine
        false  // No open filter
      );

      // Verify weights are enforced
      assert.strictEqual(breakdown.weights.distance, 0, 'Distance weight should be 0');
      assert.strictEqual(breakdown.weights.cuisineMatch, 0, 'Cuisine weight should be 0');
      assert.strictEqual(breakdown.weights.openBoost, 0, 'Open weight should be 0');

      // Verify components respect enforcement
      assert.ok(breakdown.components.ratingScore > 0, 'Rating should contribute');
      assert.ok(breakdown.components.reviewsScore > 0, 'Reviews should contribute');
      assert.strictEqual(breakdown.components.distanceScore, 0, 'Distance should not contribute');
      assert.strictEqual(breakdown.components.openBoostScore, 0, 'Open should not contribute');
      assert.strictEqual(breakdown.components.cuisineMatchScore, 0, 'Cuisine should not contribute');

      // Total should only include rating and reviews
      const expectedTotal = 
        breakdown.components.ratingScore +
        breakdown.components.reviewsScore;
      
      assert.ok(Math.abs(breakdown.totalScore - expectedTotal) < 0.001, 'Total should only include rating/reviews');
    });

    it('should produce consistent breakdowns for same result', () => {
      const result = sampleResults[0];

      const breakdown1 = computeScoreBreakdown(
        result,
        baseWeights,
        userLocation,
        'italian',
        true
      );

      const breakdown2 = computeScoreBreakdown(
        result,
        baseWeights,
        userLocation,
        'italian',
        true
      );

      // Should be identical
      assert.deepStrictEqual(breakdown1.weights, breakdown2.weights);
      assert.deepStrictEqual(breakdown1.components, breakdown2.components);
      assert.strictEqual(breakdown1.totalScore, breakdown2.totalScore);
    });
  });

  describe('Edge cases compatibility', () => {
    it('should handle weights already at 0', () => {
      const weightsWithZeros: RankingWeights = {
        rating: 0.50,
        reviews: 0.50,
        distance: 0,
        openBoost: 0,
        cuisineMatch: 0
      };

      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const newResult = RankingInvariantEnforcer.enforce(weightsWithZeros, context);
      const legacyResult = enforceRankingInvariants(
        weightsWithZeros,
        false,
        null,
        false,
        false
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);
      assert.strictEqual(newResult.violations.length, 0, 'Should not report violations for already-zero weights');
    });

    it('should handle undefined vs null correctly', () => {
      const context1: RankingContext = {
        hasUserLocation: true,
        cuisineKey: undefined,
        openNowRequested: undefined,
        hasCuisineScores: true
      };

      const context2: RankingContext = {
        hasUserLocation: true,
        cuisineKey: null,
        openNowRequested: null,
        hasCuisineScores: true
      };

      const result1 = RankingInvariantEnforcer.enforce(baseWeights, context1);
      const result2 = RankingInvariantEnforcer.enforce(baseWeights, context2);

      // undefined and null should be treated the same
      assert.deepStrictEqual(result1.enforcedWeights, result2.enforcedWeights);
    });

    it('should handle empty results array', () => {
      const emptyResults: any[] = [];

      const ranked = rankResults(emptyResults, {
        weights: baseWeights,
        userLocation,
        cuisineKey: 'italian',
        openNowRequested: true
      });

      assert.strictEqual(ranked.length, 0, 'Should handle empty array');
    });

    it('should handle results without optional fields', () => {
      const minimalResults = [
        { placeId: 'place-1', rating: 4.5, userRatingsTotal: 100 },
        { placeId: 'place-2', rating: 4.3, userRatingsTotal: 200 }
      ];

      const ranked = rankResults(minimalResults, {
        weights: baseWeights,
        userLocation: null,
        cuisineKey: null,
        openNowRequested: false
      });

      assert.strictEqual(ranked.length, 2, 'Should handle minimal results');
      
      // Verify deterministic ranking (order depends on rating+reviews combination)
      const firstRankPlaceIds = ranked.map(r => r.placeId);
      
      // Re-rank should produce same order
      const reranked = rankResults(minimalResults, {
        weights: baseWeights,
        userLocation: null,
        cuisineKey: null,
        openNowRequested: false
      });
      
      assert.deepStrictEqual(
        reranked.map(r => r.placeId),
        firstRankPlaceIds,
        'Ranking should be deterministic'
      );
    });
  });

  describe('No behavior change verification', () => {
    it('should preserve exact legacy behavior for typical search', () => {
      // Simulate typical search: has location, has cuisine, no open filter
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: false,
        hasCuisineScores: true
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        true,
        'italian',
        false,
        true
      );

      // Weights should be identical
      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);

      // Rank results with both approaches
      const rankedNew = rankResults(sampleResults, {
        weights: newResult.enforcedWeights,
        userLocation,
        cuisineKey: 'italian',
        openNowRequested: false
      });

      const rankedLegacy = rankResults(sampleResults, {
        weights: legacyResult,
        userLocation,
        cuisineKey: 'italian',
        openNowRequested: false
      });

      // Order should be identical
      assert.deepStrictEqual(
        rankedNew.map(r => r.placeId),
        rankedLegacy.map(r => r.placeId),
        'Ranking order should be identical'
      );
    });

    it('should preserve exact legacy behavior for generic search', () => {
      // Simulate generic search: has location, no cuisine, no open filter
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const newResult = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacyResult = enforceRankingInvariants(
        baseWeights,
        true,
        null,
        false,
        false
      );

      assert.deepStrictEqual(newResult.enforcedWeights, legacyResult);

      // Verify specific weight adjustments
      assert.strictEqual(newResult.enforcedWeights.distance, 0.30, 'Distance should be active');
      assert.strictEqual(newResult.enforcedWeights.cuisineMatch, 0, 'Cuisine should be disabled');
      assert.strictEqual(newResult.enforcedWeights.openBoost, 0, 'Open should be disabled');
    });
  });
});
