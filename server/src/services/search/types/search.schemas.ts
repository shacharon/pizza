/**
 * Zod Schemas for Search Types
 * Validation schemas for Restaurant DTO and WebSocket messages
 */

import { z } from 'zod';

/**
 * ProviderState schema - Generic state for external provider data
 */
export const ProviderStateSchema = z.object({
  status: z.enum(['PENDING', 'FOUND', 'NOT_FOUND']),
  url: z.string().nullable()
});

/**
 * Providers schema - Container for all provider enrichments
 */
export const ProvidersSchema = z.object({
  wolt: ProviderStateSchema.optional(),
  tenbis: ProviderStateSchema.optional(),
  mishloha: ProviderStateSchema.optional()
});

/**
 * Category field for search result DTO (deterministic: restaurant | cafe | bakery)
 */
export const PlaceCategorySchema = z.enum(['restaurant', 'cafe', 'bakery']);

/**
 * RestaurantResult partial schema - Validates provider fields only
 * Full restaurant validation should include all required fields
 */
export const RestaurantProviderFieldsSchema = z.object({
  providers: ProvidersSchema.optional()
});

/**
 * Schema for restaurant result as returned in API response (optional fields for backward compatibility).
 * Include category so response validation allows it when present.
 */
export const RestaurantResultResponseSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  name: z.string(),
  address: z.string(),
  location: z.object({ lat: z.number(), lng: z.number() }),
  category: PlaceCategorySchema.optional(),
  providers: ProvidersSchema.optional()
}).passthrough();

/**
 * WSServerResultPatch schema - Validates WebSocket RESULT_PATCH events
 */
export const WSServerResultPatchSchema = z.object({
  type: z.literal('RESULT_PATCH'),
  requestId: z.string().min(1),
  placeId: z.string().min(1),
  patch: z.object({
    providers: ProvidersSchema.optional()
  })
});

// Type exports for type inference
export type ProviderState = z.infer<typeof ProviderStateSchema>;
export type Providers = z.infer<typeof ProvidersSchema>;
export type PlaceCategory = z.infer<typeof PlaceCategorySchema>;
export type RestaurantResultResponse = z.infer<typeof RestaurantResultResponseSchema>;
export type WSServerResultPatch = z.infer<typeof WSServerResultPatchSchema>;
