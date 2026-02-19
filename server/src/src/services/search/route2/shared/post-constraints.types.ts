/**
 * Post-Constraints Types - Route2 Pipeline
 * 
 * Constraints extracted from user query that are applied AFTER Google API call
 * (post-filters that cannot be sent to Google as pre-filters)
 */

import { z } from 'zod';

/**
 * Open State - Temporal constraint
 */
export const OpenStateSchema = z.enum([
  'OPEN_NOW',
  'CLOSED_NOW',
  'OPEN_AT',
  'OPEN_BETWEEN'
]).nullable();

export type OpenState = z.infer<typeof OpenStateSchema>;

/**
 * Temporal filter for "open at specific time"
 */
export const OpenAtSchema = z.object({
  day: z.number().int().min(0).max(6).nullable(), // 0=Sun, 6=Sat
  timeHHmm: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable() // HH:mm format
}).strict().nullable();

export type OpenAt = z.infer<typeof OpenAtSchema>;

/**
 * Temporal range filter for "open between X and Y"
 */
export const OpenBetweenSchema = z.object({
  day: z.number().int().min(0).max(6).nullable(), // 0=Sun, 6=Sat
  startHHmm: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  endHHmm: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()
}).strict().nullable();

export type OpenBetween = z.infer<typeof OpenBetweenSchema>;

/**
 * Price level (Google's 1-4 scale)
 * 1 = $, 2 = $$, 3 = $$$, 4 = $$$$
 */
export const PriceLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4)
]).nullable();

export type PriceLevel = z.infer<typeof PriceLevelSchema>;

/**
 * Accessibility and amenity requirements
 */
export const RequirementsSchema = z.object({
  accessible: z.boolean().nullable(), // Wheelchair accessible
  parking: z.boolean().nullable()     // Has parking
}).strict();

export type Requirements = z.infer<typeof RequirementsSchema>;

/**
 * Post-Constraints Schema
 * Extracted from user query, applied after Google API results
 */
export const PostConstraintsSchema = z.object({
  openState: OpenStateSchema,
  openAt: OpenAtSchema,
  openBetween: OpenBetweenSchema,
  priceLevel: PriceLevelSchema,
  isKosher: z.boolean().nullable(),
  isGlutenFree: z.boolean().nullable(),
  requirements: RequirementsSchema
}).strict();

export type PostConstraints = z.infer<typeof PostConstraintsSchema>;

/**
 * Helper: Build default (all-null) post-constraints
 */
export function buildDefaultPostConstraints(): PostConstraints {
  return {
    openState: null,
    openAt: null,
    openBetween: null,
    priceLevel: null,
    isKosher: null,
    isGlutenFree: null,
    requirements: {
      accessible: null,
      parking: null
    }
  };
}
