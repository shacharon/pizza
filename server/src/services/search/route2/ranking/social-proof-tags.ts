/**
 * Social proof tags – deterministic tags from rating and review count only.
 * No LLM, no Google Details. Pure function, unit-testable.
 */

export type SocialProofTag = 'HIDDEN_GEM' | 'CROWD_FAVORITE' | 'POPULAR_RELIABLE';

/** V1 rules: Hidden Gem (4.5+, 20–250), Crowd Favorite (4.3+, 1000+), Popular & Reliable (4.2+, 300+) */
const HIDDEN_GEM = { minRating: 4.5, minReviews: 20, maxReviews: 250 } as const;
const CROWD_FAVORITE = { minRating: 4.3, minReviews: 1000 } as const;
const POPULAR_RELIABLE = { minRating: 4.2, minReviews: 300 } as const;

/**
 * Compute social proof tags for a place from rating and review count only.
 * Missing or invalid values yield no tags. Deterministic and side-effect free.
 *
 * @param rating - Place rating (e.g. 0–5 from Google)
 * @param reviewCount - userRatingCount / userRatingsTotal
 * @returns Array of tag identifiers (may be empty)
 */
export function computeSocialProofTags(
  rating: number | null | undefined,
  reviewCount: number | null | undefined
): SocialProofTag[] {
  const r = rating ?? null;
  const c = reviewCount ?? null;

  if (r === null || typeof r !== 'number' || !Number.isFinite(r)) return [];
  if (c === null || typeof c !== 'number' || !Number.isFinite(c) || c < 0) return [];

  const tags: SocialProofTag[] = [];

  if (r >= HIDDEN_GEM.minRating && c >= HIDDEN_GEM.minReviews && c <= HIDDEN_GEM.maxReviews) {
    tags.push('HIDDEN_GEM');
  }
  if (r >= CROWD_FAVORITE.minRating && c >= CROWD_FAVORITE.minReviews) {
    tags.push('CROWD_FAVORITE');
  }
  if (r >= POPULAR_RELIABLE.minRating && c >= POPULAR_RELIABLE.minReviews) {
    tags.push('POPULAR_RELIABLE');
  }

  return tags;
}

/** Config for soft boost per tag (optional, additive) */
export type SocialProofBoostWeights = Partial<Record<SocialProofTag, number>>;

/**
 * Compute soft ranking boost from social proof tags (pure).
 * Sums configured boost per tag; missing tags or zero weight => 0.
 */
export function getSocialProofBoost(
  tags: SocialProofTag[] | null | undefined,
  weights: SocialProofBoostWeights | null | undefined
): number {
  if (!Array.isArray(tags) || tags.length === 0 || !weights) return 0;
  return tags.reduce((sum, tag) => sum + (weights[tag] ?? 0), 0);
}
