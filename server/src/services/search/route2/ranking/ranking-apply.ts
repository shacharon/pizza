/**
 * Apply soft ranking: compute score (rating + reviews + optional social-proof boost), sort, assign rank/score.
 * Baseline ranking: fixed weights only (no intent-based weighting). Deterministic and unit-testable.
 *
 * Exact baseline formula (weights sum = 1):
 *   totalScore = 0.45 * normRating + 0.25 * normReviewSocial + 0.15 * normDistance + 0.10 * normOpen + 0.05 * normPriceFit
 * where:
 *   normRating     = rating / 5 clamped [0,1]; null => 0
 *   normReviewSocial = min(1, 0.75 * log10(count+1)/5 + 0.25 * min(1, socialBoost/3)); null count => 0
 *   normDistance   = 1/(1+distanceKm) when distanceKm present; else 0.5 (neutral, no penalty)
 *   normOpen       = 1 (open), 0 (closed), 0.5 (unknown)
 *   normPriceFit   = 1 when priceLevel present, 0.5 when missing (neutral)
 */

import { ScoreNormalizer } from './ranking.score-normalizer.js';
import { getSocialProofBoost, type SocialProofBoostWeights, type SocialProofTag } from './social-proof-tags.js';
import { DistanceCalculator } from './ranking.distance-calculator.js';

export interface RankingApplyWeights {
  rating: number;
  reviewCount: number;
  socialProofBoosts?: SocialProofBoostWeights;
}

/** Fixed weights for baseline ranking (no intent). Sum = 1. */
export const BASELINE_WEIGHTS = {
  rating: 0.45,
  reviewCountSocialProof: 0.25,
  distanceMeters: 0.15,
  openNow: 0.1,
  priceFit: 0.05
} as const;

/** Weights shape for ranking (same keys as BASELINE_WEIGHTS). Sum must be 1 when used. */
export type BaselineWeightsLike = {
  rating: number;
  reviewCountSocialProof: number;
  distanceMeters: number;
  openNow: number;
  priceFit: number;
};

const normalizer = new ScoreNormalizer();
const distanceCalculator = new DistanceCalculator();

/** Social proof weights used to normalize boost to [0,1] for baseline (max 3 tags × 1). */
const BASELINE_SOCIAL_WEIGHTS: Record<SocialProofTag, number> = {
  HIDDEN_GEM: 1,
  CROWD_FAVORITE: 1,
  POPULAR_RELIABLE: 1
};

const MAX_SOCIAL_BOOST = 3;

export interface BaselineScoreBreakdown {
  rating: number;
  reviewSocial: number;
  distance: number;
  open: number;
  priceFit: number;
  total: number;
}

export interface BaselineRankingInput {
  rating?: number | null;
  userRatingsTotal?: number | null;
  socialProofTags?: SocialProofTag[] | null;
  openNow?: boolean | 'UNKNOWN' | null;
  priceLevel?: number | null;
  distanceMeters?: number | null;
  location?: { lat: number; lng: number } | null;
}

export interface BaselineRankingOptions {
  userLocation?: { lat: number; lng: number } | null;
  /** When set, use these weights instead of BASELINE_WEIGHTS (e.g. from resolveRankingWeights). Sum should be 1. */
  weights?: BaselineWeightsLike;
}

/**
 * Compute baseline score and breakdown for one result.
 * - distanceMeters missing: use neutral 0.5 (no penalty).
 * - priceLevel missing: priceFit = neutral 0.5.
 * - reviewSocial = blend of normalizeReviews and normalized social-proof boost (weight 0.25).
 * - Uses options.weights when provided (e.g. from resolveRankingWeights), else BASELINE_WEIGHTS.
 */
