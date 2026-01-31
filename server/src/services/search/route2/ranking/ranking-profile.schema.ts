/**
 * Ranking Profile Schema
 * 
 * Defines the structure for LLM-selected ranking profiles and weights.
 * Weights control how we score results deterministically after Google fetch.
 */

import { z } from 'zod';
import { createHash } from 'crypto';

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
  openBoost: z.number().min(0).max(1),
  cuisineMatch: z.number().min(0).max(1).optional().default(0) // NEW: cuisine scoring weight
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
 * Static JSON Schema for Ranking Selection
 * Used to ensure OpenAI Structured Outputs compatibility (root type must be object)
 */
export const RANKING_SELECTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    profile: {
      type: 'string',
      enum: ['NEARBY', 'QUALITY', 'OPEN_FOCUS', 'BALANCED']
    },
    weights: {
      type: 'object',
      properties: {
        rating: { type: 'number', minimum: 0, maximum: 1 },
        reviews: { type: 'number', minimum: 0, maximum: 1 },
        distance: { type: 'number', minimum: 0, maximum: 1 },
        openBoost: { type: 'number', minimum: 0, maximum: 1 },
        cuisineMatch: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['rating', 'reviews', 'distance', 'openBoost'],
      additionalProperties: false
    }
  },
  required: ['profile', 'weights'],
  additionalProperties: false
} as const;

export const RANKING_SELECTION_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(RANKING_SELECTION_JSON_SCHEMA))
  .digest('hex')
  .slice(0, 12);

/**
 * Normalize weights to sum to 1.0
 * Used when LLM returns weights that don't perfectly sum to 1.
 */
export function normalizeWeights(weights: RankingWeights): RankingWeights {
  const sum = weights.rating + weights.reviews + weights.distance + weights.openBoost + (weights.cuisineMatch || 0);

  // If sum is already ~1, return as-is
  if (Math.abs(sum - 1.0) < 0.001) {
    return weights;
  }

  // If sum is 0, return balanced weights
  if (sum === 0) {
    return {
      rating: 0.20,
      reviews: 0.20,
      distance: 0.20,
      openBoost: 0.20,
      cuisineMatch: 0.20
    };
  }

  // Normalize to sum to 1
  return {
    rating: weights.rating / sum,
    reviews: weights.reviews / sum,
    distance: weights.distance / sum,
    openBoost: weights.openBoost / sum,
    cuisineMatch: (weights.cuisineMatch || 0) / sum
  };
}
