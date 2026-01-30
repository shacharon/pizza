/**
 * Ranking Profile Schema Tests
 * Tests weight normalization logic
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeWeights, RankingSelectionSchema } from './ranking-profile.schema.js';

describe('normalizeWeights', () => {
  it('should return weights unchanged when they sum to 1', () => {
    const weights = {
      rating: 0.25,
      reviews: 0.25,
      distance: 0.25,
      openBoost: 0.25
    };

    const normalized = normalizeWeights(weights);

    assert.deepStrictEqual(normalized, weights);
  });

  it('should return weights unchanged when they sum to ~1 (within tolerance)', () => {
    const weights = {
      rating: 0.2501,
      reviews: 0.25,
      distance: 0.25,
      openBoost: 0.2499
    };

    const normalized = normalizeWeights(weights);

    // Should be unchanged (within 0.001 tolerance)
    assert.deepStrictEqual(normalized, weights);
  });

  it('should normalize weights when they sum to > 1', () => {
    const weights = {
      rating: 0.4,
      reviews: 0.4,
      distance: 0.4,
      openBoost: 0.4
    }; // Sum = 1.6

    const normalized = normalizeWeights(weights);

    // Each should be divided by 1.6
    assert.ok(Math.abs(normalized.rating - 0.25) < 0.001);
    assert.ok(Math.abs(normalized.reviews - 0.25) < 0.001);
    assert.ok(Math.abs(normalized.distance - 0.25) < 0.001);
    assert.ok(Math.abs(normalized.openBoost - 0.25) < 0.001);

    // Sum should be 1
    const sum = normalized.rating + normalized.reviews + normalized.distance + normalized.openBoost;
    assert.ok(Math.abs(sum - 1.0) < 0.000001);
  });

  it('should normalize weights when they sum to < 1', () => {
    const weights = {
      rating: 0.1,
      reviews: 0.1,
      distance: 0.1,
      openBoost: 0.1
    }; // Sum = 0.4

    const normalized = normalizeWeights(weights);

    // Each should be divided by 0.4 (i.e., multiplied by 2.5)
    assert.ok(Math.abs(normalized.rating - 0.25) < 0.001);
    assert.ok(Math.abs(normalized.reviews - 0.25) < 0.001);
    assert.ok(Math.abs(normalized.distance - 0.25) < 0.001);
    assert.ok(Math.abs(normalized.openBoost - 0.25) < 0.001);

    // Sum should be 1
    const sum = normalized.rating + normalized.reviews + normalized.distance + normalized.openBoost;
    assert.ok(Math.abs(sum - 1.0) < 0.000001);
  });

  it('should handle all-zero weights by returning balanced weights', () => {
    const weights = {
      rating: 0,
      reviews: 0,
      distance: 0,
      openBoost: 0
    };

    const normalized = normalizeWeights(weights);

    assert.deepStrictEqual(normalized, {
      rating: 0.25,
      reviews: 0.25,
      distance: 0.25,
      openBoost: 0.25
    });
  });

  it('should normalize unbalanced weights correctly', () => {
    const weights = {
      rating: 0.6,
      reviews: 0.3,
      distance: 0.2,
      openBoost: 0.1
    }; // Sum = 1.2

    const normalized = normalizeWeights(weights);

    assert.ok(Math.abs(normalized.rating - 0.5) < 0.001); // 0.6 / 1.2
    assert.ok(Math.abs(normalized.reviews - 0.25) < 0.001); // 0.3 / 1.2
    assert.ok(Math.abs(normalized.distance - 0.1667) < 0.001); // 0.2 / 1.2
    assert.ok(Math.abs(normalized.openBoost - 0.0833) < 0.001); // 0.1 / 1.2

    // Sum should be 1
    const sum = normalized.rating + normalized.reviews + normalized.distance + normalized.openBoost;
    assert.ok(Math.abs(sum - 1.0) < 0.000001);
  });
});

describe('RankingSelectionSchema', () => {
  it('should validate correct ranking selection', () => {
    const data = {
      profile: 'BALANCED',
      weights: {
        rating: 0.25,
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      }
    };

    const result = RankingSelectionSchema.safeParse(data);
    assert.strictEqual(result.success, true);
  });

  it('should reject invalid profile', () => {
    const data = {
      profile: 'INVALID',
      weights: {
        rating: 0.25,
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      }
    };

    const result = RankingSelectionSchema.safeParse(data);
    assert.strictEqual(result.success, false);
  });

  it('should reject weights out of range', () => {
    const data = {
      profile: 'BALANCED',
      weights: {
        rating: 1.5, // Invalid: > 1
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      }
    };

    const result = RankingSelectionSchema.safeParse(data);
    assert.strictEqual(result.success, false);
  });

  it('should reject negative weights', () => {
    const data = {
      profile: 'BALANCED',
      weights: {
        rating: -0.1, // Invalid: < 0
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      }
    };

    const result = RankingSelectionSchema.safeParse(data);
    assert.strictEqual(result.success, false);
  });

  it('should reject missing weight fields', () => {
    const data = {
      profile: 'BALANCED',
      weights: {
        rating: 0.25,
        reviews: 0.25,
        distance: 0.25
        // Missing openBoost
      }
    };

    const result = RankingSelectionSchema.safeParse(data);
    assert.strictEqual(result.success, false);
  });

  it('should reject extra fields (strict mode)', () => {
    const data = {
      profile: 'BALANCED',
      weights: {
        rating: 0.25,
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      },
      extraField: 'not allowed'
    };

    const result = RankingSelectionSchema.safeParse(data);
    assert.strictEqual(result.success, false);
  });

  it('should accept all valid profile types', () => {
    const profiles = ['NEARBY', 'QUALITY', 'OPEN_FOCUS', 'BALANCED'];
    
    profiles.forEach(profile => {
      const data = {
        profile,
        weights: {
          rating: 0.25,
          reviews: 0.25,
          distance: 0.25,
          openBoost: 0.25
        }
      };

      const result = RankingSelectionSchema.safeParse(data);
      assert.strictEqual(result.success, true);
    });
  });
});
