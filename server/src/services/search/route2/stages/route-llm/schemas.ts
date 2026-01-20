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
 */
export const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1)
}).strict();

/**
 * 2. This is for your App logic
 * Includes the bias field.
 */
export const TextSearchMappingSchema = TextSearchLLMResponseSchema.extend({
  bias: LocationBiasSchema.nullable().optional()
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