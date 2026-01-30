/**
 * Relax Policy Tests
 * 
 * Tests for relaxIfTooFew() pure function
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { relaxIfTooFew, canRelaxFurther, type RelaxResult } from '../relax-policy.js';
import type { FinalSharedFilters } from '../../shared/shared-filters.types.js';

describe('Relax Policy - No Relaxation Needed', () => {
  it('should NOT relax when enough candidates available', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: 'CHEAP',
      minRatingBucket: 'R40',
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(10, filters, 0, 5);

    assert.strictEqual(result.relaxed, false);
    assert.strictEqual(result.steps.length, 0);
    assert.deepStrictEqual(result.nextFilters, filters);
  });

  it('should NOT relax when max attempts reached', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(2, filters, 2, 5); // attempt=2 (max)

    assert.strictEqual(result.relaxed, false);
    assert.strictEqual(result.steps.length, 0);
  });
});

describe('Relax Policy - Step 1: Opening Hours', () => {
  it('should relax openState=OPEN_NOW first', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: 'CHEAP',
      minRatingBucket: 'R40',
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(3, filters, 0, 5);

    assert.strictEqual(result.relaxed, true);
    assert.strictEqual(result.steps.length, 1);
    assert.strictEqual(result.steps[0].field, 'openState');
    assert.strictEqual(result.steps[0].from, 'OPEN_NOW');
    assert.strictEqual(result.steps[0].to, null);
    assert.strictEqual(result.steps[0].reason, 'too_few_open_now_results');
    assert.strictEqual(result.nextFilters.openState, null);
  });

  it('should relax openAt if present (no openState)', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: { day: 1, timeHHmm: '12:00', timezone: null },
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(2, filters, 0, 5);

    assert.strictEqual(result.relaxed, true);
    assert.strictEqual(result.steps[0].field, 'openAt');
    assert.strictEqual(result.nextFilters.openAt, null);
  });

  it('should relax openBetween if present (no openState/openAt)', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: { day: 5, startHHmm: '18:00', endHHmm: '22:00', timezone: null },
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(1, filters, 0, 5);

    assert.strictEqual(result.relaxed, true);
    assert.strictEqual(result.steps[0].field, 'openBetween');
    assert.strictEqual(result.nextFilters.openBetween, null);
  });
});

describe('Relax Policy - Step 2: Dietary Filters', () => {
  it('should relax isKosher when no opening hour filters', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      isKosher: true
    } as any;

    const result = relaxIfTooFew(3, filters, 0, 5);

    assert.strictEqual(result.relaxed, true);
    assert.strictEqual(result.steps.length, 1);
    assert.strictEqual(result.steps[0].field, 'isKosher');
    assert.strictEqual(result.steps[0].from, true);
    assert.strictEqual(result.steps[0].to, null);
    assert.strictEqual((result.nextFilters as any).isKosher, null);
  });

  it('should relax isGlutenFree when no opening hour filters and no kosher', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      isKosher: null,
      isGlutenFree: true
    } as any;

    const result = relaxIfTooFew(2, filters, 0, 5);

    assert.strictEqual(result.relaxed, true);
    assert.strictEqual(result.steps[0].field, 'isGlutenFree');
    assert.strictEqual((result.nextFilters as any).isGlutenFree, null);
  });
});

describe('Relax Policy - Step 3: Rating', () => {
  it('should relax minRatingBucket as last resort', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: 'R45',
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(3, filters, 0, 5);

    assert.strictEqual(result.relaxed, true);
    assert.strictEqual(result.steps.length, 1);
    assert.strictEqual(result.steps[0].field, 'minRatingBucket');
    assert.strictEqual(result.steps[0].from, 'R45');
    assert.strictEqual(result.steps[0].to, null);
    assert.strictEqual(result.nextFilters.minRatingBucket, null);
  });
});

describe('Relax Policy - Multiple Attempts', () => {
  it('should NOT relax anything when no filters are restrictive', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null
    };

    const result = relaxIfTooFew(2, filters, 0, 5);

    assert.strictEqual(result.relaxed, false);
    assert.strictEqual(result.steps.length, 0);
  });

  it('should relax openState first, then dietary on second attempt', () => {
    // First attempt: relax openState
    const filters1: FinalSharedFilters = {
      language: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      isKosher: true
    } as any;

    const result1 = relaxIfTooFew(3, filters1, 0, 5);

    assert.strictEqual(result1.relaxed, true);
    assert.strictEqual(result1.steps[0].field, 'openState');
    assert.strictEqual(result1.nextFilters.openState, null);

    // Second attempt: relax isKosher
    const result2 = relaxIfTooFew(3, result1.nextFilters, 1, 5);

    assert.strictEqual(result2.relaxed, true);
    assert.strictEqual(result2.steps[0].field, 'isKosher');
    assert.strictEqual((result2.nextFilters as any).isKosher, null);
  });
});

describe('Relax Policy - canRelaxFurther', () => {
  it('should return true when openState=OPEN_NOW', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null
    };

    assert.strictEqual(canRelaxFurther(filters), true);
  });

  it('should return true when dietary filters present', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: null,
      minReviewCountBucket: null,
      isKosher: true
    } as any;

    assert.strictEqual(canRelaxFurther(filters), true);
  });

  it('should return true when minRatingBucket present', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: null,
      minRatingBucket: 'R40',
      minReviewCountBucket: null
    };

    assert.strictEqual(canRelaxFurther(filters), true);
  });

  it('should return false when no relaxable filters present', () => {
    const filters: FinalSharedFilters = {
      language: 'he',
      openState: null,
      openAt: null,
      openBetween: null,
      regionCode: 'IL',
      priceIntent: 'CHEAP', // Not relaxed by policy
      minRatingBucket: null,
      minReviewCountBucket: null
    };

    assert.strictEqual(canRelaxFurther(filters), false);
  });
});
