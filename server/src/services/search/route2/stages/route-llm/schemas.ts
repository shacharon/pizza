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
 * NO textQuery field - generated deterministically in mapper based on mode.
 * 
 * MODE-BASED APPROACH:
 * - KEYED mode: LLM outputs cuisineKey/placeTypeKey/cityText → mapper builds structured query
 * - FREE_TEXT mode: LLM signals no keys → mapper uses clean original query
 */
export const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  // NEW: mode determines query construction strategy
  mode: z.enum(['KEYED', 'FREE_TEXT']),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1),
  // Cuisine key - canonical language-independent identifier
  cuisineKey: z.enum([
    'italian', 'asian', 'japanese', 'chinese', 'thai', 'indian',
    'mediterranean', 'middle_eastern', 'american', 'mexican', 'french',
    'seafood', 'steakhouse', 'pizza', 'sushi', 'burger',
    'vegan', 'vegetarian', 'kosher', 'dairy', 'meat', 'fish',
    'breakfast', 'cafe', 'bakery', 'dessert',
    'fast_food', 'fine_dining', 'casual_dining'
  ]).nullable().default(null),
  // Place type key (for future expansion)
  placeTypeKey: z.string().nullable().default(null),
  // City text (required if intent reason is explicit_city_mentioned)
  cityText: z.string().nullable().default(null),
  // Cuisine enforcement fields (generated from cuisineKey)
  requiredTerms: z.array(z.string()).default([]),
  preferredTerms: z.array(z.string()).default([]),
  strictness: z.enum(['STRICT', 'RELAX_IF_EMPTY']).default('RELAX_IF_EMPTY'),
  typeHint: z.enum(['restaurant', 'cafe', 'bar', 'any']).default('restaurant')
}).strict();

/**
 * 2. This is for your App logic
 * Includes the bias field, cityText, cityCenter, and REQUIRES textQuery/providerTextQuery/providerLanguage.
 * 
 * MODE-BASED APPROACH:
 * - providerTextQuery: the actual query sent to Google (deterministically built)
 * - providerLanguage: the language sent to Google API (may differ from query language)
 * - mode: KEYED (structured) or FREE_TEXT (cleaned original)
 */
export const TextSearchMappingSchema = TextSearchLLMResponseSchema.extend({
  // textQuery: REQUIRED (generated deterministically from mode + keys/original)
  textQuery: z.string().min(1),
  // NEW: Provider-specific fields (what actually gets sent to Google)
  providerTextQuery: z.string().min(1),
  providerLanguage: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  bias: LocationBiasSchema.nullable().optional(),
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