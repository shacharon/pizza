/**
 * Ranking Signals
 * 
 * Deterministic metadata about ranking decisions and result pool state.
 * Produced after post-filters + optional ranking.
 * NO LLM - pure thresholds and logic.
 */

import type { RankingProfile, RankingWeights } from './ranking-profile.schema.js';

/**
 * Dominant factor in ranking
 * Derived from which weight is highest
 */
export type DominantFactor = 'DISTANCE' | 'RATING' | 'REVIEWS' | 'OPEN' | 'NONE';

/**
 * Ranking Signals - Metadata about ranking decisions
 */
export interface RankingSignals {
  profile: RankingProfile;
  dominantFactor: DominantFactor;
  triggers: {
    lowResults: boolean;              // afterFilters <= 10
    relaxUsed: boolean;               // any relaxApplied true
    manyOpenUnknown: boolean;         // unknown/open ratio threshold
    dominatedByOneFactor: boolean;    // maxWeight >= 0.55
  };
  facts: {
    shownNow: number;                 // Results after filters
    totalPool: number;                // Results before filters
    hasUserLocation: boolean;
  };
}

/**
 * Relaxation flags (from post-filter stage)
 */
export interface RelaxationApplied {
  priceIntent?: boolean;
  minRating?: boolean;
}

/**
 * Open/unknown statistics (from post-filter stage)
 */
export interface OpenUnknownStats {
  unknownCount: number;
  knownOpenCount: number;
  knownClosedCount: number;
}

/**
 * Input for building ranking signals
 */
export interface RankingSignalsInput {
  query: string;
  profile: RankingProfile;
  weights: RankingWeights;
  hasUserLocation: boolean;
  resultsBeforeFilters: number;
  resultsAfterFilters: number;
  relaxApplied: RelaxationApplied;
  openUnknownStats: OpenUnknownStats;
}

/**
 * Build ranking signals from post-filter + ranking state
 * 
 * Pure deterministic logic - no LLM calls.
 * All thresholds are hardcoded and stable.
 */
export function buildRankingSignals(input: RankingSignalsInput): RankingSignals {
  const {
    profile,
    weights,
    hasUserLocation,
    resultsBeforeFilters,
    resultsAfterFilters,
    relaxApplied,
    openUnknownStats
  } = input;

  // Determine dominant factor from weights
  const dominantFactor = getDominantFactor(weights);

  // Compute triggers (deterministic thresholds)
  const triggers = {
    lowResults: resultsAfterFilters <= 10,
    relaxUsed: !!(relaxApplied.priceIntent || relaxApplied.minRating),
    manyOpenUnknown: computeManyOpenUnknown(openUnknownStats, resultsAfterFilters),
    dominatedByOneFactor: isWeightDominated(weights)
  };

  // Facts (state snapshot)
  const facts = {
    shownNow: resultsAfterFilters,
    totalPool: resultsBeforeFilters,
    hasUserLocation
  };

  return {
    profile,
    dominantFactor,
    triggers,
    facts
  };
}

/**
 * Determine which factor dominates based on weights
 * 
 * Returns the factor with the highest weight.
 * If no weight >= 0.55, returns NONE (no clear dominance).
 */
function getDominantFactor(weights: RankingWeights): DominantFactor {
  const { rating, reviews, distance, openBoost } = weights;

  // Find max weight
  const maxWeight = Math.max(rating, reviews, distance, openBoost);

  // No clear dominance if max < 0.55
  if (maxWeight < 0.55) {
    return 'NONE';
  }

  // Return factor with max weight
  if (distance === maxWeight) return 'DISTANCE';
  if (rating === maxWeight) return 'RATING';
  if (reviews === maxWeight) return 'REVIEWS';
  if (openBoost === maxWeight) return 'OPEN';

  return 'NONE';
}

/**
 * Check if any single weight dominates (>= 0.55)
 */
function isWeightDominated(weights: RankingWeights): boolean {
  const { rating, reviews, distance, openBoost } = weights;
  const maxWeight = Math.max(rating, reviews, distance, openBoost);
  return maxWeight >= 0.55;
}

/**
 * Check if many results have unknown open status
 * 
 * Threshold: unknownCount >= 0.4 * resultsAfterFilters
 * (40% or more of results have unknown open status)
 */
function computeManyOpenUnknown(
  stats: OpenUnknownStats,
  resultsAfterFilters: number
): boolean {
  const { unknownCount } = stats;

  // Avoid division by zero
  if (resultsAfterFilters === 0) {
    return false;
  }

  // 40% threshold
  return unknownCount >= 0.4 * resultsAfterFilters;
}
