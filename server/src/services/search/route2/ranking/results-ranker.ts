/**
 * Deterministic Results Ranker
 * 
 * Scores and sorts restaurant results based on ranking weights.
 * Deterministic and stable - same inputs always produce same outputs.
 */

import type { RankingWeights } from './ranking-profile.schema.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { ScoreNormalizer } from './ranking.score-normalizer.js';
import { DistanceCalculator } from './ranking.distance-calculator.js';
import { RankingInvariantEnforcer, type RankingContext } from './ranking.invariant-enforcer.js';

// Instantiate utilities (stateless, can be shared)
const scoreNormalizer = new ScoreNormalizer();
const distanceCalculator = new DistanceCalculator();

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
  cuisineKey?: string | null;
  openNowRequested?: boolean | null;
  requestId?: string;
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
 * Enforce ranking invariants: missing intent => no scoring component
 * 
 * Policy B: If a signal is not present, its weight must be 0.
 * 
 * This is now a WRAPPER around RankingInvariantEnforcer for backward compatibility.
 * All enforcement logic has been extracted to the enforcer class.
 * 
 * @param weights - Original weights from profile selection
 * @param hasUserLocation - Whether user location is available
 * @param cuisineKey - Cuisine intent (null if no cuisine filter)
 * @param openNowRequested - Whether open-now filter is active
 * @param hasCuisineScores - Whether any results have cuisineScore
 * @param requestId - Request ID for logging
 * @param shouldLog - Whether to log invariant application (default: false, controlled by caller)
 * @returns Adjusted weights with invariants enforced
 */
export function enforceRankingInvariants(
  weights: RankingWeights,
  hasUserLocation: boolean,
  cuisineKey: string | null | undefined,
  openNowRequested: boolean | null | undefined,
  hasCuisineScores: boolean,
  requestId?: string,
  shouldLog?: boolean
): RankingWeights {
  // Build context for enforcer
  const context: RankingContext = {
    hasUserLocation,
    cuisineKey,
    openNowRequested,
    hasCuisineScores,
    requestId
  };

  // Delegate to the invariant enforcer
  const result = RankingInvariantEnforcer.enforce(weights, context);

  // Log when invariants are applied (ONLY if shouldLog is true)
  if (result.violations.length > 0 && requestId && shouldLog) {
    const appliedRules = RankingInvariantEnforcer.toLegacyFormat(result);
    
    logger.info({
      requestId,
      event: 'ranking_invariant_applied',
      rules: appliedRules,
      baseWeights: weights,
      finalWeights: result.enforcedWeights
    }, `[RANKING] Invariants applied: ${result.appliedRules.join(', ')}`);
  }

  return result.enforcedWeights;
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
  const { weights, userLocation, cuisineKey, openNowRequested, requestId } = options;

  // CRITICAL: Invariants are now enforced by CALLER (orchestrator.ranking.ts)
  // This function receives ALREADY-ADJUSTED weights (effectiveWeights)
  // NO invariant enforcement here to avoid duplicate logging

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
 * @param cuisineKey - Cuisine intent (for invariant enforcement)
 * @param openNowRequested - Whether open-now filter is active (for invariant enforcement)
 * @returns Score breakdown with all components
 */
export function computeScoreBreakdown(
  result: RankableResult,
  weights: RankingWeights,
  userLocation?: UserLocation | null,
  cuisineKey?: string | null,
  openNowRequested?: boolean | null,
  requestId?: string
): ScoreBreakdown {
  // Build context for invariant enforcement
  const hasCuisineScore = result.cuisineScore !== undefined && result.cuisineScore !== null;
  const context: RankingContext = {
    hasUserLocation: !!userLocation,
    cuisineKey,
    openNowRequested,
    hasCuisineScores: hasCuisineScore,
    requestId
  };

  // Enforce invariants (without logging - this is for breakdown analysis)
  const enforcementResult = RankingInvariantEnforcer.enforce(weights, context);
  const effectiveWeights = enforcementResult.enforcedWeights;

  // Rating normalized (0-1)
  const ratingNorm = scoreNormalizer.normalizeRating(result.rating);

  // Reviews normalized (log scale, 0-1)
  const reviewsNorm = scoreNormalizer.normalizeReviews(result.userRatingsTotal);

  // Distance normalized (0-1, higher score for closer places)
  let distanceNorm = 0;
  let distanceMeters: number | null = null;
  if (userLocation && result.location) {
    const distanceKm = distanceCalculator.haversine(
      userLocation.lat,
      userLocation.lng,
      result.location.lat,
      result.location.lng
    );
    distanceNorm = scoreNormalizer.normalizeDistance(distanceKm);
    distanceMeters = Math.round(distanceKm * 1000); // Convert km to meters
  }

  // Open/closed normalized (0-1)
  const openNorm = scoreNormalizer.normalizeOpen(result.openNow);

  // Cuisine match normalized (0-1, already normalized from enforcer)
  // Invariant enforcement in effectiveWeights ensures cuisineMatch weight is 0 if no cuisineKey/score
  const cuisineNorm = result.cuisineScore ?? 0;

  // Compute component scores (weighted)
  const ratingScore = effectiveWeights.rating * ratingNorm;
  const reviewsScore = effectiveWeights.reviews * reviewsNorm;
  const distanceScore = effectiveWeights.distance * distanceNorm;
  const openBoostScore = effectiveWeights.openBoost * openNorm;
  const cuisineMatchScore = (effectiveWeights.cuisineMatch || 0) * cuisineNorm;

  // Total score
  const totalScore = ratingScore + reviewsScore + distanceScore + openBoostScore + cuisineMatchScore;

  return {
    placeId: (result as any).placeId || (result as any).id || 'unknown',
    rating: result.rating ?? null,
    userRatingCount: result.userRatingsTotal ?? null,
    distanceMeters,
    openNow: result.openNow ?? null,
    cuisineScore: result.cuisineScore ?? null,
    weights: effectiveWeights,
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
  const ratingNorm = scoreNormalizer.normalizeRating(result.rating);

  // Reviews normalized (log scale, 0-1)
  // log10(1000+1) ≈ 3, so we divide by 5 to get ~0.6 for 1000 reviews
  const reviewsNorm = scoreNormalizer.normalizeReviews(result.userRatingsTotal);

  // Distance normalized (0-1, higher score for closer places)
  let distanceNorm = 0;
  if (userLocation && result.location) {
    const distanceKm = distanceCalculator.haversine(
      userLocation.lat,
      userLocation.lng,
      result.location.lat,
      result.location.lng
    );
    distanceNorm = scoreNormalizer.normalizeDistance(distanceKm);
  }

  // Open/closed normalized (0-1)
  const openNorm = scoreNormalizer.normalizeOpen(result.openNow);

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

