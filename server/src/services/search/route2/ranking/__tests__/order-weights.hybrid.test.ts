/**
 * Tests for Hybrid Deterministic Order Weights
 * 
 * Verifies that different intent contexts produce meaningful weight differences
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHybridOrderWeights,
  getBaseWeights,
  getWeightConstraints,
  type HybridWeightContext,
  type OrderWeights
} from '../order-weights.hybrid.js';

describe('Hybrid Order Weights - Base Functionality', () => {
  it('should return base weights when no special intents', () => {
    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      cuisineKey: null
    };

    const result = resolveHybridOrderWeights(ctx);

    // Should be close to base weights (only BASE_BALANCED reason)
    assert.strictEqual(result.base, 'balanced');
    assert.deepStrictEqual(result.reasonCodes, ['BASE_BALANCED']);
    assert.strictEqual(result.weights.rating, 25);
    assert.strictEqual(result.weights.reviews, 20);
    assert.strictEqual(result.weights.price, 15);
    assert.strictEqual(result.weights.openNow, 15);
    assert.strictEqual(result.weights.distance, 25);
  });

  it('should always sum to exactly 100', () => {
    const contexts: HybridWeightContext[] = [
      {
        method: 'textsearch',
        hasUserLocation: false,
        distanceIntent: false,
        openNowRequested: false,
        priceIntent: 'any',
        qualityIntent: false
      },
      {
        method: 'nearby',
        hasUserLocation: true,
        distanceIntent: true,
        openNowRequested: false,
        priceIntent: 'any',
        qualityIntent: false
      },
      {
        method: 'textsearch',
        hasUserLocation: false,
        distanceIntent: false,
        openNowRequested: true,
        priceIntent: 'cheap',
        qualityIntent: true,
        occasion: 'romantic'
      }
    ];

    contexts.forEach((ctx, idx) => {
      const result = resolveHybridOrderWeights(ctx);
      const sum = result.weights.rating + result.weights.reviews +
        result.weights.price + result.weights.openNow +
        result.weights.distance;

      assert.strictEqual(sum, 100, `Context ${idx} weights must sum to 100`);
    });
  });

  it('should keep all weights within [5, 50] range', () => {
    const { MIN_WEIGHT, MAX_WEIGHT } = getWeightConstraints();

    const contexts: HybridWeightContext[] = [
      {
        method: 'nearby',
        hasUserLocation: true,
        distanceIntent: true,
        openNowRequested: true,
        priceIntent: 'cheap',
        qualityIntent: true,
        occasion: 'romantic'
      }
    ];

    contexts.forEach((ctx, idx) => {
      const result = resolveHybridOrderWeights(ctx);

      for (const key of ['rating', 'reviews', 'price', 'openNow', 'distance'] as const) {
        const weight = result.weights[key];
        assert.ok(
          weight >= MIN_WEIGHT && weight <= MAX_WEIGHT,
          `Context ${idx} ${key}=${weight} must be in [${MIN_WEIGHT}, ${MAX_WEIGHT}]`
        );
      }
    });
  });
});

describe('Hybrid Order Weights - Distance Intent (RULE A)', () => {
  it('should boost distance when distanceIntent=true', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: true,  // ← Trigger RULE A
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.distance > base.distance, 'Distance should be boosted');
    assert.ok(result.weights.rating < base.rating, 'Rating should be reduced');
    assert.ok(result.reasonCodes.includes('RULE_A_DISTANCE'));
  });

  it('should boost distance when method=nearby', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'nearby',  // ← Trigger RULE A
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.distance > base.distance, 'Distance should be boosted');
    assert.ok(result.reasonCodes.includes('RULE_A_DISTANCE'));
  });

  it('should boost distance when hasUserLocation=true', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: true,  // ← Trigger RULE A
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.distance > base.distance, 'Distance should be boosted');
    assert.ok(result.reasonCodes.includes('RULE_A_DISTANCE'));
  });
});

describe('Hybrid Order Weights - Open Now Intent (RULE B)', () => {
  it('should boost openNow when openNowRequested=true', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: true,  // ← Trigger RULE B
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.openNow > base.openNow, 'OpenNow should be boosted');
    assert.ok(result.weights.rating < base.rating, 'Rating should be reduced');
    assert.ok(result.reasonCodes.includes('RULE_B_OPEN_NOW'));
  });
});

describe('Hybrid Order Weights - Budget Intent (RULE C)', () => {
  it('should boost price when priceIntent=cheap', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'cheap',  // ← Trigger RULE C
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.price > base.price, 'Price should be boosted significantly');
    assert.ok(result.weights.rating < base.rating, 'Rating should be reduced');
    assert.ok(result.weights.openNow < base.openNow, 'OpenNow should be reduced');
    assert.ok(result.reasonCodes.includes('RULE_C_BUDGET'));
  });
});

describe('Hybrid Order Weights - Quality Intent (RULE D)', () => {
  it('should boost rating+reviews when qualityIntent=true', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: true,  // ← Trigger RULE D
      occasion: null
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.rating > base.rating, 'Rating should be boosted');
    assert.ok(result.weights.reviews > base.reviews, 'Reviews should be boosted');
    assert.ok(result.weights.distance < base.distance, 'Distance should be reduced');
    assert.ok(result.reasonCodes.includes('RULE_D_QUALITY'));
  });

  it('should boost rating+reviews when occasion=romantic', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      occasion: 'romantic'  // ← Trigger RULE D
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.weights.rating > base.rating, 'Rating should be boosted');
    assert.ok(result.weights.reviews > base.reviews, 'Reviews should be boosted');
    assert.ok(result.reasonCodes.includes('RULE_D_QUALITY'));
  });
});

describe('Hybrid Order Weights - Real-World Scenarios', () => {
  it('italian query (cuisineKey=italian, no other flags) → weights close to base', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false,
      cuisineKey: 'italian'
    };

    const result = resolveHybridOrderWeights(ctx);

    // Should be exactly base weights (no rules triggered)
    assert.deepStrictEqual(result.weights, base);
    assert.deepStrictEqual(result.reasonCodes, ['BASE_BALANCED']);
  });

  it('romantic query → rating+reviews noticeably higher than base', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: true,  // Romantic detected as quality intent
      occasion: 'romantic'
    };

    const result = resolveHybridOrderWeights(ctx);

    // Rating and reviews should be significantly higher
    assert.ok(result.weights.rating >= 40, `Rating should be ≥40, got ${result.weights.rating}`);
    assert.ok(result.weights.reviews >= 35, `Reviews should be ≥35, got ${result.weights.reviews}`);
    assert.ok(result.weights.distance <= 10, `Distance should be ≤10, got ${result.weights.distance}`);
    assert.ok(result.reasonCodes.includes('RULE_D_QUALITY'));
  });

  it('openNowRequested query → openNow noticeably higher than base', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: true,
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    // OpenNow should be significantly higher
    assert.ok(result.weights.openNow >= 30, `OpenNow should be ≥30, got ${result.weights.openNow}`);
    assert.ok(result.reasonCodes.includes('RULE_B_OPEN_NOW'));
  });

  it('distanceIntent query → distance noticeably higher than base', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: true,
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    // Distance should be significantly higher
    assert.ok(result.weights.distance >= 40, `Distance should be ≥40, got ${result.weights.distance}`);
    assert.ok(result.reasonCodes.includes('RULE_A_DISTANCE'));
  });

  it('cheap query → price noticeably higher than base', () => {
    const base = getBaseWeights();

    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'cheap',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    // Price should be significantly higher
    assert.ok(result.weights.price >= 35, `Price should be ≥35, got ${result.weights.price}`);
    assert.ok(result.reasonCodes.includes('RULE_C_BUDGET'));
  });
});

describe('Hybrid Order Weights - Multiple Rules', () => {
  it('should apply multiple rules simultaneously (romantic + open now)', () => {
    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: true,  // RULE B
      priceIntent: 'any',
      qualityIntent: true,     // RULE D
      occasion: 'romantic'
    };

    const result = resolveHybridOrderWeights(ctx);

    // Both rules should be applied
    assert.ok(result.reasonCodes.includes('RULE_B_OPEN_NOW'));
    assert.ok(result.reasonCodes.includes('RULE_D_QUALITY'));

    // Rating and reviews should be boosted (quality)
    assert.ok(result.weights.rating > 25);
    assert.ok(result.weights.reviews > 20);

    // OpenNow should be boosted (open now)
    assert.ok(result.weights.openNow > 15);
  });

  it('should apply multiple rules simultaneously (distance + cheap)', () => {
    const ctx: HybridWeightContext = {
      method: 'nearby',           // RULE A
      hasUserLocation: true,      // RULE A
      distanceIntent: true,       // RULE A
      openNowRequested: false,
      priceIntent: 'cheap',       // RULE C
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    // Both rules should be applied
    assert.ok(result.reasonCodes.includes('RULE_A_DISTANCE'));
    assert.ok(result.reasonCodes.includes('RULE_C_BUDGET'));

    // Distance should be boosted significantly (both rules boost it)
    assert.ok(result.weights.distance > 25);

    // Price should be boosted
    assert.ok(result.weights.price > 15);
  });

  it('should handle all rules at once (edge case)', () => {
    const ctx: HybridWeightContext = {
      method: 'nearby',           // RULE A
      hasUserLocation: true,      // RULE A
      distanceIntent: true,       // RULE A
      openNowRequested: true,     // RULE B
      priceIntent: 'cheap',       // RULE C
      qualityIntent: true,        // RULE D
      occasion: 'romantic'
    };

    const result = resolveHybridOrderWeights(ctx);

    // All rules should be applied
    assert.ok(result.reasonCodes.includes('RULE_A_DISTANCE'));
    assert.ok(result.reasonCodes.includes('RULE_B_OPEN_NOW'));
    assert.ok(result.reasonCodes.includes('RULE_C_BUDGET'));
    assert.ok(result.reasonCodes.includes('RULE_D_QUALITY'));

    // Weights should still sum to 100 and be within bounds
    const sum = result.weights.rating + result.weights.reviews +
      result.weights.price + result.weights.openNow +
      result.weights.distance;
    assert.strictEqual(sum, 100);

    // All weights should be in [5, 50]
    for (const key of ['rating', 'reviews', 'price', 'openNow', 'distance'] as const) {
      assert.ok(result.weights[key] >= 5 && result.weights[key] <= 50);
    }
  });
});

describe('Hybrid Order Weights - Determinism', () => {
  it('should produce identical results for same inputs', () => {
    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: false,
      priceIntent: 'cheap',
      qualityIntent: true,
      occasion: 'romantic',
      cuisineKey: 'italian'
    };

    const result1 = resolveHybridOrderWeights(ctx);
    const result2 = resolveHybridOrderWeights(ctx);

    // Should be identical
    assert.deepStrictEqual(result1.weights, result2.weights);
    assert.deepStrictEqual(result1.reasonCodes, result2.reasonCodes);
    assert.deepStrictEqual(result1.inputsSnapshot, result2.inputsSnapshot);
  });
});

describe('Hybrid Order Weights - Metadata', () => {
  it('should include inputs snapshot in metadata', () => {
    const ctx: HybridWeightContext = {
      method: 'nearby',
      hasUserLocation: true,
      distanceIntent: true,
      openNowRequested: false,
      priceIntent: 'cheap',
      qualityIntent: false,
      cuisineKey: 'italian'
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.strictEqual(result.inputsSnapshot.method, 'nearby');
    assert.strictEqual(result.inputsSnapshot.hasUserLocation, true);
    assert.strictEqual(result.inputsSnapshot.distanceIntent, true);
    assert.strictEqual(result.inputsSnapshot.priceIntent, 'cheap');
    assert.strictEqual(result.inputsSnapshot.cuisineKey, 'italian');
  });

  it('should include reasonCodes explaining which rules were applied', () => {
    const ctx: HybridWeightContext = {
      method: 'textsearch',
      hasUserLocation: false,
      distanceIntent: false,
      openNowRequested: true,
      priceIntent: 'any',
      qualityIntent: false
    };

    const result = resolveHybridOrderWeights(ctx);

    assert.ok(result.reasonCodes.includes('BASE_BALANCED'));
    assert.ok(result.reasonCodes.includes('RULE_B_OPEN_NOW'));
    assert.strictEqual(result.reasonCodes.length, 2);
  });
});
