/**
 * Requery Decision Tests
 * 
 * Tests for shouldRequeryGoogle() pure function
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { shouldRequeryGoogle, type SearchContext, type PoolStats } from '../requery-decision.js';

describe('Requery Decision - First Request', () => {
  it('should require Google call for first request (no prev context)', () => {
    const next: SearchContext = {
      query: 'pizza near me',
      route: 'NEARBY',
      userLocation: { lat: 32.08, lng: 34.78 }
    };

    const decision = shouldRequeryGoogle(null, next, null);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'first_request');
  });
});

describe('Requery Decision - Hard Filter Changes', () => {
  const basePrev: SearchContext = {
    query: 'pizza in Tel Aviv',
    route: 'TEXTSEARCH',
    userLocation: null,
    cityText: 'Tel Aviv',
    regionCode: 'IL'
  };

  const basePoolStats: PoolStats = {
    totalCandidates: 30,
    afterSoftFilters: 25,
    requestedLimit: 10
  };

  it('should require Google call when query changes', () => {
    const next: SearchContext = {
      ...basePrev,
      query: 'sushi in Tel Aviv' // Changed query
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'query_changed');
    assert.strictEqual(decision.changeset?.query, true);
  });

  it('should require Google call when route changes (TEXTSEARCH → NEARBY)', () => {
    const next: SearchContext = {
      ...basePrev,
      route: 'NEARBY', // Changed from TEXTSEARCH
      userLocation: { lat: 32.08, lng: 34.78 }
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'route_changed');
    assert.strictEqual(decision.changeset?.route, true);
  });

  it('should require Google call when city text changes', () => {
    const next: SearchContext = {
      ...basePrev,
      cityText: 'Haifa' // Changed city
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'location_anchor_changed');
    assert.strictEqual(decision.changeset?.location, true);
  });

  it('should require Google call when user location changes significantly (>500m)', () => {
    const prev: SearchContext = {
      ...basePrev,
      userLocation: { lat: 32.08, lng: 34.78 }
    };

    const next: SearchContext = {
      ...basePrev,
      userLocation: { lat: 32.09, lng: 34.79 } // ~1.3km away
    };

    const decision = shouldRequeryGoogle(prev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'location_anchor_changed');
    assert.strictEqual(decision.changeset?.location, true);
  });

  it('should NOT require Google call when user location changes slightly (<500m)', () => {
    const prev: SearchContext = {
      ...basePrev,
      userLocation: { lat: 32.08, lng: 34.78 }
    };

    const next: SearchContext = {
      ...basePrev,
      userLocation: { lat: 32.0802, lng: 34.7802 }, // ~250m away
      openNow: true // Soft filter change
    };

    const decision = shouldRequeryGoogle(prev, next, basePoolStats);

    // Should NOT requery because location change is small and only soft filter changed
    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
  });

  it('should require Google call when radius increases >50%', () => {
    const prev: SearchContext = {
      ...basePrev,
      radiusMeters: 5000
    };

    const next: SearchContext = {
      ...basePrev,
      radiusMeters: 8000 // 60% increase
    };

    const decision = shouldRequeryGoogle(prev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'radius_changed_significantly');
    assert.strictEqual(decision.changeset?.radius, true);
  });

  it('should NOT require Google call when radius increases <50%', () => {
    const prev: SearchContext = {
      ...basePrev,
      radiusMeters: 5000
    };

    const next: SearchContext = {
      ...basePrev,
      radiusMeters: 6000 // 20% increase
    };

    const decision = shouldRequeryGoogle(prev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'no_changes_detected');
  });
});

describe('Requery Decision - Pool Exhaustion', () => {
  const basePrev: SearchContext = {
    query: 'pizza in Tel Aviv',
    route: 'TEXTSEARCH',
    userLocation: null,
    cityText: 'Tel Aviv'
  };

  it('should require Google call when pool is exhausted (0 results after filters)', () => {
    const next: SearchContext = {
      ...basePrev,
      openNow: true // Soft filter change
    };

    const exhaustedPoolStats: PoolStats = {
      totalCandidates: 30,
      afterSoftFilters: 0, // Exhausted!
      requestedLimit: 10
    };

    const decision = shouldRequeryGoogle(basePrev, next, exhaustedPoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'pool_exhausted_after_filters');
  });

  it('should require Google call when pool has too few results (<5)', () => {
    const next: SearchContext = {
      ...basePrev,
      minRatingBucket: 'R45' // Soft filter change
    };

    const tinyPoolStats: PoolStats = {
      totalCandidates: 30,
      afterSoftFilters: 3, // Too few!
      requestedLimit: 10
    };

    const decision = shouldRequeryGoogle(basePrev, next, tinyPoolStats);

    assert.strictEqual(decision.doGoogle, true);
    assert.strictEqual(decision.reason, 'pool_exhausted_after_filters');
  });

  it('should NOT require Google call when pool has sufficient results', () => {
    const next: SearchContext = {
      ...basePrev,
      openNow: true // Soft filter change
    };

    const goodPoolStats: PoolStats = {
      totalCandidates: 30,
      afterSoftFilters: 15, // Plenty!
      requestedLimit: 10
    };

    const decision = shouldRequeryGoogle(basePrev, next, goodPoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
  });
});

describe('Requery Decision - Soft Filter Changes', () => {
  const basePrev: SearchContext = {
    query: 'pizza in Tel Aviv',
    route: 'TEXTSEARCH',
    userLocation: null,
    cityText: 'Tel Aviv'
  };

  const basePoolStats: PoolStats = {
    totalCandidates: 30,
    afterSoftFilters: 20,
    requestedLimit: 10
  };

  it('should NOT require Google call when only openNow changes', () => {
    const next: SearchContext = {
      ...basePrev,
      openNow: true // Soft filter
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
    assert.ok(decision.changeset?.softFilters?.includes('openNow'));
  });

  it('should NOT require Google call when only priceIntent changes', () => {
    const next: SearchContext = {
      ...basePrev,
      priceIntent: 'CHEAP' // Soft filter
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
    assert.ok(decision.changeset?.softFilters?.includes('priceIntent'));
  });

  it('should NOT require Google call when only minRatingBucket changes', () => {
    const next: SearchContext = {
      ...basePrev,
      minRatingBucket: 'R45' // Soft filter
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
    assert.ok(decision.changeset?.softFilters?.includes('minRatingBucket'));
  });

  it('should NOT require Google call when multiple soft filters change', () => {
    const next: SearchContext = {
      ...basePrev,
      openNow: true,
      priceIntent: 'CHEAP',
      minRatingBucket: 'R40',
      isKosher: true
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
    assert.ok(decision.changeset?.softFilters?.includes('openNow'));
    assert.ok(decision.changeset?.softFilters?.includes('priceIntent'));
    assert.ok(decision.changeset?.softFilters?.includes('minRatingBucket'));
    assert.ok(decision.changeset?.softFilters?.includes('isKosher'));
  });

  it('should NOT require Google call when dietary filters change', () => {
    const next: SearchContext = {
      ...basePrev,
      isKosher: true,
      isGlutenFree: true
    };

    const decision = shouldRequeryGoogle(basePrev, next, basePoolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'soft_filters_only');
    assert.ok(decision.changeset?.softFilters?.includes('isKosher'));
    assert.ok(decision.changeset?.softFilters?.includes('isGlutenFree'));
  });
});

describe('Requery Decision - No Changes', () => {
  it('should NOT require Google call when no changes detected', () => {
    const prev: SearchContext = {
      query: 'pizza in Tel Aviv',
      route: 'TEXTSEARCH',
      userLocation: null,
      cityText: 'Tel Aviv',
      openNow: true,
      priceIntent: 'CHEAP'
    };

    const next: SearchContext = { ...prev }; // Identical

    const poolStats: PoolStats = {
      totalCandidates: 30,
      afterSoftFilters: 20,
      requestedLimit: 10
    };

    const decision = shouldRequeryGoogle(prev, next, poolStats);

    assert.strictEqual(decision.doGoogle, false);
    assert.strictEqual(decision.reason, 'no_changes_detected');
  });
});
