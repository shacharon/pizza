/**
 * ROUTE_LLM Mapping Schemas
 * 
 * Strict Zod schemas for the three mapper outputs:
 * - TEXTSEARCH_MAPPER
 * - NEARBY_MAPPER
 * - LANDMARK_MAPPER
 */

import { z } from 'zod';

// ============================================================================
// Shared Sub-Schemas
// ============================================================================

/**
 * Location bias for TextSearch
 * Optional - adds location bias to text search
 */
const LocationBiasSchema = z.object({
  type: z.literal('locationBias'),
  center: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  }).strict(),
  radiusMeters: z.number().int().min(1).max(50000)
}).strict();

/**
 * Location for NearbySearch
 * Required - the point to search around
 */
const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
}).strict();

// ============================================================================
// TextSearch Mapping Schema
// ============================================================================

/**
 * TextSearch Mapping
 * Default text-based search with optional location bias
 * 
 * Example:
 * - "pizza in tel aviv" → textQuery="pizza restaurant tel aviv", bias=null
 * - "sushi" + user location → textQuery="sushi", bias={center, radius}
 */
export const TextSearchMappingSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/), // ISO-3166-1 alpha-2
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  bias: LocationBiasSchema.nullable(),
  reason: z.string().min(1) // Debugging/observability
}).strict();

export type TextSearchMapping = z.infer<typeof TextSearchMappingSchema>;

// ============================================================================
// Nearby Mapping Schema
// ============================================================================

/**
 * Nearby Mapping
 * Proximity search from a known location
 * 
 * Example:
 * - "pizza near me" → location={user coords}, radiusMeters=1500, keyword="pizza"
 * - "hummus 200m from me" → location={user coords}, radiusMeters=200, keyword="hummus"
 */
export const NearbyMappingSchema = z.object({
  providerMethod: z.literal('nearbySearch'),
  location: LocationSchema,
  radiusMeters: z.number().int().min(1).max(50000),
  keyword: z.string().min(1).max(80),
  region: z.string().regex(/^[A-Z]{2}$/), // ISO-3166-1 alpha-2
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1)
}).strict();

export type NearbyMapping = z.infer<typeof NearbyMappingSchema>;

// ============================================================================
// Landmark Mapping Schema
// ============================================================================

/**
 * Landmark Mapping
 * Two-phase search: geocode landmark, then search nearby or with bias
 * 
 * Example:
 * - "pizza at Azrieli" → geocodeQuery="Azrieli Center Tel Aviv", afterGeocode="nearbySearch"
 * - "sushi Dizengoff" → geocodeQuery="Dizengoff Center", afterGeocode="textSearchWithBias"
 */
export const LandmarkMappingSchema = z.object({
  providerMethod: z.literal('landmarkPlan'),
  geocodeQuery: z.string().min(1).max(120),
  afterGeocode: z.enum(['nearbySearch', 'textSearchWithBias']),
  radiusMeters: z.number().int().min(1).max(50000),
  keyword: z.string().min(1).max(80),
  region: z.string().regex(/^[A-Z]{2}$/), // ISO-3166-1 alpha-2
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1)
}).strict();

export type LandmarkMapping = z.infer<typeof LandmarkMappingSchema>;

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * ROUTE_LLM Mapping Schema
 * Discriminated union on providerMethod
 * 
 * Enables type-safe pattern matching:
 * ```typescript
 * const mapping = RouteLLMMappingSchema.parse(llmOutput);
 * 
 * if (mapping.providerMethod === 'textSearch') {
 *   console.log(mapping.textQuery); // ✓ TypeScript knows this exists
 * }
 * ```
 */
export const RouteLLMMappingSchema = z.discriminatedUnion('providerMethod', [
  TextSearchMappingSchema,
  NearbyMappingSchema,
  LandmarkMappingSchema
]);

export type RouteLLMMapping = z.infer<typeof RouteLLMMappingSchema>;
