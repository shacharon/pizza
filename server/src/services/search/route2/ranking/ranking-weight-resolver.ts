/**
 * Dynamic Ranking Weight Resolver – Route2
 * Resolves final weights from baseline + intent/filters/post-constraints signals.
 * Sum of weights is always normalized to 1.0.
 */

import type { IntentResult } from '../types.js';
import type { FinalSharedFilters } from '../shared/shared-filters.types.js';
import type { PostConstraints } from '../shared/post-constraints.types.js';

/** Weights shape used by baseline ranking (must match ranking-apply). */
export interface RankingWeights {
  rating: number;
  reviewCountSocialProof: number;
  distanceMeters: number;
  openNow: number;
  priceFit: number;
}

export interface ResolveRankingWeightsParams {
  intent: IntentResult;
  finalFilters: FinalSharedFilters;
  postConstraints?: PostConstraints | null;
  baselineWeights: RankingWeights;
}

export interface ResolveRankingWeightsResult {
  finalWeights: RankingWeights;
  appliedSignals: string[];
}

const OPEN_SIGNALS: (string | null)[] = ['OPEN_NOW', 'OPEN_AT', 'OPEN_BETWEEN'];
const DISTANCE_REASONS = ['near_me_phrase', 'explicit_distance_from_me'];

/** Additive boost per signal (before normalize). Tuned so normalized sum stays 1. */
const BOOST_OPEN = 0.06;
const BOOST_PRICE = 0.05;
const BOOST_DISTANCE = 0.06;

/**
 * Resolve final ranking weights from baseline and query/filter signals.
 * If no signals → returns baseline unchanged. Otherwise applies boosts and normalizes to sum = 1.
 */
export function resolveRankingWeights(params: ResolveRankingWeightsParams): ResolveRankingWeightsResult {
  const { intent, finalFilters, postConstraints, baselineWeights } = params;
  const appliedSignals: string[] = [];
  const w = { ...baselineWeights };

  // openState (OPEN_NOW / OPEN_AT / OPEN_BETWEEN) → increase openNow
  const openState = finalFilters.openState ?? postConstraints?.openState ?? null;
  if (openState != null && OPEN_SIGNALS.includes(openState)) {
    w.openNow += BOOST_OPEN;
    appliedSignals.push('openState');
  }

  // priceIntent / priceLevels / priceLevel → increase priceFit
  const hasPriceIntent = finalFilters.priceIntent != null;
  const hasPriceLevels = Array.isArray(finalFilters.priceLevels) && finalFilters.priceLevels.length > 0;
  const hasPriceLevel = postConstraints?.priceLevel != null;
  if (hasPriceIntent || hasPriceLevels || hasPriceLevel) {
    w.priceFit += BOOST_PRICE;
    appliedSignals.push('price');
  }

  // route NEARBY or reason implying distance → increase distanceMeters
  const routeNearby = intent.route === 'NEARBY';
  const reasonDistance = intent.reason != null && DISTANCE_REASONS.includes(intent.reason);
  if (routeNearby || reasonDistance) {
    w.distanceMeters += BOOST_DISTANCE;
    appliedSignals.push('distance');
  }

  if (appliedSignals.length === 0) {
    return { finalWeights: { ...baselineWeights }, appliedSignals: [] };
  }

  const sum = w.rating + w.reviewCountSocialProof + w.distanceMeters + w.openNow + w.priceFit;
  if (sum <= 0) {
    return { finalWeights: { ...baselineWeights }, appliedSignals };
  }
  const finalWeights: RankingWeights = {
    rating: w.rating / sum,
    reviewCountSocialProof: w.reviewCountSocialProof / sum,
    distanceMeters: w.distanceMeters / sum,
    openNow: w.openNow / sum,
    priceFit: w.priceFit / sum
  };
  return { finalWeights, appliedSignals };
}
