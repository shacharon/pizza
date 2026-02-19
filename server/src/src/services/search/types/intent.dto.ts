/**
 * Search Intent DTO
 * 
 * Defines the canonical intent schema that the LLM must output during intent detection.
 * This schema is the contract between LLM understanding and deterministic execution.
 * 
 * References:
 * - docs/SEARCH_INTENT_CONTRACT.md (authoritative schema definition)
 * - docs/SEARCH_TRUTH_MODEL.md (anchor model and separation of responsibilities)
 */

import { z } from 'zod';

/**
 * Location types supported in the system
 */
export const LocationTypeSchema = z.enum(['city', 'street', 'poi', 'gps']);
export type LocationType = z.infer<typeof LocationTypeSchema>;

/**
 * Supported languages
 */
export const LanguageSchema = z.enum(['he', 'en', 'ar', 'ru']);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * Supported dietary requirements
 */
export const DietaryTypeSchema = z.enum(['vegan', 'vegetarian', 'kosher', 'halal', 'gluten_free']);
export type DietaryType = z.infer<typeof DietaryTypeSchema>;

/**
 * Food Anchor - What food/cuisine the user wants
 */
export const FoodAnchorSchema = z.object({
  type: z.string().describe('Food type or cuisine (e.g., "pizza", "sushi", "italian")'),
  present: z.boolean().describe('True if food type was detected in user query')
});
export type FoodAnchor = z.infer<typeof FoodAnchorSchema>;

/**
 * Location Anchor - Where the user wants to search
 */
export const LocationAnchorSchema = z.object({
  text: z.string().describe('Location text as mentioned by user (e.g., "Tel Aviv", "near me")'),
  type: LocationTypeSchema.or(z.literal('')).describe('Type of location detected'),
  present: z.boolean().describe('True if location intent was detected')
});
export type LocationAnchor = z.infer<typeof LocationAnchorSchema>;

/**
 * Explicit Distance - User-specified distance constraint
 * 
 * CRITICAL: LLM may only set this if user explicitly states a distance.
 * LLM MUST NOT set default distances.
 */
export const ExplicitDistanceSchema = z.object({
  meters: z.number().positive().nullable().describe('Distance in meters (e.g., 500 for "within 500m")'),
  originalText: z.string().nullable().describe('Original distance text from user (e.g., "within 500m")')
});
export type ExplicitDistance = z.infer<typeof ExplicitDistanceSchema>;

/**
 * User Preferences - Stated preferences (not execution filters)
 */
export const PreferencesSchema = z.object({
  dietary: z.array(DietaryTypeSchema).optional().describe('Array of dietary requirements (supports multiple)'),
  priceLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional()
    .describe('User desired price range (1=cheap, 4=expensive)'),
  openNow: z.boolean().optional().describe('User wants currently open places'),
  delivery: z.boolean().optional().describe('User wants delivery option'),
  takeout: z.boolean().optional().describe('User wants takeout option')
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/**
 * Search Intent Schema
 * 
 * This is the ONLY output format allowed from LLM intent detection.
 * All fields are defined in docs/SEARCH_INTENT_CONTRACT.md
 * 
 * What's INCLUDED:
 * - Food and location anchors (what and where)
 * - Near-me intent (GPS-based search request)
 * - Explicit user-specified distance (only if stated)
 * - User preferences (dietary, price, etc.)
 * - Query metadata (language, confidence)
 * 
 * What's FORBIDDEN:
 * - Default radius values (only explicit user distance allowed)
 * - Search center coordinates
 * - Filter execution instructions
 * - Ranking weights
 * - API parameters
 */
export const SearchIntentSchema = z.object({
  // ANCHORS (Required for search)
  foodAnchor: FoodAnchorSchema,
  locationAnchor: LocationAnchorSchema,
  
  // Near-me intent
  nearMe: z.boolean().describe('True if user said "near me", "קרוב אליי", etc.'),
  
  // User-specified distance (explicit only)
  explicitDistance: ExplicitDistanceSchema,
  
  // User preferences (not execution filters)
  preferences: PreferencesSchema,
  
  // Metadata
  language: LanguageSchema.describe('Detected query language'),
  confidence: z.number().min(0).max(1).describe('LLM confidence in extraction (0-1)'),
  originalQuery: z.string().describe('Original user query text')
});

export type SearchIntent = z.infer<typeof SearchIntentSchema>;

/**
 * Validate LLM intent output against the schema
 * 
 * @param data - Raw LLM output
 * @returns Validated SearchIntent or throws ZodError
 * @throws ZodError if data doesn't match schema
 */
export function validateIntent(data: unknown): SearchIntent {
  return SearchIntentSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * 
 * @param data - Raw LLM output
 * @returns { success: true, data } or { success: false, error }
 */
export function safeValidateIntent(data: unknown): 
  | { success: true; data: SearchIntent }
  | { success: false; error: z.ZodError } {
  
  const result = SearchIntentSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Type guard to check if an object is a valid SearchIntent
 */
export function isSearchIntent(data: unknown): data is SearchIntent {
  return SearchIntentSchema.safeParse(data).success;
}

/**
 * Helper: Check if intent has both required anchors
 */
export function hasBothAnchors(intent: SearchIntent): boolean {
  return intent.foodAnchor.present && intent.locationAnchor.present;
}

/**
 * Helper: Check if intent has food anchor only
 */
export function hasFoodAnchorOnly(intent: SearchIntent): boolean {
  return intent.foodAnchor.present && !intent.locationAnchor.present;
}

/**
 * Helper: Check if intent has location anchor only
 */
export function hasLocationAnchorOnly(intent: SearchIntent): boolean {
  return !intent.foodAnchor.present && intent.locationAnchor.present;
}

/**
 * Helper: Check if neither anchor is present
 */
export function hasNoAnchors(intent: SearchIntent): boolean {
  return !intent.foodAnchor.present && !intent.locationAnchor.present;
}
