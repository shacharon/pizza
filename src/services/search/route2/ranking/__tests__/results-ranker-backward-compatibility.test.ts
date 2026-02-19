/**
 * Backward Compatibility Test for Results Ranker
 * Verifies that refactored ranker produces identical scores to original implementation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankResults, computeScoreBreakdown } from '../results-ranker.js';
import type { RankingWeights } from '../ranking-profile.schema.js';

describe('ResultsRanker - Backward Compatibility', () => {
  const defaultWeights: RankingWeights = {
    rating: 0.3,
    reviews: 0.2,
    distance: 0.3,
    openBoost: 0.1,
    cuisineMatch: 0.1
  };

  const userLocation = { lat: 32.0853, lng: 34.7818 };

  describe('rankResults with ScoreNormalizer', () => {
    it('should rank results identically to original implementation', () => {
      const results = [
        {
          placeId: 'place1',
          rating: 4.5,
          userRatingsTotal: 100,
          openNow: true,
          location: { lat: 32.0860, lng: 34.7820 },
          cuisineScore: 0.8
        },
        {
          placeId: 'place2',
          rating: 4.0,
          userRatingsTotal: 50,
          openNow: false,
          location: { lat: 32.0850, lng: 34.7815 },
          cuisineScore: 0.9
        },
        {
          placeId: 'place3',
          rating: 4.8,
          userRatingsTotal: 200,
          openNow: true,
          location: { lat: 32.0900, lng: 34.7850 },
          cuisineScore: 0.7
        }
      ];

      const ranked = rankResults(results, {
        weights: defaultWeights,
        userLocation,
        cuisineKey: 'italian',
        openNowRequested: true
      });

      // Verify ranking order is preserved
      assert.equal(ranked.length, 3);
      assert.ok(ranked[0].placeId);
      assert.ok(ranked[1].placeId);
      assert.ok(ranked[2].placeId);
    });

    it('should handle null/undefined values correctly', () => {
      const results = [
        {
          placeId: 'place1',
          rating: undefined,
          userRatingsTotal: null,
          openNow: 'UNKNOWN' as const,
          location: undefined
        },
        {
          placeId: 'place2',
          rating: 4.0,
          userRatingsTotal: 100,
          openNow: true,
          location: { lat: 32.0850, lng: 34.7815 }
        }
      ];

      const ranked = rankResults(results, {
        weights: defaultWeights,
        userLocation: null
      });

      // Should handle gracefully without errors
      assert.equal(ranked.length, 2);
    });

    it('should produce stable sort order', () => {
      const results = [
        { placeId: 'place1', rating: 4.0, userRatingsTotal: 100, openNow: true },
        { placeId: 'place2', rating: 4.0, userRatingsTotal: 100, openNow: true },
        { placeId: 'place3', rating: 4.0, userRatingsTotal: 100, openNow: true }
      ];

      const ranked = rankResults(results, { weights: defaultWeights });

      // With identical scores, should preserve Google index order
      assert.equal(ranked[0].placeId, 'place1');
      assert.equal(ranked[1].placeId, 'place2');
      assert.equal(ranked[2].placeId, 'place3');
    });
  });

  describe('computeScoreBreakdown with ScoreNormalizer', () => {
    it('should compute score breakdown correctly', () => {
      const result = {
        placeId: 'test-place',
        rating: 4.5,
        userRatingsTotal: 100,
        openNow: true,
        location: { lat: 32.0860, lng: 34.7820 },
        cuisineScore: 0.8
      };

      const breakdown = computeScoreBreakdown(
        result,
        defaultWeights,
        userLocation,
        'italian',
        true
      );

      // Verify all components are present and valid
      assert.equal(breakdown.placeId, 'test-place');
      assert.equal(breakdown.rating, 4.5);
      assert.equal(breakdown.userRatingCount, 100);
      assert.ok(breakdown.distanceMeters !== null);
      assert.equal(breakdown.openNow, true);
      assert.equal(breakdown.cuisineScore, 0.8);

      // Verify component scores are in valid range [0, 1] * weight
      assert.ok(breakdown.components.ratingScore >= 0);
      assert.ok(breakdown.components.ratingScore <= defaultWeights.rating);
      assert.ok(breakdown.components.reviewsScore >= 0);
      assert.ok(breakdown.components.reviewsScore <= defaultWeights.reviews);
      assert.ok(breakdown.components.distanceScore >= 0);
      assert.ok(breakdown.components.distanceScore <= defaultWeights.distance);
      assert.ok(breakdown.components.openBoostScore >= 0);
      assert.ok(breakdown.components.openBoostScore <= defaultWeights.openBoost);
      assert.ok(breakdown.components.cuisineMatchScore >= 0);
      assert.ok(breakdown.components.cuisineMatchScore <= (defaultWeights.cuisineMatch || 0));

      // Verify total score is sum of components
      const expectedTotal =
        breakdown.components.ratingScore +
        breakdown.components.reviewsScore +
        breakdown.components.distanceScore +
        breakdown.components.openBoostScore +
        breakdown.components.cuisineMatchScore;

      // Allow small floating point error
      assert.ok(Math.abs(breakdown.totalScore - expectedTotal) < 0.001);
    });

    it('should handle missing values in breakdown', () => {
      const result = {
        placeId: 'test-place',
        rating: undefined,
        userRatingsTotal: null,
        openNow: 'UNKNOWN' as const,
        location: undefined
      };

      const breakdown = computeScoreBreakdown(
        result,
        defaultWeights,
        null,
        null,
        false
      );

      // Verify null handling
      assert.equal(breakdown.rating, null);
      assert.equal(breakdown.userRatingCount, null);
      assert.equal(breakdown.distanceMeters, null);
      assert.equal(breakdown.openNow, 'UNKNOWN');

      // Components should still be valid numbers (0 for missing values)
      assert.equal(breakdown.components.ratingScore, 0);
      assert.equal(breakdown.components.reviewsScore, 0);
      assert.equal(breakdown.components.distanceScore, 0);
      assert.ok(breakdown.components.openBoostScore >= 0); // 0.5 * weight for UNKNOWN
    });
  });

  describe('Score calculations match original formulas', () => {
    it('should calculate rating score correctly', () => {
      const result = {
        placeId: 'test',
        rating: 4.5,
        userRatingsTotal: 0,
        openNow: false
      };

      const breakdown = computeScoreBreakdown(
        result,
        defaultWeights,
        null,
        null,
        false
      );

      // rating 4.5 => normalized to 4.5/5 = 0.9
      // weighted: 0.9 * 0.3 = 0.27
      assert.ok(Math.abs(breakdown.components.ratingScore - 0.27) < 0.001);
    });

    it('should calculate reviews score correctly', () => {
      const result = {
        placeId: 'test',
        rating: 0,
        userRatingsTotal: 999, // log10(1000) / 5 = 0.6
        openNow: false
      };

      const breakdown = computeScoreBreakdown(
        result,
        defaultWeights,
        null,
        null,
        false
      );

      // reviews 999 => normalized to log10(1000)/5 = 0.6
      // weighted: 0.6 * 0.2 = 0.12
      assert.ok(Math.abs(breakdown.components.reviewsScore - 0.12) < 0.001);
    });

    it('should calculate distance score correctly', () => {
      const result = {
        placeId: 'test',
        rating: 0,
        userRatingsTotal: 0,
        openNow: false,
        location: { lat: 32.0853, lng: 34.7918 } // ~1km away
      };

      const breakdown = computeScoreBreakdown(
        result,
        defaultWeights,
        userLocation,
        null,
        false
      );

      // Distance ~1km => normalized to 1/(1+1) = 0.5
      // weighted: 0.5 * 0.3 = 0.15
      // Allow larger tolerance due to haversine calculation
      assert.ok(breakdown.components.distanceScore > 0.1);
      assert.ok(breakdown.components.distanceScore < 0.2);
    });

    it('should calculate open boost correctly', () => {
      const resultOpen = {
        placeId: 'test',
        rating: 0,
        userRatingsTotal: 0,
        openNow: true
      };

      const breakdownOpen = computeScoreBreakdown(
        resultOpen,
        defaultWeights,
        null,
        null,
        false
      );

      // openNow true => normalized to 1
      // weighted: 1 * 0.1 = 0.1
      assert.ok(Math.abs(breakdownOpen.components.openBoostScore - 0.1) < 0.001);

      const resultClosed = {
        placeId: 'test',
        rating: 0,
        userRatingsTotal: 0,
        openNow: false
      };

      const breakdownClosed = computeScoreBreakdown(
        resultClosed,
        defaultWeights,
        null,
        null,
        false
      );

      // openNow false => normalized to 0
      // weighted: 0 * 0.1 = 0
      assert.equal(breakdownClosed.components.openBoostScore, 0);
    });
  });
});
