/**
 * Ranking Invariant Enforcer Tests
 * 
 * Tests pure policy enforcement logic extracted from results-ranker
 * Each invariant is tested independently and in combination
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RankingInvariantEnforcer, type RankingContext } from '../ranking.invariant-enforcer.js';
import type { RankingWeights } from '../ranking-profile.schema.js';

describe('RankingInvariantEnforcer', () => {
  // Base weights for testing
  const baseWeights: RankingWeights = {
    rating: 0.25,
    reviews: 0.20,
    distance: 0.30,
    openBoost: 0.10,
    cuisineMatch: 0.15
  };

  describe('Invariant 1: No cuisineKey => cuisineMatch weight = 0', () => {
    it('should force cuisineMatch to 0 when cuisineKey is null', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: null,
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0, 'cuisineMatch must be 0');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].rule, 'NO_CUISINE_INTENT');
      assert.strictEqual(result.violations[0].component, 'cuisineMatch');
      assert.strictEqual(result.violations[0].originalWeight, 0.15);
      assert.strictEqual(result.violations[0].enforcedWeight, 0);
    });

    it('should force cuisineMatch to 0 when cuisineKey is undefined', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: undefined,
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0);
      assert.strictEqual(result.violations.length, 1);
      assert.strictEqual(result.violations[0].rule, 'NO_CUISINE_INTENT');
    });

    it('should force cuisineMatch to 0 when hasCuisineScores is false', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: false // No scores in results
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0);
      assert.strictEqual(result.violations.length, 1);
      assert.strictEqual(result.violations[0].rule, 'NO_CUISINE_SCORES');
      assert.strictEqual(result.violations[0].component, 'cuisineMatch');
    });

    it('should preserve cuisineMatch when both cuisineKey and scores are present', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0.15, 'Should preserve original weight');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should not enforce when cuisineMatch is already 0', () => {
      const weightsWithZero: RankingWeights = {
        ...baseWeights,
        cuisineMatch: 0
      };

      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: null,
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(weightsWithZero, context);

      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0);
      assert.strictEqual(result.violations.length, 0, 'Should not report violation if already 0');
    });
  });

  describe('Invariant 2: No userLocation => distance weight = 0', () => {
    it('should force distance to 0 when hasUserLocation is false', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.distance, 0, 'distance must be 0');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].rule, 'NO_USER_LOCATION');
      assert.strictEqual(result.violations[0].component, 'distance');
      assert.strictEqual(result.violations[0].originalWeight, 0.30);
      assert.strictEqual(result.violations[0].enforcedWeight, 0);
    });

    it('should preserve distance when hasUserLocation is true', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.distance, 0.30, 'Should preserve original weight');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should not enforce when distance is already 0', () => {
      const weightsWithZero: RankingWeights = {
        ...baseWeights,
        distance: 0
      };

      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(weightsWithZero, context);

      assert.strictEqual(result.enforcedWeights.distance, 0);
      assert.strictEqual(result.violations.length, 0, 'Should not report violation if already 0');
    });
  });

  describe('Invariant 3: No openNowRequested => openBoost weight = 0', () => {
    it('should force openBoost to 0 when openNowRequested is false', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: false,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.openBoost, 0, 'openBoost must be 0');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].rule, 'NO_OPEN_NOW_REQUESTED');
      assert.strictEqual(result.violations[0].component, 'openBoost');
      assert.strictEqual(result.violations[0].originalWeight, 0.10);
      assert.strictEqual(result.violations[0].enforcedWeight, 0);
    });

    it('should force openBoost to 0 when openNowRequested is null', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: null,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.openBoost, 0);
      assert.strictEqual(result.violations.length, 1);
      assert.strictEqual(result.violations[0].rule, 'NO_OPEN_NOW_REQUESTED');
    });

    it('should force openBoost to 0 when openNowRequested is undefined', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: undefined,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.openBoost, 0);
      assert.strictEqual(result.violations.length, 1);
    });

    it('should preserve openBoost when openNowRequested is true', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      assert.strictEqual(result.enforcedWeights.openBoost, 0.10, 'Should preserve original weight');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should not enforce when openBoost is already 0', () => {
      const weightsWithZero: RankingWeights = {
        ...baseWeights,
        openBoost: 0
      };

      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: false,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(weightsWithZero, context);

      assert.strictEqual(result.enforcedWeights.openBoost, 0);
      assert.strictEqual(result.violations.length, 0, 'Should not report violation if already 0');
    });
  });

  describe('Combined invariants', () => {
    it('should enforce all invariants when all contexts are missing', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      // All three weights should be forced to 0
      assert.strictEqual(result.enforcedWeights.distance, 0, 'distance must be 0');
      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0, 'cuisineMatch must be 0');
      assert.strictEqual(result.enforcedWeights.openBoost, 0, 'openBoost must be 0');

      // Should have 3 violations
      assert.strictEqual(result.violations.length, 3, 'Should have 3 violations');

      // Verify all violations are present
      const violationRules = result.violations.map(v => v.rule);
      assert.ok(violationRules.includes('NO_USER_LOCATION'));
      assert.ok(violationRules.includes('NO_CUISINE_INTENT'));
      assert.ok(violationRules.includes('NO_OPEN_NOW_REQUESTED'));

      // Rating and reviews should be unchanged
      assert.strictEqual(result.enforcedWeights.rating, 0.25, 'rating should be unchanged');
      assert.strictEqual(result.enforcedWeights.reviews, 0.20, 'reviews should be unchanged');
    });

    it('should preserve all weights when all contexts are present', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      // All weights should be preserved
      assert.deepStrictEqual(result.enforcedWeights, baseWeights, 'All weights should be unchanged');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should enforce subset of invariants when some contexts are missing', () => {
      const context: RankingContext = {
        hasUserLocation: true,  // Has location
        cuisineKey: null,       // No cuisine
        openNowRequested: false, // No open filter
        hasCuisineScores: false
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);

      // Only distance should be preserved
      assert.strictEqual(result.enforcedWeights.distance, 0.30, 'distance should be preserved');
      assert.strictEqual(result.enforcedWeights.cuisineMatch, 0, 'cuisineMatch should be 0');
      assert.strictEqual(result.enforcedWeights.openBoost, 0, 'openBoost should be 0');

      // Should have 2 violations
      assert.strictEqual(result.violations.length, 2);
    });
  });

  describe('checkInvariants', () => {
    it('should return violations without modifying input weights', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const violations = RankingInvariantEnforcer.checkInvariants(baseWeights, context);

      assert.strictEqual(violations.length, 3, 'Should return all violations');
      // Original weights should be unchanged
      assert.strictEqual(baseWeights.distance, 0.30);
      assert.strictEqual(baseWeights.cuisineMatch, 0.15);
      assert.strictEqual(baseWeights.openBoost, 0.10);
    });

    it('should return empty array when no violations', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const violations = RankingInvariantEnforcer.checkInvariants(baseWeights, context);

      assert.strictEqual(violations.length, 0, 'Should have no violations');
    });
  });

  describe('validate', () => {
    it('should return false when invariants are violated', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const isValid = RankingInvariantEnforcer.validate(baseWeights, context);

      assert.strictEqual(isValid, false, 'Should be invalid');
    });

    it('should return true when all invariants are satisfied', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const isValid = RankingInvariantEnforcer.validate(baseWeights, context);

      assert.strictEqual(isValid, true, 'Should be valid');
    });

    it('should return true when weights are already 0', () => {
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

      const isValid = RankingInvariantEnforcer.validate(weightsWithZeros, context);

      assert.strictEqual(isValid, true, 'Should be valid when weights already 0');
    });
  });

  describe('summarize', () => {
    it('should provide summary when violations exist', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);
      const summary = RankingInvariantEnforcer.summarize(result);

      assert.ok(summary.includes('3 invariant'), 'Should mention number of invariants');
      assert.ok(summary.includes('distance'), 'Should mention distance');
      assert.ok(summary.includes('cuisineMatch'), 'Should mention cuisineMatch');
      assert.ok(summary.includes('openBoost'), 'Should mention openBoost');
    });

    it('should provide summary when no violations', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);
      const summary = RankingInvariantEnforcer.summarize(result);

      assert.ok(summary.includes('All invariants satisfied'), 'Should indicate no violations');
    });
  });

  describe('toLegacyFormat', () => {
    it('should convert to legacy format correctly', () => {
      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacy = RankingInvariantEnforcer.toLegacyFormat(result);

      assert.strictEqual(legacy.length, 3);
      
      // Check structure
      legacy.forEach(item => {
        assert.ok('rule' in item);
        assert.ok('component' in item);
        assert.ok('oldWeight' in item);
      });

      // Verify specific values
      const distanceRule = legacy.find(r => r.component === 'distance');
      assert.ok(distanceRule);
      assert.strictEqual(distanceRule.rule, 'NO_USER_LOCATION');
      assert.strictEqual(distanceRule.oldWeight, 0.30);
    });

    it('should return empty array when no violations', () => {
      const context: RankingContext = {
        hasUserLocation: true,
        cuisineKey: 'italian',
        openNowRequested: true,
        hasCuisineScores: true
      };

      const result = RankingInvariantEnforcer.enforce(baseWeights, context);
      const legacy = RankingInvariantEnforcer.toLegacyFormat(result);

      assert.strictEqual(legacy.length, 0);
    });
  });

  describe('No mutation guarantee', () => {
    it('should not mutate input weights object', () => {
      const originalWeights: RankingWeights = {
        rating: 0.25,
        reviews: 0.20,
        distance: 0.30,
        openBoost: 0.10,
        cuisineMatch: 0.15
      };

      const weightsCopy = { ...originalWeights };

      const context: RankingContext = {
        hasUserLocation: false,
        cuisineKey: null,
        openNowRequested: false,
        hasCuisineScores: false
      };

      const result = RankingInvariantEnforcer.enforce(originalWeights, context);

      // Original should be unchanged
      assert.deepStrictEqual(originalWeights, weightsCopy, 'Input should not be mutated');
      
      // Result should be different
      assert.notDeepStrictEqual(result.enforcedWeights, originalWeights, 'Result should be different');
    });
  });
});
