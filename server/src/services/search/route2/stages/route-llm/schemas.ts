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
 * INCLUDES cuisine enforcement fields - now extracts canonical cuisineKey instead of raw terms.
 * 
 * LANGUAGE SEPARATION: LLM extracts cuisineKey (language-independent), NOT raw query terms.
 * Terms are generated deterministically from cuisineKey + searchLanguage.
 */
export const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  // DEPRECATED: textQuery will be generated deterministically (not from LLM)
  textQuery: z.string().min(1).optional(),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1),
  // Cuisine enforcement fields - NEW: canonical cuisineKey (language-independent)
  cuisineKey: z.enum([
    'italian', 'asian', 'japanese', 'chinese', 'thai', 'indian',
    'mediterranean', 'middle_eastern', 'american', 'mexican', 'french',
    'seafood', 'steakhouse', 'pizza', 'sushi', 'burger',
    'vegan', 'vegetarian', 'kosher', 'dairy', 'meat', 'fish',
    'breakfast', 'cafe', 'bakery', 'dessert',
    'fast_food', 'fine_dining', 'casual_dining'
  ]).nullable().default(null),
  // DEPRECATED: requiredTerms/preferredTerms generated from cuisineKey
  requiredTerms: z.array(z.string()).default([]),
  preferredTerms: z.array(z.string()).default([]),
  strictness: z.enum(['STRICT', 'RELAX_IF_EMPTY']).default('RELAX_IF_EMPTY'),
  typeHint: z.enum(['restaurant', 'cafe', 'bar', 'any']).default('restaurant')
}).strict();

/**
 * 2. This is for your App logic
 * Includes the bias field, cityText, cityCenter, and OVERRIDES textQuery (generated deterministically).
 * 
 * LANGUAGE SEPARATION:
 * - textQuery: generated from cuisineKey + cityText + searchLanguage (deterministic)
 * - requiredTerms/preferredTerms: generated from cuisineKey + searchLanguage (not query language)
 */
export const TextSearchMappingSchema = TextSearchLLMResponseSchema.extend({
  // Override: textQuery is REQUIRED (generated deterministically, not from LLM)
  textQuery: z.string().min(1),
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
  reason: z.string().min(1),
  // NEW: Canonical keys for language-independent search
  cuisineKey: z.string().optional(), // e.g., 'italian', 'asian'
  typeKey: z.string().optional()     // e.g., 'restaurant', 'cafe'
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
  reason: z.string().min(1),
  // NEW: Canonical keys for language independence
  landmarkId: z.string().optional(),      // Canonical landmark ID (resolved post-LLM)
  cuisineKey: z.string().optional(),      // Canonical cuisine key
  typeKey: z.string().optional(),         // Type key for non-cuisine searches
  resolvedLatLng: z.object({              // Resolved coordinates (post-geocode)
    lat: z.number(),
    lng: z.number()
  }).optional()
}).strict();

export type LandmarkMapping = z.infer<typeof LandmarkMappingSchema>;

// --- Union ---

export const RouteLLMMappingSchema = z.discriminatedUnion('providerMethod', [
  TextSearchMappingSchema,
  NearbyMappingSchema,
  LandmarkMappingSchema
]);

export type RouteLLMMapping = z.infer<typeof RouteLLMMappingSchema>;