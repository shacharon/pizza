/**
 * Cuisine Enforcer Schema
 * LLM-based post-Google filtering for explicit cuisine queries
 */

import { z } from 'zod';
import { createHash } from 'crypto';

/**
 * Input: Place data from Google Maps
 */
export const PlaceInputSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  types: z.array(z.string()).default([]),
  address: z.string().optional(),
  rating: z.number().optional(),
  userRatingsTotal: z.number().optional()
}).strict();

export type PlaceInput = z.infer<typeof PlaceInputSchema>;

/**
 * Output: Filtered place IDs with relaxation metadata
 */
export const CuisineEnforcementResponseSchema = z.object({
  keepPlaceIds: z.array(z.string()),
  relaxApplied: z.boolean(),
  relaxStrategy: z.enum(['none', 'fallback_preferred', 'drop_required_once', 'google_rerun_broader']),
  enforcementSkipped: z.boolean().optional() // True when skipped due to small sample
}).strict();

export type CuisineEnforcementResponse = z.infer<typeof CuisineEnforcementResponseSchema>;

/**
 * Static JSON Schema for OpenAI Structured Output
 * Updated to support google_rerun_broader strategy
 */
export const CUISINE_ENFORCEMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    keepPlaceIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Place IDs to keep, in best-first order'
    },
    relaxApplied: {
      type: 'boolean',
      description: 'Whether relaxation was applied'
    },
    relaxStrategy: {
      type: 'string',
      enum: ['none', 'fallback_preferred', 'drop_required_once', 'google_rerun_broader'],
      description: 'Relaxation strategy used'
    }
  },
  required: ['keepPlaceIds', 'relaxApplied', 'relaxStrategy'],
  additionalProperties: false
} as const;

export const CUISINE_ENFORCEMENT_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(CUISINE_ENFORCEMENT_JSON_SCHEMA))
  .digest('hex')
  .substring(0, 12);
