/**
 * Tests for dynamic ranking profile selection based on query signals
 * 
 * Verifies that different queries produce different ranking profiles and weights
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectRankingProfileDeterministic,
  type DeterministicRankingContext
} from '../ranking-profile-deterministic.js';

describe('Ranking Profile Selection - Query Signal Based', () => {
  describe('Cuisine-based profile selection', () => {
    it('should select CUISINE_FOCUSED profile for Italian query', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'italian',
        requestId: 'test-italian'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'CUISINE');
      assert.strictEqual(result.weights.rating, 0.35); // Higher than balanced
      assert.strictEqual(result.weights.reviews, 0.30); // Higher than balanced
      assert.strictEqual(result.weights.distance, 0.25); // Lower than balanced
    });

    it('should select CUISINE_FOCUSED profile for Japanese query', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'japanese',
        requestId: 'test-japanese'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'CUISINE');
      assert.strictEqual(result.weights.rating, 0.35);
      assert.strictEqual(result.weights.reviews, 0.30);
    });

    it('should select CUISINE_FOCUSED profile for Asian query', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'asian',
        requestId: 'test-asian'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'CUISINE');
      assert.strictEqual(result.weights.rating, 0.35);
      assert.strictEqual(result.weights.reviews, 0.30);
    });
  });

  describe('Quality/occasion-based profile selection', () => {
    it('should select QUALITY_FOCUSED profile for fine dining query', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'fine_dining',
        requestId: 'test-fine-dining'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'QUALITY');
      assert.strictEqual(result.weights.rating, 0.40); // Highest rating weight
      assert.strictEqual(result.weights.reviews, 0.35); // Highest reviews weight
      assert.strictEqual(result.weights.distance, 0.15); // Lowest distance weight
    });

    it('should select QUALITY_FOCUSED profile for French query', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'french',
        requestId: 'test-french'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'QUALITY');
      assert.strictEqual(result.weights.rating, 0.40);
      assert.strictEqual(result.weights.reviews, 0.35);
    });

    it('should select QUALITY_FOCUSED profile for Mediterranean query', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'mediterranean',
        requestId: 'test-mediterranean'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'QUALITY');
      assert.strictEqual(result.weights.rating, 0.40);
      assert.strictEqual(result.weights.reviews, 0.35);
    });
  });

  describe('Proximity-based profile selection', () => {
    it('should select NEARBY profile for NEARBY route', () => {
      const ctx: DeterministicRankingContext = {
        route: 'NEARBY',
        hasUserLocation: true,
        cuisineKey: null,
        requestId: 'test-nearby'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'NEARBY');
      assert.strictEqual(result.weights.distance, 0.65); // Highest distance weight
      assert.strictEqual(result.weights.rating, 0.15); // Lower rating weight
    });

    it('should select NEARBY profile for proximity intent', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'nearby_intent',
        cuisineKey: null,
        requestId: 'test-proximity'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'NEARBY');
      assert.strictEqual(result.weights.distance, 0.65);
    });

    it('should prioritize NEARBY over CUISINE when both signals present', () => {
      // NEARBY route should take precedence over cuisine
      const ctx: DeterministicRankingContext = {
        route: 'NEARBY',
        hasUserLocation: true,
        cuisineKey: 'italian',
        requestId: 'test-nearby-italian'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'NEARBY');
      assert.strictEqual(result.weights.distance, 0.65);
    });
  });

  describe('Generic/balanced queries', () => {
    it('should select BALANCED profile for generic query without signals', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: null,
        requestId: 'test-generic'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'BALANCED');
      assert.strictEqual(result.weights.rating, 0.30);
      assert.strictEqual(result.weights.reviews, 0.25);
      assert.strictEqual(result.weights.distance, 0.35);
      assert.strictEqual(result.weights.openBoost, 0.10);
    });
  });

  describe('No location scenarios', () => {
    it('should select NO_LOCATION profile when hasUserLocation is false', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: false,
        cuisineKey: 'italian',
        requestId: 'test-no-location'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.profile, 'BALANCED'); // Profile name compatibility
      assert.strictEqual(result.weights.distance, 0.00); // Distance disabled
      assert.strictEqual(result.weights.rating, 0.45); // Higher rating weight
      assert.strictEqual(result.weights.reviews, 0.45); // Higher reviews weight
    });

    it('should set distance weight to 0 even for NEARBY route without location', () => {
      const ctx: DeterministicRankingContext = {
        route: 'NEARBY',
        hasUserLocation: false,
        cuisineKey: null,
        requestId: 'test-nearby-no-location'
      };

      const result = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result.weights.distance, 0.00);
    });
  });

  describe('Profile differentiation - Italian vs Romantic', () => {
    it('Italian query should produce CUISINE profile', () => {
      const italianCtx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'italian',
        requestId: 'test-italian-diff'
      };

      const italianResult = selectRankingProfileDeterministic(italianCtx);

      assert.strictEqual(italianResult.profile, 'CUISINE');
      assert.strictEqual(italianResult.weights.rating, 0.35);
      assert.strictEqual(italianResult.weights.distance, 0.25);
    });

    it('Fine dining (romantic) query should produce QUALITY profile with different weights', () => {
      const romanticCtx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'fine_dining',
        requestId: 'test-romantic-diff'
      };

      const romanticResult = selectRankingProfileDeterministic(romanticCtx);

      assert.strictEqual(romanticResult.profile, 'QUALITY');
      assert.strictEqual(romanticResult.weights.rating, 0.40); // Higher than Italian
      assert.strictEqual(romanticResult.weights.distance, 0.15); // Lower than Italian
    });

    it('profiles should be different for Italian vs Fine Dining', () => {
      const italianCtx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'italian',
        requestId: 'test-compare-1'
      };

      const fineDiningCtx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'fine_dining',
        requestId: 'test-compare-2'
      };

      const italianResult = selectRankingProfileDeterministic(italianCtx);
      const fineDiningResult = selectRankingProfileDeterministic(fineDiningCtx);

      // Profiles should be different
      assert.notStrictEqual(italianResult.profile, fineDiningResult.profile);

      // Weights should be different
      assert.notStrictEqual(italianResult.weights.rating, fineDiningResult.weights.rating);
      assert.notStrictEqual(italianResult.weights.distance, fineDiningResult.weights.distance);
    });
  });

  describe('Weight validation', () => {
    it('all profiles should have weights summing to 1.0', () => {
      const profiles: Array<{ cuisineKey: string | null; route: any }> = [
        { cuisineKey: null, route: 'TEXTSEARCH' },
        { cuisineKey: 'italian', route: 'TEXTSEARCH' },
        { cuisineKey: 'fine_dining', route: 'TEXTSEARCH' },
        { cuisineKey: null, route: 'NEARBY' }
      ];

      profiles.forEach(({ cuisineKey, route }) => {
        const ctx: DeterministicRankingContext = {
          route: route as any,
          hasUserLocation: true,
          cuisineKey,
          requestId: `test-weights-${cuisineKey || route}`
        };

        const result = selectRankingProfileDeterministic(ctx);
        const sum = result.weights.rating + result.weights.reviews +
          result.weights.distance + result.weights.openBoost;

        // Check within tolerance
        assert.ok(Math.abs(sum - 1.0) < 0.001);
      });
    });

    it('NO_LOCATION profile weights should sum to 1.0', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: false,
        cuisineKey: null,
        requestId: 'test-no-location-weights'
      };

      const result = selectRankingProfileDeterministic(ctx);
      const sum = result.weights.rating + result.weights.reviews +
        result.weights.distance + result.weights.openBoost;

      assert.ok(Math.abs(sum - 1.0) < 0.001);
    });
  });

  describe('Determinism check', () => {
    it('same inputs should produce identical results', () => {
      const ctx: DeterministicRankingContext = {
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        cuisineKey: 'italian',
        requestId: 'test-determinism'
      };

      const result1 = selectRankingProfileDeterministic(ctx);
      const result2 = selectRankingProfileDeterministic(ctx);

      assert.strictEqual(result1.profile, result2.profile);
      assert.deepStrictEqual(result1.weights, result2.weights);
    });
  });
});
