import { z } from 'zod';

// --- Shared Sub-Schemas ---

const LocationBiasSchema = z.object({
  type: z.literal('locationBias'),
  center: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  }).strict(),
  radiusMeters: z.number().int().min(1).max(50000)
}).strict();

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
}).strict();

// --- TextSearch Schemas ---

/**
 * 1. This is for OpenAI (Strict Mode Friendly)
 * NO bias field here to avoid 400 error.
 * INCLUDES cuisine enforcement fields for explicit cuisine queries.
 */
export const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1),
  // Cuisine enforcement fields (LLM-only, no hardcoded rules)
  requiredTerms: z.array(z.string()).default([]),
  preferredTerms: z.array(z.string()).default([]),
  strictness: z.enum(['STRICT', 'RELAX_IF_EMPTY']).default('RELAX_IF_EMPTY'),
  typeHint: z.enum(['restaurant', 'cafe', 'bar', 'any']).default('restaurant')
}).strict();

/**
 * 2. This is for your App logic
 * Includes the bias field, cityText, and cityCenter (resolved coordinates).
 */
export const TextSearchMappingSchema = TextSearchLLMResponseSchema.extend({
  bias: LocationBiasSchema.nullable().optional(),
  cityText: z.string().min(1).optional(),
  cityCenter: LocationSchema.nullable().optional() // Resolved city center coordinates for ranking
}).strict();

export type TextSearchMapping = z.infer<typeof TextSearchMappingSchema>;

// --- Nearby Schemas ---

export const NearbyMappingSchema = z.object({
  providerMethod: z.literal('nearbySearch'),
  location: LocationSchema,
  radiusMeters: z.number().int().min(1).max(50000),
  keyword: z.string().min(1).max(80),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1)
}).strict();

export type NearbyMapping = z.infer<typeof NearbyMappingSchema>;

// --- Landmark Schemas ---

export const LandmarkMappingSchema = z.object({
  providerMethod: z.literal('landmarkPlan'),
  geocodeQuery: z.string().min(1).max(120),
  afterGeocode: z.enum(['nearbySearch', 'textSearch']),
  radiusMeters: z.number().int().min(1).max(50000),
  keyword: z.string().min(1).max(80),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1)
}).strict();

export type LandmarkMapping = z.infer<typeof LandmarkMappingSchema>;

// --- Union ---

export const RouteLLMMappingSchema = z.discriminatedUnion('providerMethod', [
  TextSearchMappingSchema,
  NearbyMappingSchema,
  LandmarkMappingSchema
]);

export type RouteLLMMapping = z.infer<typeof RouteLLMMappingSchema>;