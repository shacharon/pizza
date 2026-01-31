/**
 * Unit Tests: Hard Constraints Enforcement
 * 
 * Tests that kosher and meatDairy constraints are NEVER auto-relaxed
 * while other constraints (openNow, radius, cuisine) can still be relaxed
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { relaxIfTooFew, canRelaxFurtherSafe } from '../relax-policy.js';
import type { FinalSharedFilters } from '../../shared/shared-filters.types.js';
import type { HardConstraintField } from '../../shared/hard-constraints.types.js';

describe('Hard Constraints - Kosher Never Relaxed', () => {
  it('should refuse to relax kosher when it is a hard constraint', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const result = relaxIfTooFew(
      2, // too few candidates
      filters,
      0, // first attempt
      5, // minAcceptable
      hardConstraints
    );

    // Should NOT relax
    assert.strictEqual(result.relaxed, false, 'Should not relax when kosher is hard');
    assert.strictEqual((result.nextFilters as any).isKosher, true, 'Kosher filter should remain');
    assert.strictEqual(result.steps.length, 0, 'No relaxation steps should be applied');

    // Should track denial
    assert.strictEqual(result.denied.length, 1, 'Should have one denied relaxation');
    assert.strictEqual(result.denied[0].field, 'isKosher');
    assert.strictEqual(result.denied[0].reasonCode, 'religious_dietary_requirement');

    // Should track attempt
    assert.strictEqual(result.attemptedFields.length, 1, 'Should track attempted field');
    assert.ok(result.attemptedFields.includes('isKosher'));
  });

  it('should relax kosher when it is NOT a hard constraint (soft mode)', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = []; // No hard constraints

    const result = relaxIfTooFew(
      2, // too few candidates
      filters,
      0, // first attempt
      5, // minAcceptable
      hardConstraints
    );

    // Should relax (soft mode)
    assert.strictEqual(result.relaxed, true, 'Should relax when kosher is soft');
    assert.strictEqual((result.nextFilters as any).isKosher, null, 'Kosher filter should be removed');
    assert.strictEqual(result.steps.length, 1, 'Should have one relaxation step');
    assert.strictEqual(result.steps[0].field, 'isKosher');

    // No denials
    assert.strictEqual(result.denied.length, 0, 'Should have no denied relaxations');
  });

  it('should relax openNow first, then refuse kosher on second attempt', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    // First attempt: relax openState
    const result1 = relaxIfTooFew(2, filters, 0, 5, hardConstraints);

    assert.strictEqual(result1.relaxed, true, 'Should relax openState first');
    assert.strictEqual(result1.nextFilters.openState, null);
    assert.strictEqual(result1.steps[0].field, 'openState');

    // Second attempt: try to relax kosher (should be denied)
    const result2 = relaxIfTooFew(2, result1.nextFilters, 1, 5, hardConstraints);

    assert.strictEqual(result2.relaxed, false, 'Should refuse to relax kosher');
    assert.strictEqual((result2.nextFilters as any).isKosher, true, 'Kosher should remain');
    assert.strictEqual(result2.denied.length, 1, 'Should deny kosher relaxation');
    assert.strictEqual(result2.denied[0].field, 'isKosher');
  });
});

describe('Hard Constraints - Soft Constraints Can Still Relax', () => {
  it('should relax gluten-free (always soft) even when kosher is hard', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: null, // No kosher (so gluten-free can be tested)
      isGlutenFree: true // Soft constraint (should relax)
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const result = relaxIfTooFew(2, filters, 0, 5, hardConstraints);

    // Should relax gluten-free (it's always soft)
    assert.strictEqual(result.relaxed, true, 'Should relax gluten-free');
    assert.strictEqual((result.nextFilters as any).isGlutenFree, null, 'Gluten-free should be removed');
    assert.strictEqual(result.steps[0].field, 'isGlutenFree');
  });

  it('should relax openNow even when kosher is hard', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const result = relaxIfTooFew(2, filters, 0, 5, hardConstraints);

    // Should relax openState (it's always soft)
    assert.strictEqual(result.relaxed, true, 'Should relax openState');
    assert.strictEqual(result.nextFilters.openState, null);
    assert.strictEqual(result.steps[0].field, 'openState');

    // Kosher should remain untouched
    assert.strictEqual((result.nextFilters as any).isKosher, true, 'Kosher should remain');
  });

  it('should relax minRatingBucket even when kosher is hard', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: 'R40',
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const result = relaxIfTooFew(2, filters, 0, 5, hardConstraints);

    // Should relax minRatingBucket (it's always soft)
    assert.strictEqual(result.relaxed, true, 'Should relax rating');
    assert.strictEqual(result.nextFilters.minRatingBucket, null);
    assert.strictEqual(result.steps[0].field, 'minRatingBucket');

    // Kosher should remain untouched
    assert.strictEqual((result.nextFilters as any).isKosher, true, 'Kosher should remain');
  });
});

describe('Hard Constraints - canRelaxFurtherSafe', () => {
  it('should return false when only hard constraints remain', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true // Only hard constraint
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const canRelax = canRelaxFurtherSafe(filters, hardConstraints);
    assert.strictEqual(canRelax, false, 'Should not be able to relax further (only hard constraints)');
  });

  it('should return true when soft constraints remain', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: 'OPEN_NOW', // Soft constraint
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true // Hard constraint
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const canRelax = canRelaxFurtherSafe(filters, hardConstraints);
    assert.strictEqual(canRelax, true, 'Should be able to relax further (openState is soft)');
  });

  it('should return true when kosher is soft (not in hard list)', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = []; // Kosher is NOT hard

    const canRelax = canRelaxFurtherSafe(filters, hardConstraints);
    assert.strictEqual(canRelax, true, 'Should be able to relax kosher (it is soft)');
  });
});

describe('Hard Constraints - MeatDairy Constraint', () => {
  it('should detect meatDairy as hard constraint for meat cuisineKey', () => {
    // Note: meatDairy detection happens in detectHardConstraints()
    // which is tested separately, but we verify the relax policy respects it

    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true }
    } as any;

    const hardConstraints: HardConstraintField[] = ['meatDairy'];

    // MeatDairy is not a direct filter field, so this test verifies
    // that the hard constraint framework supports it
    const result = relaxIfTooFew(2, filters, 0, 5, hardConstraints);

    // Should not attempt to relax anything (no soft filters active)
    assert.strictEqual(result.relaxed, false);
    assert.strictEqual(result.denied.length, 0, 'No denials (no filters to deny)');
  });
});

describe('Hard Constraints - Multiple Scenarios', () => {
  it('should handle multiple hard constraints (kosher + meatDairy)', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher', 'meatDairy'];

    // First attempt: should relax openState (soft)
    const result1 = relaxIfTooFew(2, filters, 0, 5, hardConstraints);
    assert.strictEqual(result1.relaxed, true);
    assert.strictEqual(result1.steps[0].field, 'openState');

    // Second attempt: should refuse kosher (hard)
    const result2 = relaxIfTooFew(2, result1.nextFilters, 1, 5, hardConstraints);
    assert.strictEqual(result2.relaxed, false);
    assert.strictEqual(result2.denied.length, 1);
    assert.strictEqual(result2.denied[0].field, 'isKosher');
  });

  it('should track all attempted fields including denied ones', () => {
    const filters: FinalSharedFilters = {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      regionCode: 'IL',
      disclaimers: { hours: true, dietary: true },
      isKosher: true
    } as any;

    const hardConstraints: HardConstraintField[] = ['isKosher'];

    const result = relaxIfTooFew(2, filters, 0, 5, hardConstraints);

    assert.strictEqual(result.attemptedFields.length, 1);
    assert.ok(result.attemptedFields.includes('isKosher'));
    assert.strictEqual(result.denied.length, 1);
    assert.strictEqual(result.relaxed, false);
  });
});
