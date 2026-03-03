/**
 * Apply soft ranking: compute score (rating + reviews + optional social-proof boost), sort, assign rank/score.
 * Does not remove results. Deterministic and unit-testable.
 */

import { ScoreNormalizer } from './ranking.score-normalizer.js';
import { getSocialProofBoost, type SocialProofBoostWeights, type SocialProofTag } from './social-proof-tags.js';

export interface RankingApplyWeights {
  rating: number;
  reviewCount: number;
  socialProofBoosts?: SocialProofBoostWeights;
}

const normalizer = new ScoreNormalizer();

/**
 * Compute a single result's base score (rating + reviews) plus optional social-proof boost.
 * Pure function for testing.
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
