/**
 * Search Response DTO
 * Unified output for POST /api/search
 */

import type {
  ParsedIntent,
  RestaurantResult,
  RefinementChip,
  AssistPayload,
  SearchMode,
} from './search.types';

// ============================================================================
// Response Types
// ============================================================================

export interface SearchResponseQuery {
  original: string;  // User's original query text
  parsed: ParsedIntent;  // LLM-parsed structured intent
  language: string;  // Detected language (ISO code)
}

export interface SearchResponseMeta {
  tookMs: number;  // Response time
  mode: SearchMode;  // Search mode used
  appliedFilters: string[];  // Filters that were applied
  confidence: number;  // Intent parsing confidence (0-1)
  source: string;  // Provider source(s) used
  cached?: boolean;  // Whether results were cached
}

export interface SearchResponse {
  // Session
  sessionId: string;
  
  // Query info
  query: SearchResponseQuery;
  
  // Results
  results: RestaurantResult[];
  
  // UI suggestions
  chips: RefinementChip[];
  
  // Optional: Assist payload (future micro-assist UI)
  assist?: AssistPayload;
  
  // Metadata
  meta: SearchResponseMeta;
}

// ============================================================================
// Error Response
// ============================================================================

export interface SearchErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a successful search response
 */
export function createSearchResponse(params: {
  sessionId: string;
  originalQuery: string;
  intent: ParsedIntent;
  results: RestaurantResult[];
  chips: RefinementChip[];
  assist?: AssistPayload;
  meta: {
    tookMs: number;
    mode: SearchMode;
    appliedFilters: string[];
    confidence: number;
    source: string;
    cached?: boolean;
  };
}): SearchResponse {
  return {
    sessionId: params.sessionId,
    query: {
      original: params.originalQuery,
      parsed: params.intent,
      language: params.intent.language,
    },
    results: params.results,
    chips: params.chips,
    assist: params.assist,
    meta: params.meta,
  };
}

/**
 * Creates an error response
 */
export function createSearchError(
  error: string,
  code?: string,
  details?: unknown
): SearchErrorResponse {
  return { error, code, details };
}

