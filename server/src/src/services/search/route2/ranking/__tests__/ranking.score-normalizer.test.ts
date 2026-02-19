/**
 * Tests for ScoreNormalizer
 * Verifies correct normalization of rating, reviews, distance, and open status
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScoreNormalizer } from '../ranking.score-normalizer.js';

describe('ScoreNormalizer', () => {
  const normalizer = new ScoreNormalizer();

  describe('normalizeRating', () => {
    it('should normalize rating 5 to 1.0', () => {
      assert.equal(normalizer.normalizeRating(5), 1.0);
    });

    it('should normalize rating 4 to 0.8', () => {
      assert.equal(normalizer.normalizeRating(4), 0.8);
    });

    it('should normalize rating 3 to 0.6', () => {
      assert.equal(normalizer.normalizeRating(3), 0.6);
    });

    it('should normalize rating 2 to 0.4', () => {
      assert.equal(normalizer.normalizeRating(2), 0.4);
    });

    it('should normalize rating 1 to 0.2', () => {
      assert.equal(normalizer.normalizeRating(1), 0.2);
    });

    it('should normalize rating 0 to 0.0', () => {
      assert.equal(normalizer.normalizeRating(0), 0.0);
    });

    it('should handle null as 0', () => {
      assert.equal(normalizer.normalizeRating(null), 0.0);
    });

    it('should handle undefined as 0', () => {
      assert.equal(normalizer.normalizeRating(undefined), 0.0);
    });

    it('should clamp ratings above 5 to 1.0', () => {
      assert.equal(normalizer.normalizeRating(6), 1.0);
      assert.equal(normalizer.normalizeRating(10), 1.0);
      assert.equal(normalizer.normalizeRating(100), 1.0);
    });

    it('should clamp negative ratings to 0.0', () => {
      assert.equal(normalizer.normalizeRating(-1), 0.0);
      assert.equal(normalizer.normalizeRating(-5), 0.0);
    });

    it('should handle decimal ratings', () => {
      assert.equal(normalizer.normalizeRating(4.5), 0.9);
      
      // Handle floating point precision for 3.7 / 5
      const result37 = normalizer.normalizeRating(3.7);
      assert.ok(Math.abs(result37 - 0.74) < 0.001);
      
      // Handle floating point precision for 2.3 / 5
      const result23 = normalizer.normalizeRating(2.3);
      assert.ok(Math.abs(result23 - 0.46) < 0.001);
    });
  });

  describe('normalizeReviews', () => {
    it('should normalize 0 reviews to ~0.0', () => {
      // log10(0 + 1) / 5 = log10(1) / 5 = 0 / 5 = 0
      assert.equal(normalizer.normalizeReviews(0), 0.0);
    });

    it('should normalize 9 reviews to 0.2', () => {
      // log10(9 + 1) / 5 = log10(10) / 5 = 1 / 5 = 0.2
      assert.equal(normalizer.normalizeReviews(9), 0.2);
    });

    it('should normalize 99 reviews to 0.4', () => {
      // log10(99 + 1) / 5 = log10(100) / 5 = 2 / 5 = 0.4
      assert.equal(normalizer.normalizeReviews(99), 0.4);
    });

    it('should normalize 999 reviews to 0.6', () => {
      // log10(999 + 1) / 5 = log10(1000) / 5 = 3 / 5 = 0.6
      assert.equal(normalizer.normalizeReviews(999), 0.6);
    });

    it('should normalize 9999 reviews to 0.8', () => {
      // log10(9999 + 1) / 5 = log10(10000) / 5 = 4 / 5 = 0.8
      assert.equal(normalizer.normalizeReviews(9999), 0.8);
    });

    it('should handle null as 0', () => {
      assert.equal(normalizer.normalizeReviews(null), 0.0);
    });

    it('should handle undefined as 0', () => {
      assert.equal(normalizer.normalizeReviews(undefined), 0.0);
    });

    it('should clamp very large review counts to 1.0', () => {
      // log10(99999 + 1) / 5 = log10(100000) / 5 = 5 / 5 = 1.0
      assert.equal(normalizer.normalizeReviews(99999), 1.0);
      
      // log10(999999 + 1) / 5 = log10(1000000) / 5 = 6 / 5 = 1.2, clamped to 1.0
      assert.equal(normalizer.normalizeReviews(999999), 1.0);
    });

    it('should handle 1 review', () => {
      // log10(1 + 1) / 5 = log10(2) / 5 ≈ 0.301 / 5 ≈ 0.06
      const result = normalizer.normalizeReviews(1);
      assert.ok(result > 0.06 && result < 0.061);
    });

    it('should handle 100 reviews', () => {
      // log10(100 + 1) / 5 = log10(101) / 5 ≈ 2.004 / 5 ≈ 0.4
      const result = normalizer.normalizeReviews(100);
      assert.ok(result > 0.4 && result < 0.41);
    });

    it('should handle negative review counts as 0', () => {
      // Negative counts treated as 0 (explicit guard against NaN)
      assert.equal(normalizer.normalizeReviews(-1), 0.0);
      assert.equal(normalizer.normalizeReviews(-100), 0.0);
    });
  });

  describe('normalizeDistance', () => {
    it('should normalize 0 km to 1.0', () => {
      // 1 / (1 + 0) = 1 / 1 = 1.0
      assert.equal(normalizer.normalizeDistance(0), 1.0);
    });

    it('should normalize 1 km to 0.5', () => {
      // 1 / (1 + 1) = 1 / 2 = 0.5
      assert.equal(normalizer.normalizeDistance(1), 0.5);
    });

    it('should normalize 4 km to 0.2', () => {
      // 1 / (1 + 4) = 1 / 5 = 0.2
      assert.equal(normalizer.normalizeDistance(4), 0.2);
    });

    it('should normalize 9 km to 0.1', () => {
      // 1 / (1 + 9) = 1 / 10 = 0.1
      assert.equal(normalizer.normalizeDistance(9), 0.1);
    });

    it('should handle null as 0.0', () => {
      assert.equal(normalizer.normalizeDistance(null), 0.0);
    });

    it('should handle undefined as 0.0', () => {
      assert.equal(normalizer.normalizeDistance(undefined), 0.0);
    });

    it('should handle negative distance as 0.0', () => {
      assert.equal(normalizer.normalizeDistance(-1), 0.0);
      assert.equal(normalizer.normalizeDistance(-10), 0.0);
    });

    it('should handle very large distances', () => {
      // 1 / (1 + 1000) = 1 / 1001 ≈ 0.001
      const result = normalizer.normalizeDistance(1000);
      assert.ok(result < 0.002);
      assert.ok(result > 0.0009);
    });

    it('should handle decimal distances', () => {
      // 1 / (1 + 0.5) = 1 / 1.5 ≈ 0.667
      const result = normalizer.normalizeDistance(0.5);
      assert.ok(result > 0.666 && result < 0.667);
    });

    it('should decrease score as distance increases', () => {
      const dist1 = normalizer.normalizeDistance(1);
      const dist2 = normalizer.normalizeDistance(2);
      const dist10 = normalizer.normalizeDistance(10);
      
      assert.ok(dist1 > dist2);
      assert.ok(dist2 > dist10);
    });

    it('should handle very small distances', () => {
      // 1 / (1 + 0.001) ≈ 0.999
      const result = normalizer.normalizeDistance(0.001);
      assert.ok(result > 0.999);
    });
  });

  describe('normalizeOpen', () => {
    it('should normalize true to 1.0', () => {
      assert.equal(normalizer.normalizeOpen(true), 1.0);
    });

    it('should normalize false to 0.0', () => {
      assert.equal(normalizer.normalizeOpen(false), 0.0);
    });

    it('should normalize "UNKNOWN" to 0.5', () => {
      assert.equal(normalizer.normalizeOpen('UNKNOWN'), 0.5);
    });

    it('should normalize null to 0.5', () => {
      assert.equal(normalizer.normalizeOpen(null), 0.5);
    });

    it('should normalize undefined to 0.5', () => {
      assert.equal(normalizer.normalizeOpen(undefined), 0.5);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle all normalizers with null', () => {
      assert.equal(normalizer.normalizeRating(null), 0.0);
      assert.equal(normalizer.normalizeReviews(null), 0.0);
      assert.equal(normalizer.normalizeDistance(null), 0.0);
      assert.equal(normalizer.normalizeOpen(null), 0.5);
    });

    it('should handle all normalizers with undefined', () => {
      assert.equal(normalizer.normalizeRating(undefined), 0.0);
      assert.equal(normalizer.normalizeReviews(undefined), 0.0);
      assert.equal(normalizer.normalizeDistance(undefined), 0.0);
      assert.equal(normalizer.normalizeOpen(undefined), 0.5);
    });

    it('should handle all normalizers with 0', () => {
      assert.equal(normalizer.normalizeRating(0), 0.0);
      assert.equal(normalizer.normalizeReviews(0), 0.0);
      assert.equal(normalizer.normalizeDistance(0), 1.0); // 0 km = perfect proximity
      assert.equal(normalizer.normalizeOpen(false), 0.0); // false = 0.0, not 0
    });

    it('should return values in [0, 1] for all methods', () => {
      // Test various inputs
      const ratingValues = [0, 1, 2.5, 5, 10, -5, null, undefined];
      const reviewValues = [0, 1, 100, 10000, 1000000, -10, null, undefined];
      const distanceValues = [0, 1, 10, 100, 1000, -5, null, undefined];
      const openValues = [true, false, 'UNKNOWN', null, undefined] as const;

      for (const value of ratingValues) {
        const result = normalizer.normalizeRating(value);
        assert.ok(result >= 0 && result <= 1, `Rating ${value} normalized to ${result}, outside [0,1]`);
      }

      for (const value of reviewValues) {
        const result = normalizer.normalizeReviews(value);
        assert.ok(result >= 0 && result <= 1, `Reviews ${value} normalized to ${result}, outside [0,1]`);
      }

      for (const value of distanceValues) {
        const result = normalizer.normalizeDistance(value);
        assert.ok(result >= 0 && result <= 1, `Distance ${value} normalized to ${result}, outside [0,1]`);
      }

      for (const value of openValues) {
        const result = normalizer.normalizeOpen(value);
        assert.ok(result >= 0 && result <= 1, `Open ${value} normalized to ${result}, outside [0,1]`);
      }
    });
  });

  describe('consistency with original implementation', () => {
    it('should match original rating normalization', () => {
      // Original: clamp((rating ?? 0) / 5, 0, 1)
      const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
      
      const testValues = [null, undefined, 0, 1, 2.5, 4.5, 5, 6, -1];
      for (const value of testValues) {
        const expected = clamp((value ?? 0) / 5, 0, 1);
        const actual = normalizer.normalizeRating(value);
        assert.equal(actual, expected, `Rating ${value} mismatch`);
      }
    });

    it('should match original reviews normalization', () => {
      // Original: clamp(Math.log10((reviews ?? 0) + 1) / 5, 0, 1)
      // With guard against negative values to avoid NaN
      const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
      
      const testValues = [null, undefined, 0, 9, 99, 999, 9999, 99999, 999999];
      for (const value of testValues) {
        const reviewCount = value ?? 0;
        let expected: number;
        if (reviewCount < 0) {
          expected = 0;
        } else {
          expected = clamp(Math.log10(reviewCount + 1) / 5, 0, 1);
        }
        const actual = normalizer.normalizeReviews(value);
        assert.equal(actual, expected, `Reviews ${value} mismatch`);
      }
    });

    it('should match original distance normalization', () => {
      // Original: 1 / (1 + distanceKm) if userLocation exists, else 0
      const testValues = [null, undefined, 0, 1, 4, 9, 0.5, 100, -1];
      for (const value of testValues) {
        let expected = 0;
        if (value !== null && value !== undefined) {
          if (value >= 0) {
            expected = 1 / (1 + value);
          }
        }
        const actual = normalizer.normalizeDistance(value);
        assert.equal(actual, expected, `Distance ${value} mismatch`);
      }
    });

    it('should match original open normalization', () => {
      // Original: 1 if true, 0 if false, 0.5 otherwise
      const testCases: Array<[boolean | 'UNKNOWN' | null | undefined, number]> = [
        [true, 1],
        [false, 0],
        ['UNKNOWN', 0.5],
        [null, 0.5],
        [undefined, 0.5]
      ];

      for (const [input, expected] of testCases) {
        const actual = normalizer.normalizeOpen(input);
        assert.equal(actual, expected, `Open ${input} mismatch`);
      }
    });
  });
});
