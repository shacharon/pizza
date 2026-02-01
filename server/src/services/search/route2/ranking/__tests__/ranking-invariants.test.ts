/**
 * Ranking Invariants Tests (Policy B)
 * 
 * Tests that enforce: "missing intent => no scoring component"
 * 
 * Invariants:
 * 1) No cuisineKey => cuisineMatch weight = 0, cuisineMatchScore = 0
 * 2) No userLocation => distance weight = 0, distanceScore = 0
 * 3) No openNowRequested => openBoost weight = 0, openBoostScore = 0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankResults, computeScoreBreakdown } from '../results-ranker.js';
import type { RankingWeights } from '../ranking-profile.schema.js';

describe('Ranking Invariants - Policy B', () => {
  // Sample restaurant result
  const sampleResult = {
    placeId: 'test-place-1',
    rating: 4.5,
    userRatingsTotal: 500,
    location: { lat: 32.0853, lng: 34.7818 },
    openNow: true,
    cuisineScore: 0.8
  };

  const userLocation = { lat: 32.0853, lng: 34.7818 };

  describe('Invariant 1: No cuisineKey => cuisineMatch weight = 0', () => {
    it('should force cuisineMatch weight to 0 when cuisineKey is null', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15 // Original weight
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation,
        null, // cuisineKey = null
        true
      );

      // Invariant: cuisineMatch weight should be forced to 0
      assert.strictEqual(breakdown.weights.cuisineMatch, 0, 'cuisineMatch weight must be 0 when cuisineKey is null');
      assert.strictEqual(breakdown.components.cuisineMatchScore, 0, 'cuisineMatchScore must be 0 when cuisineKey is null');
    });

    it('should force cuisineMatch weight to 0 when result has no cuisineScore', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const resultWithoutCuisineScore = {
        ...sampleResult,
        cuisineScore: undefined // No cuisine score
      };

      const breakdown = computeScoreBreakdown(
        resultWithoutCuisineScore,
        weights,
        userLocation,
        'italian', // cuisineKey present but no score
        true
      );

      // Invariant: cuisineMatch weight should be forced to 0 when no cuisineScore
      assert.strictEqual(breakdown.weights.cuisineMatch, 0, 'cuisineMatch weight must be 0 when cuisineScore is missing');
      assert.strictEqual(breakdown.components.cuisineMatchScore, 0, 'cuisineMatchScore must be 0 when cuisineScore is missing');
    });

    it('should preserve cuisineMatch weight when cuisineKey is present', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation,
        'italian', // cuisineKey present
        true
      );

      // cuisineMatch weight should be preserved
      assert.strictEqual(breakdown.weights.cuisineMatch, 0.15, 'cuisineMatch weight should be preserved when cuisineKey is present');
      assert.ok(breakdown.components.cuisineMatchScore > 0, 'cuisineMatchScore should be non-zero when cuisineKey is present');
    });

    it('should force cuisineNorm to 0 when cuisineKey is null (even with cuisineScore)', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const resultWithCuisineScore = {
        ...sampleResult,
        cuisineScore: 0.9 // High cuisine score
      };

      const breakdown = computeScoreBreakdown(
        resultWithCuisineScore,
        weights,
        userLocation,
        null, // cuisineKey = null
        true
      );

      // Even with cuisineScore=0.9, cuisineMatchScore must be 0 because cuisineKey is null
      assert.strictEqual(breakdown.components.cuisineMatchScore, 0, 'cuisineMatchScore must be 0 when cuisineKey is null, regardless of cuisineScore');
    });
  });

  describe('Invariant 2: No userLocation => distance weight = 0', () => {
    it('should force distance weight to 0 when userLocation is null', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30, // Original weight
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        null, // userLocation = null
        'italian',
        true
      );

      // Invariant: distance weight should be forced to 0
      assert.strictEqual(breakdown.weights.distance, 0, 'distance weight must be 0 when userLocation is null');
      assert.strictEqual(breakdown.components.distanceScore, 0, 'distanceScore must be 0 when userLocation is null');
      assert.strictEqual(breakdown.distanceMeters, null, 'distanceMeters must be null when userLocation is null');
    });

    it('should preserve distance weight when userLocation is present', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation, // userLocation present
        'italian',
        true
      );

      // distance weight should be preserved
      assert.strictEqual(breakdown.weights.distance, 0.30, 'distance weight should be preserved when userLocation is present');
      assert.ok(breakdown.components.distanceScore >= 0, 'distanceScore should be >= 0 when userLocation is present');
    });
  });

  describe('Invariant 3: No openNowRequested => openBoost weight = 0', () => {
    it('should force openBoost weight to 0 when openNowRequested is false', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10, // Original weight
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation,
        'italian',
        false // openNowRequested = false
      );

      // Invariant: openBoost weight should be forced to 0
      assert.strictEqual(breakdown.weights.openBoost, 0, 'openBoost weight must be 0 when openNowRequested is false');
      assert.strictEqual(breakdown.components.openBoostScore, 0, 'openBoostScore must be 0 when openNowRequested is false');
    });

    it('should force openBoost weight to 0 when openNowRequested is null', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation,
        'italian',
        null // openNowRequested = null
      );

      // Invariant: openBoost weight should be forced to 0
      assert.strictEqual(breakdown.weights.openBoost, 0, 'openBoost weight must be 0 when openNowRequested is null');
      assert.strictEqual(breakdown.components.openBoostScore, 0, 'openBoostScore must be 0 when openNowRequested is null');
    });

    it('should preserve openBoost weight when openNowRequested is true', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation,
        'italian',
        true // openNowRequested = true
      );

      // openBoost weight should be preserved
      assert.strictEqual(breakdown.weights.openBoost, 0.10, 'openBoost weight should be preserved when openNowRequested is true');
      assert.ok(breakdown.components.openBoostScore > 0, 'openBoostScore should be > 0 when openNowRequested is true and openNow is true');
    });
  });

  describe('Combined invariants', () => {
    it('should enforce all invariants when all intents are missing', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        null, // No user location
        null, // No cuisineKey
        false // No openNowRequested
      );

      // All invariants should be enforced
      assert.strictEqual(breakdown.weights.distance, 0, 'distance weight must be 0');
      assert.strictEqual(breakdown.weights.cuisineMatch, 0, 'cuisineMatch weight must be 0');
      assert.strictEqual(breakdown.weights.openBoost, 0, 'openBoost weight must be 0');

      assert.strictEqual(breakdown.components.distanceScore, 0, 'distanceScore must be 0');
      assert.strictEqual(breakdown.components.cuisineMatchScore, 0, 'cuisineMatchScore must be 0');
      assert.strictEqual(breakdown.components.openBoostScore, 0, 'openBoostScore must be 0');

      // Only rating and reviews should contribute
      const expectedTotal = breakdown.components.ratingScore + breakdown.components.reviewsScore;
      assert.strictEqual(breakdown.totalScore, expectedTotal, 'totalScore should only include rating and reviews');
    });

    it('should preserve all weights when all intents are present', () => {
      const weights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const breakdown = computeScoreBreakdown(
        sampleResult,
        weights,
        userLocation, // User location present
        'italian', // cuisineKey present
        true // openNowRequested = true
      );

      // All weights should be preserved
      assert.strictEqual(breakdown.weights.distance, 0.30, 'distance weight should be preserved');
      assert.strictEqual(breakdown.weights.cuisineMatch, 0.15, 'cuisineMatch weight should be preserved');
      assert.strictEqual(breakdown.weights.openBoost, 0.10, 'openBoost weight should be preserved');

      // All components should contribute
      assert.ok(breakdown.components.distanceScore >= 0, 'distanceScore should be >= 0');
      assert.ok(breakdown.components.cuisineMatchScore > 0, 'cuisineMatchScore should be > 0');
      assert.ok(breakdown.components.openBoostScore > 0, 'openBoostScore should be > 0');
    });
  });

  describe('rankResults integration', () => {
    it('should apply invariants when ranking results', () => {
      const results = [
        { ...sampleResult, placeId: 'place-1', rating: 4.0, cuisineScore: 0.9 },
        { ...sampleResult, placeId: 'place-2', rating: 4.5, cuisineScore: 0.8 },
        { ...sampleResult, placeId: 'place-3', rating: 4.2, cuisineScore: 0.95 }
      ];

      const weights: RankingWeights = {
        rating: 0.40,
        reviews: 0.35,
        distance: 0.00,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const rankedResults = rankResults(results, {
        weights,
        userLocation: null, // No user location
        cuisineKey: null, // No cuisineKey
        openNowRequested: true
      });

      // Verify ranking was applied and invariants were enforced
      assert.strictEqual(rankedResults.length, 3, 'All results should be present');
      
      // With no cuisineKey and no userLocation, only rating, reviews, and openBoost should affect ranking
      // place-2 should be first (highest rating 4.5)
      assert.strictEqual(rankedResults[0].placeId, 'place-2', 'Highest rating should be first when distance and cuisine are disabled');
    });
  });
});