export function computeBaselineScore(
  result: BaselineRankingInput,
  options?: BaselineRankingOptions
): { totalScore: number; breakdown: BaselineScoreBreakdown } {
  const weights = options?.weights ?? BASELINE_WEIGHTS;
  const rNorm = normalizer.normalizeRating(result.rating);
  const reviewNorm = normalizer.normalizeReviews(result.userRatingsTotal);
  const socialBoost = getSocialProofBoost(result.socialProofTags, BASELINE_SOCIAL_WEIGHTS);
  const socialNorm = Math.min(1, socialBoost / MAX_SOCIAL_BOOST);
  const reviewSocialRaw = Math.min(1, 0.75 * reviewNorm + 0.25 * socialNorm);
  const reviewSocial = weights.reviewCountSocialProof * reviewSocialRaw;

  let distanceNorm = 0.5;
  if (result.distanceMeters != null && typeof result.distanceMeters === 'number' && result.distanceMeters >= 0) {
    distanceNorm = normalizer.normalizeDistance(result.distanceMeters / 1000);
  } else if (options?.userLocation && result.location?.lat != null && result.location?.lng != null) {
    const distanceKm = distanceCalculator.haversine(
      options.userLocation.lat,
      options.userLocation.lng,
      result.location.lat,
      result.location.lng
    );
    distanceNorm = normalizer.normalizeDistance(distanceKm);
  }
  const distance = weights.distanceMeters * distanceNorm;

  const openNorm = normalizer.normalizeOpen(result.openNow);
  const open = weights.openNow * openNorm;

  // priceFit: neutral (0.5) when priceLevel missing; full (1.0) when present (no intent-based preference)
  const priceFitNorm =
    result.priceLevel != null && typeof result.priceLevel === 'number' ? 1.0 : 0.5;
  const priceFit = weights.priceFit * priceFitNorm;

  const rating = weights.rating * rNorm;
  const totalScore = rating + reviewSocial + distance + open + priceFit;

  return {
    totalScore,
    breakdown: {
      rating,
      reviewSocial,
      distance,
      open,
      priceFit,
      total: totalScore
    }
  };
}

/**
 * Apply baseline ranking: score with fixed weights, sort descending, assign score and rank.
 * Does not remove results. Does not attach breakdown to DTO (breakdown for logging only).
 */
export function applyBaselineRanking<T extends Record<string, unknown>>(
  results: T[],
  options?: BaselineRankingOptions
): { results: T[]; top5Breakdown: Array<{ id?: string; name?: string; score: number; breakdown: BaselineScoreBreakdown }> } {
  const withScore = results.map((r) => {
    const { totalScore, breakdown } = computeBaselineScore(r as BaselineRankingInput, options);
    return { result: r, score: totalScore, breakdown };
  });
  withScore.sort((a, b) => b.score - a.score);
  const resultsWithRank = withScore.map(({ result, score }, i) => ({
    ...result,
    score,
    rank: i + 1
  })) as T[];
  const top5Breakdown = withScore.slice(0, 5).map(({ result, score, breakdown }) => {
    const r = result as { id?: string; name?: string };
    return {
      ...(r.id !== undefined && { id: r.id }),
      ...(r.name !== undefined && { name: r.name }),
      score,
      breakdown
    };
  });
  return { results: resultsWithRank, top5Breakdown };
}

/**
 * Compute a single result's base score (rating + reviews) plus optional social-proof boost.
 * Pure function for testing. (Legacy; baseline uses computeBaselineScore.)
 */
export function computeResultScore(
  result: { rating?: number; userRatingsTotal?: number; socialProofTags?: SocialProofTag[] },
  weights: RankingApplyWeights
): number {
  const ratingNorm = normalizer.normalizeRating(result.rating);
  const reviewsNorm = normalizer.normalizeReviews(result.userRatingsTotal);
  const base = ratingNorm * weights.rating + reviewsNorm * weights.reviewCount;
  const boost = getSocialProofBoost(result.socialProofTags, weights.socialProofBoosts);
  return base + boost;
}

/**
 * Apply ranking: score each result, sort by score descending, assign score and rank.
 * Returns the same results in new order; does not filter.
 */
export function applyRankingWithSocialProofBoost<T extends Record<string, unknown>>(
  results: T[],
  weights: RankingApplyWeights
): T[] {
  const withScore = results.map((r) => ({
    result: r,
    score: computeResultScore(
      r as { rating?: number; userRatingsTotal?: number; socialProofTags?: SocialProofTag[] },
      weights
    )
  }));
  withScore.sort((a, b) => b.score - a.score);
  return withScore.map(({ result }, i) => ({
    ...result,
    score: withScore[i]!.score,
    rank: i + 1
  })) as T[];
}
