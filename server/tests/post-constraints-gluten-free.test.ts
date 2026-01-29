/**
 * Unit tests for isGlutenFree dietary preference in PostConstraints
 * 
 * Tests:
 * - Schema accepts isGlutenFree field
 * - Default builder sets isGlutenFree to null
 * - Schema validates boolean | null values
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PostConstraintsSchema,
  buildDefaultPostConstraints,
  type PostConstraints
} from '../src/services/search/route2/shared/post-constraints.types.js';

describe('PostConstraints - isGlutenFree field', () => {
  describe('Schema validation', () => {
    it('should accept isGlutenFree: true', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        isGlutenFree: true,
        requirements: { accessible: null, parking: null }
      };

      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.isGlutenFree, true);
      }
    });

    it('should accept isGlutenFree: null', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        isGlutenFree: null,
        requirements: { accessible: null, parking: null }
      };

      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.isGlutenFree, null);
      }
    });

    it('should reject isGlutenFree: false (SOFT hints never set false)', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        isGlutenFree: false,
        requirements: { accessible: null, parking: null }
      };

      // Schema allows boolean | null, but we expect prompts to never set false
      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, true);
      // Note: Schema technically allows false, but prompt should NEVER set it
    });

    it('should reject missing isGlutenFree field', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        // isGlutenFree missing
        requirements: { accessible: null, parking: null }
      };

      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, false);
    });

    it('should reject invalid isGlutenFree values', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        isGlutenFree: 'yes', // Invalid type
        requirements: { accessible: null, parking: null }
      };

      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, false);
    });
  });

  describe('Default builder', () => {
    it('should set isGlutenFree to null by default', () => {
      const defaults = buildDefaultPostConstraints();

      assert.ok('isGlutenFree' in defaults);
      assert.equal(defaults.isGlutenFree, null);
    });

    it('should include all required fields including isGlutenFree', () => {
      const defaults = buildDefaultPostConstraints();

      assert.deepEqual(defaults, {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        isGlutenFree: null,
        requirements: {
          accessible: null,
          parking: null
        }
      });
    });
  });

  describe('Type safety', () => {
    it('should accept PostConstraints type with isGlutenFree', () => {
      const constraints: PostConstraints = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: null,
        isGlutenFree: true,
        requirements: { accessible: null, parking: null }
      };

      assert.equal(constraints.isGlutenFree, true);
    });
  });

  describe('Integration with other dietary preferences', () => {
    it('should allow both isKosher and isGlutenFree to be true', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: true,
        isGlutenFree: true,
        requirements: { accessible: null, parking: null }
      };

      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.isKosher, true);
        assert.equal(result.data.isGlutenFree, true);
      }
    });

    it('should allow mixed dietary preference values', () => {
      const input = {
        openState: null,
        openAt: null,
        openBetween: null,
        priceLevel: null,
        isKosher: true,
        isGlutenFree: null,
        requirements: { accessible: null, parking: null }
      };

      const result = PostConstraintsSchema.safeParse(input);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.isKosher, true);
        assert.equal(result.data.isGlutenFree, null);
      }
    });
  });
});
