/**
 * Unit tests for Order Profile Resolver
 * 
 * Tests deterministic profile resolution based on intent signals
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveOrderProfile,
  resolveOrderMetadata,
  getOrderWeights,
  validateWeights,
  type OrderProfile,
  type OrderProfileContext
} from '../order-profile.js';

describe('Order Profile Resolver', () => {
  describe('resolveOrderProfile - Priority Rules', () => {
    it('should return "nearby" when openNowRequested is true', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        openNowRequested: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'nearby');
    });

    it('should return "nearby" for openNow even with other intents present', () => {
      // openNow has HIGHEST priority
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        openNowRequested: true,
        priceIntent: 'cheap',
        qualityIntent: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'nearby', 'openNow should override other intents');
    });

    it('should return "budget" when priceIntent is "cheap"', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        priceIntent: 'cheap'
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'budget');
    });

    it('should return "budget" even if qualityIntent present (but not openNow)', () => {
      // priceIntent has priority over qualityIntent
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        priceIntent: 'cheap',
        qualityIntent: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'budget', 'cheap should override quality');
    });

    it('should return "quality" when qualityIntent is true', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        qualityIntent: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'quality');
    });

    it('should return "balanced" as default when no special intents', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'balanced');
    });

    it('should return "balanced" when priceIntent is "mid" or "premium"', () => {
      const ctx1: OrderProfileContext = {
        hasUserLocation: true,
        priceIntent: 'mid'
      };

      const ctx2: OrderProfileContext = {
        hasUserLocation: true,
        priceIntent: 'premium'
      };

      assert.strictEqual(resolveOrderProfile(ctx1), 'balanced');
      assert.strictEqual(resolveOrderProfile(ctx2), 'balanced');
    });

    it('should return "balanced" when openNowRequested is false', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        openNowRequested: false
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'balanced');
    });

    it('should return "balanced" when qualityIntent is false', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        qualityIntent: false
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'balanced');
    });
  });

  describe('Language Independence', () => {
    it('should return same profile for Hebrew query', () => {
      const ctx: OrderProfileContext = {
        intentText: 'מסעדות פתוחות עכשיו',
        hasUserLocation: true,
        openNowRequested: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'nearby');
    });

    it('should return same profile for English query', () => {
      const ctx: OrderProfileContext = {
        intentText: 'open now restaurants',
        hasUserLocation: true,
        openNowRequested: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'nearby');
    });

    it('should NOT be affected by query language - only intent signals matter', () => {
      // Same intent signals, different languages
      const hebrewCtx: OrderProfileContext = {
        intentText: 'מסעדות זולות',
        hasUserLocation: true,
        priceIntent: 'cheap'
      };

      const englishCtx: OrderProfileContext = {
        intentText: 'cheap restaurants',
        hasUserLocation: true,
        priceIntent: 'cheap'
      };

      const arabicCtx: OrderProfileContext = {
        intentText: 'مطاعم رخيصة',
        hasUserLocation: true,
        priceIntent: 'cheap'
      };

      assert.strictEqual(resolveOrderProfile(hebrewCtx), 'budget');
      assert.strictEqual(resolveOrderProfile(englishCtx), 'budget');
      assert.strictEqual(resolveOrderProfile(arabicCtx), 'budget');
    });

    it('should work without intentText (intentText is optional)', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        qualityIntent: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'quality');
    });
  });

  describe('getOrderWeights', () => {
    it('should return correct weights for "balanced" profile', () => {
      const weights = getOrderWeights('balanced');

      assert.strictEqual(weights.rating, 25);
      assert.strictEqual(weights.reviews, 20);
      assert.strictEqual(weights.price, 15);
      assert.strictEqual(weights.openNow, 15);
      assert.strictEqual(weights.distance, 25);
    });

    it('should return correct weights for "nearby" profile', () => {
      const weights = getOrderWeights('nearby');

      assert.strictEqual(weights.distance, 40, 'nearby should prioritize distance');
      assert.strictEqual(weights.openNow, 25, 'nearby should prioritize openNow');
    });

    it('should return correct weights for "quality" profile', () => {
      const weights = getOrderWeights('quality');

      assert.strictEqual(weights.rating, 35, 'quality should prioritize rating');
      assert.strictEqual(weights.reviews, 30, 'quality should prioritize reviews');
    });

    it('should return correct weights for "budget" profile', () => {
      const weights = getOrderWeights('budget');

      assert.strictEqual(weights.price, 35, 'budget should prioritize price');
    });
  });

  describe('Weight Validation', () => {
    it('should validate that all profile weights sum to 100', () => {
      const profiles: OrderProfile[] = ['balanced', 'nearby', 'quality', 'budget'];

      for (const profile of profiles) {
        const weights = getOrderWeights(profile);
        const sum = weights.rating + weights.reviews + weights.price + weights.openNow + weights.distance;

        assert.strictEqual(
          sum,
          100,
          `Profile '${profile}' weights must sum to 100, got ${sum}`
        );
      }
    });

    it('should pass validateWeights for valid configuration', () => {
      const validWeights = {
        rating: 25,
        reviews: 25,
        price: 20,
        openNow: 15,
        distance: 15
      };

      assert.strictEqual(validateWeights(validWeights), true);
    });

    it('should fail validateWeights for invalid configuration', () => {
      const invalidWeights = {
        rating: 30,
        reviews: 30,
        price: 20,
        openNow: 10,
        distance: 10
      }; // Sum = 100 is actually valid, let me make it invalid

      const actuallyInvalid = {
        rating: 30,
        reviews: 30,
        price: 20,
        openNow: 10,
        distance: 15
      }; // Sum = 105

      assert.strictEqual(validateWeights(actuallyInvalid), false);
    });
  });

  describe('resolveOrderMetadata', () => {
    it('should return complete metadata with profile and weights', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        openNowRequested: true
      };

      const metadata = resolveOrderMetadata(ctx);

      assert.strictEqual(metadata.profile, 'nearby');
      assert.ok(metadata.weights, 'Should have weights');
      assert.strictEqual(metadata.weights.distance, 40);
      assert.strictEqual(metadata.weights.openNow, 25);
    });

    it('should return balanced metadata by default', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: false
      };

      const metadata = resolveOrderMetadata(ctx);

      assert.strictEqual(metadata.profile, 'balanced');
      assert.strictEqual(metadata.weights.rating, 25);
      assert.strictEqual(metadata.weights.distance, 25);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing hasUserLocation (still works)', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: false,
        qualityIntent: true
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'quality', 'Should still resolve profile without user location');
    });

    it('should handle empty context (all fields undefined)', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: false
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'balanced', 'Empty context should default to balanced');
    });

    it('should handle partial context gracefully', () => {
      const ctx: OrderProfileContext = {
        hasUserLocation: true,
        intentText: 'some query'
        // No intent signals
      };

      const profile = resolveOrderProfile(ctx);
      assert.strictEqual(profile, 'balanced');
    });
  });
});
