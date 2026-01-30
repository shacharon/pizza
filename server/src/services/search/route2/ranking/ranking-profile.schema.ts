/**
 * Ranking Profile Schema
 * 
 * Defines the structure for LLM-selected ranking profiles and weights.
 * Weights control how we score results deterministically after Google fetch.
 */

import { z } from 'zod';

/**
 * Ranking Profile Types
 * - NEARBY: Prioritize proximity (distance-heavy)
 * - QUALITY: Prioritize rating + reviews (quality-heavy)
 * - OPEN_FOCUS: Boost currently open places
 * - BALANCED: Equal weighting across factors
 */
export const RankingProfileEnum = z.enum(['NEARBY', 'QUALITY', 'OPEN_FOCUS', 'BALANCED']);
export type RankingProfile = z.infer<typeof RankingProfileEnum>;

/**
 * Ranking Weights
 * Each weight is a number between 0 and 1.
 * Weights should sum to 1 (±0.001) or will be normalized in code.
 */
export const RankingWeightsSchema = z.object({
  rating: z.number().min(0).max(1),
  reviews: z.number().min(0).max(1),
  distance: z.number().min(0).max(1),
  openBoost: z.number().min(0).max(1)
}).strict();

export type RankingWeights = z.infer<typeof RankingWeightsSchema>;

/**
 * LLM Ranking Selection Result
 * Returned by the LLM profile selector
 */
export const RankingSelectionSchema = z.object({
  profile: RankingProfileEnum,
  weights: RankingWeightsSchema
}).strict();

export type RankingSelection = z.infer<typeof RankingSelectionSchema>;

/**
 * Normalize weights to sum to 1.0
 * Used when LLM returns weights that don't perfectly sum to 1.
 */
export function normalizeWeights(weights: RankingWeights): RankingWeights {
  const sum = weights.rating + weights.reviews + weights.distance + weights.openBoost;
  
  // If sum is already ~1, return as-is
  if (Math.abs(sum - 1.0) < 0.001) {
    return weights;
  }
  
  // If sum is 0, return balanced weights
  if (sum === 0) {
    return {
      rating: 0.25,
      reviews: 0.25,
      distance: 0.25,
      openBoost: 0.25
    };
  }
  
  // Normalize to sum to 1
  return {
    rating: weights.rating / sum,
    reviews: weights.reviews / sum,
    distance: weights.distance / sum,
    openBoost: weights.openBoost / sum
  };
}
