/**
 * Deterministic Results Ranker
 * 
 * Scores and sorts restaurant results based on ranking weights.
 * Deterministic and stable - same inputs always produce same outputs.
 */

import type { RankingWeights } from './ranking-profile.schema.js';

/**
 * User Location for Distance Calculation
 */
export interface UserLocation {
  lat: number;
  lng: number;
}

/**
 * Ranking Options
 */
export interface RankingOptions {
  weights: RankingWeights;
  userLocation?: UserLocation | null;
}

/**
 * Restaurant Result (subset of fields needed for ranking)
 */
interface RankableResult {
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean | 'UNKNOWN';
  location?: {
    lat: number;
    lng: number;
  };
  cuisineScore?: number; // NEW: Cuisine match score from enforcer (0-1)
  [key: string]: any; // Allow other fields to pass through
}

/**
 * Scored Result (internal)
 */
interface ScoredResult extends RankableResult {
  __rankingScore: number;
  __googleIndex: number;
}

/**
 * Rank restaurant results deterministically
 * 
 * @param results - Array of restaurant results from Google
 * @param options - Ranking weights and user location
 * @returns Sorted array of results (highest score first)
 */
export function rankResults(
  results: RankableResult[],
  options: RankingOptions
): RankableResult[] {
  const { weights, userLocation } = options;

  // Capture original Google index for stable tie-breaking
  const scoredResults: ScoredResult[] = results.map((result, index) => ({
    ...result,
    __rankingScore: computeScore(result, weights, userLocation),
    __googleIndex: index
  }));

  // Sort by score (desc), then rating (desc), then reviews (desc), then googleIndex (asc)
  scoredResults.sort((a, b) => {
    // Primary: score descending
    if (a.__rankingScore !== b.__rankingScore) {
      return b.__rankingScore - a.__rankingScore;
    }

    // Tie-breaker 1: rating descending
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    if (ratingA !== ratingB) {
      return ratingB - ratingA;
    }

    // Tie-breaker 2: review count descending
    const reviewsA = a.userRatingsTotal ?? 0;
    const reviewsB = b.userRatingsTotal ?? 0;
    if (reviewsA !== reviewsB) {
      return reviewsB - reviewsA;
    }

    // Final tie-breaker: original Google index ascending (preserve Google's order)
    return a.__googleIndex - b.__googleIndex;
  });

  // Remove internal ranking metadata and return clean results
  return scoredResults.map(({ __rankingScore, __googleIndex, ...result }) => result);
}

/**
 * Score Breakdown for a single result (for logging/debugging)
 */
export interface ScoreBreakdown {
  placeId: string;
  rating: number | null;
  userRatingCount: number | null;
  distanceMeters: number | null;
  openNow: boolean | 'UNKNOWN' | null;
  cuisineScore: number | null; // NEW
  weights: RankingWeights;
  components: {
    ratingScore: number;
    reviewsScore: number;
    distanceScore: number;
    openBoostScore: number;
    cuisineMatchScore: number; // NEW
  };
  totalScore: number;
}

/**
 * Compute score breakdown for a single result (for logging)
 * 
 * @param result - Restaurant result
 * @param weights - Ranking weights
 * @param userLocation - User location for distance calculation
 * @returns Score breakdown with all components
 */
