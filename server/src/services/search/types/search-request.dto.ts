/**
 * Search Request DTO and Zod schema
 * Unified input for POST /api/search
 */

import { z } from 'zod';

// ============================================================================
// Zod Schemas
// ============================================================================

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const filtersSchema = z.object({
  openNow: z.boolean().optional(),
  priceLevel: z.number().int().min(1).max(4).optional(),
  dietary: z.array(z.string()).optional(),
  mustHave: z.array(z.string()).optional(),
}).optional();

export const searchRequestSchema = z.object({
  // Required: user's query
  query: z.string().min(1).max(500),
  
  // Optional: session ID for context
  sessionId: z.string().optional(),
  
  // Optional: user's location (for "near me" queries)
  userLocation: coordinatesSchema.optional(),
  
  // Optional: explicit filters
  filters: filtersSchema,
  
  // Optional: clear session context (intent reset)
  clearContext: z.boolean().optional(),
});

// ============================================================================
// TypeScript Types (inferred from Zod)
// ============================================================================

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type SearchRequestFilters = z.infer<typeof filtersSchema>;

export type Coordinates = z.infer<typeof coordinatesSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates and parses a search request
 * @throws {z.ZodError} if validation fails
 */
export function parseSearchRequest(data: unknown): SearchRequest {
  return searchRequestSchema.parse(data);
}

/**
 * Safely validates a search request
 * @returns {success: boolean, data?: SearchRequest, error?: string}
 */
export function safeParseSearchRequest(data: unknown): {
  success: boolean;
  data?: SearchRequest;
  error?: string;
} {
  const result = searchRequestSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

