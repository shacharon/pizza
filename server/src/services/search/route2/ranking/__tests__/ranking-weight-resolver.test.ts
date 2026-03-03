/**
 * Unit tests for resolveRankingWeights (dynamic ranking weight resolver)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveRankingWeights } from '../ranking-weight-resolver.js';
import { BASELINE_WEIGHTS } from '../ranking-apply.js';

const baseline = { ...BASELINE_WEIGHTS };

function intent(overrides: { route?: string; reason?: string } = {}) {
  return {
    route: 'TEXTSEARCH',
    confidence: 0.9,
    reason: 'default_textsearch',
    language: 'he' as const,
    regionCandidate: 'IL',
    regionConfidence: 0.9,
    regionReason: '',
    ...overrides
  };
}

function finalFilters(overrides: Record<string, unknown> = {}) {
  return {
    uiLanguage: 'he' as const,
    providerLanguage: 'he' as const,
    openState: null as string | null,
    openAt: null,
    openBetween: null,
    priceIntent: null as string | null,
    priceLevels: null as number[] | null,
    regionCode: 'IL',
    disclaimers: { hours: true, dietary: true },
    ...overrides
  };
}

function postConstraints(overrides: Record<string, unknown> = {}) {
  return {
    openState: null,
    openAt: null,
    openBetween: null,
    priceLevel: null,
    isKosher: null,
    isGlutenFree: null,
    requirements: { accessible: null, parking: null },
    ...overrides
  };
}

describe('resolveRankingWeights', () => {
  it('no signals → weights unchanged', () => {
    const result = resolveRankingWeights({
      intent: intent(),
      finalFilters: finalFilters(),
      postConstraints: postConstraints(),
      baselineWeights: baseline
    });
    assert.deepStrictEqual(result.appliedSignals, []);
    assert.strictEqual(result.finalWeights.rating, baseline.rating);
    assert.strictEqual(result.finalWeights.openNow, baseline.openNow);
    assert.strictEqual(result.finalWeights.priceFit, baseline.priceFit);
    assert.strictEqual(result.finalWeights.distanceMeters, baseline.distanceMeters);
    const sum = result.finalWeights.rating + result.finalWeights.reviewCountSocialProof +
      result.finalWeights.distanceMeters + result.finalWeights.openNow + result.finalWeights.priceFit;
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum should be 1, got ${sum}`);
  });

  it('open requested → openNow increases', () => {
    const result = resolveRankingWeights({
      intent: intent(),
      finalFilters: finalFilters({ openState: 'OPEN_NOW' }),
      postConstraints: postConstraints(),
      baselineWeights: baseline
    });
    assert.ok(result.appliedSignals.includes('openState'));
    assert.ok(result.finalWeights.openNow > baseline.openNow);
    const sum = result.finalWeights.rating + result.finalWeights.reviewCountSocialProof +
      result.finalWeights.distanceMeters + result.finalWeights.openNow + result.finalWeights.priceFit;
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum should be 1, got ${sum}`);
  });

  it('price requested → priceFit increases', () => {
    const result = resolveRankingWeights({
      intent: intent(),
      finalFilters: finalFilters({ priceIntent: 'CHEAP', priceLevels: [1, 2] }),
      postConstraints: postConstraints(),
      baselineWeights: baseline
    });
    assert.ok(result.appliedSignals.includes('price'));
    assert.ok(result.finalWeights.priceFit > baseline.priceFit);
    const sum = result.finalWeights.rating + result.finalWeights.reviewCountSocialProof +
      result.finalWeights.distanceMeters + result.finalWeights.openNow + result.finalWeights.priceFit;
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum should be 1, got ${sum}`);
  });

  it('distance requested → distanceMeters increases (NEARBY route)', () => {
    const result = resolveRankingWeights({
      intent: intent({ route: 'NEARBY' }),
      finalFilters: finalFilters(),
      postConstraints: postConstraints(),
      baselineWeights: baseline
    });
    assert.ok(result.appliedSignals.includes('distance'));
    assert.ok(result.finalWeights.distanceMeters > baseline.distanceMeters);
    const sum = result.finalWeights.rating + result.finalWeights.reviewCountSocialProof +
      result.finalWeights.distanceMeters + result.finalWeights.openNow + result.finalWeights.priceFit;
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum should be 1, got ${sum}`);
  });

  it('distance requested → distanceMeters increases (near_me_phrase reason)', () => {
    const result = resolveRankingWeights({
      intent: intent({ route: 'TEXTSEARCH', reason: 'near_me_phrase' }),
      finalFilters: finalFilters(),
      postConstraints: postConstraints(),
      baselineWeights: baseline
    });
    assert.ok(result.appliedSignals.includes('distance'));
    assert.ok(result.finalWeights.distanceMeters > baseline.distanceMeters);
  });

  it('normalization sum = 1', () => {
    const result = resolveRankingWeights({
      intent: intent({ route: 'NEARBY' }),
      finalFilters: finalFilters({ openState: 'OPEN_NOW', priceIntent: 'CHEAP' }),
      postConstraints: postConstraints({ priceLevel: 2 }),
      baselineWeights: baseline
    });
    const sum = result.finalWeights.rating + result.finalWeights.reviewCountSocialProof +
      result.finalWeights.distanceMeters + result.finalWeights.openNow + result.finalWeights.priceFit;
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum should be 1, got ${sum}`);
  });
});