export function computeScoreBreakdown(
  result: RankableResult,
  weights: RankingWeights,
  userLocation?: UserLocation | null
): ScoreBreakdown {
  // Rating normalized (0-1)
  const ratingNorm = clamp((result.rating ?? 0) / 5, 0, 1);

  // Reviews normalized (log scale, 0-1)
  const reviewsNorm = clamp(Math.log10((result.userRatingsTotal ?? 0) + 1) / 5, 0, 1);

  // Distance normalized (0-1, higher score for closer places)
  let distanceNorm = 0;
  let distanceMeters: number | null = null;
  if (userLocation && result.location) {
    const distanceKm = haversineDistance(
      userLocation.lat,
      userLocation.lng,
      result.location.lat,
      result.location.lng
    );
    distanceNorm = 1 / (1 + distanceKm);
    distanceMeters = Math.round(distanceKm * 1000); // Convert km to meters
  }

  // Open/closed normalized (0-1)
  let openNorm = 0.5; // Default for unknown
  if (result.openNow === true) {
    openNorm = 1;
  } else if (result.openNow === false) {
    openNorm = 0;
  }

  // Cuisine match normalized (0-1, already normalized from enforcer)
  const cuisineNorm = result.cuisineScore ?? 0.5; // Default 0.5 if no score

  // Compute component scores (weighted)
  const ratingScore = weights.rating * ratingNorm;
  const reviewsScore = weights.reviews * reviewsNorm;
  const distanceScore = weights.distance * distanceNorm;
  const openBoostScore = weights.openBoost * openNorm;
  const cuisineMatchScore = (weights.cuisineMatch || 0) * cuisineNorm;

  // Total score
  const totalScore = ratingScore + reviewsScore + distanceScore + openBoostScore + cuisineMatchScore;

  return {
    placeId: (result as any).placeId || (result as any).id || 'unknown',
    rating: result.rating ?? null,
    userRatingCount: result.userRatingsTotal ?? null,
    distanceMeters,
    openNow: result.openNow ?? null,
    cuisineScore: result.cuisineScore ?? null,
    weights,
    components: {
      ratingScore: Math.round(ratingScore * 1000) / 1000, // 3 decimals
      reviewsScore: Math.round(reviewsScore * 1000) / 1000,
      distanceScore: Math.round(distanceScore * 1000) / 1000,
      openBoostScore: Math.round(openBoostScore * 1000) / 1000,
      cuisineMatchScore: Math.round(cuisineMatchScore * 1000) / 1000
    },
    totalScore: Math.round(totalScore * 1000) / 1000
  };
}

/**
 * Compute deterministic score for a single result
 * 
 * Score = w.rating * ratingNorm + w.reviews * reviewsNorm + w.distance * distanceNorm + w.openBoost * openNorm + w.cuisineMatch * cuisineNorm
 * 
 * Normalization:
 * - ratingNorm: rating / 5 (clamped 0-1)
 * - reviewsNorm: log10(reviews + 1) / 5 (clamped 0-1)
 * - distanceNorm: 1 / (1 + distanceKm) if user location available, else 0
 * - openNorm: 1 if open, 0 if closed, 0.5 if unknown
 * - cuisineNorm: cuisineScore from enforcer (0-1), defaults to 0.5 if missing
 */
function computeScore(
  result: RankableResult,
  weights: RankingWeights,
  userLocation?: UserLocation | null
): number {
  // Rating normalized (0-1)
  const ratingNorm = clamp((result.rating ?? 0) / 5, 0, 1);

  // Reviews normalized (log scale, 0-1)
  // log10(1000+1) ≈ 3, so we divide by 5 to get ~0.6 for 1000 reviews
  const reviewsNorm = clamp(Math.log10((result.userRatingsTotal ?? 0) + 1) / 5, 0, 1);

  // Distance normalized (0-1, higher score for closer places)
  let distanceNorm = 0;
  if (userLocation && result.location) {
    const distanceKm = haversineDistance(
      userLocation.lat,
      userLocation.lng,
      result.location.lat,
      result.location.lng
    );
    distanceNorm = 1 / (1 + distanceKm);
  }

  // Open/closed normalized (0-1)
  let openNorm = 0.5; // Default for unknown
  if (result.openNow === true) {
    openNorm = 1;
  } else if (result.openNow === false) {
    openNorm = 0;
  }

  // Cuisine match normalized (0-1, from enforcer)
  const cuisineNorm = result.cuisineScore ?? 0.5; // Default 0.5 if no score

  // Compute weighted score
  const score =
    weights.rating * ratingNorm +
    weights.reviews * reviewsNorm +
    weights.distance * distanceNorm +
    weights.openBoost * openNorm +
    (weights.cuisineMatch || 0) * cuisineNorm;

  return score;
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate Haversine distance between two coordinates (in km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
