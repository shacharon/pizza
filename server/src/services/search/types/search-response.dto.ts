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
  ProposedActions,
  ResultGroup,
} from './search.types.js';

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
  // NEW: For AI assistant context
  originalQuery?: string;
  failureReason?: import('./search.types.js').FailureReason;
  liveData?: import('./search.types.js').LiveDataVerification;
  // City filter statistics (optional)
  cityFilter?: {
    enabled: boolean;
    targetCity?: string;
    resultsRaw: number;
    resultsFiltered: number;
    dropped: number;
    dropReasons: Record<string, number>;
  };
  // Performance breakdown (optional)
  performance?: {
    total: number;
    googleCall: number;
    cityFilter: number;
  };
  // Street grouping statistics (optional)
  streetGrouping?: {
    enabled: boolean;
    streetName?: string;
    detectionMethod?: 'LLM' | 'PATTERN' | 'NONE';
    exactCount: number;
    nearbyCount: number;
    exactRadius: number;
    nearbyRadius: number;
  };
}

export interface SearchResponse {
  // Session
  sessionId: string;
  
  // Query info
  query: SearchResponseQuery;
  
  // Results (flat list for backward compatibility)
  results: RestaurantResult[];
  
  // Grouped results (Answer-First UX)
  groups?: ResultGroup[];
  
  // UI suggestions
  chips: RefinementChip[];
  
  // Optional: Assist payload (future micro-assist UI)
  assist?: AssistPayload;
  
  // Optional: Proposed actions (Human-in-the-Loop pattern)
  proposedActions?: ProposedActions;
  
  // NEW: Clarification (Answer-First UX)
  clarification?: import('./search.types.js').Clarification;
  requiresClarification?: boolean;  // Shorthand flag for easier UI logic
  
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
  groups?: ResultGroup[];
  chips: RefinementChip[];
  assist?: AssistPayload;
  proposedActions?: ProposedActions;
  clarification?: import('./search.types.js').Clarification;
  requiresClarification?: boolean;
  meta: {
    tookMs: number;
    mode: SearchMode;
    appliedFilters: string[];
    confidence: number;
    source: string;
    cached?: boolean;
    cityFilter?: {
      enabled: boolean;
      targetCity?: string;
      resultsRaw: number;
      resultsFiltered: number;
      dropped: number;
      dropReasons: Record<string, number>;
    };
    performance?: {
      total: number;
      googleCall: number;
      cityFilter: number;
    };
    streetGrouping?: {
      enabled: boolean;
      streetName?: string;
      detectionMethod?: 'LLM' | 'PATTERN' | 'NONE';
      exactCount: number;
      nearbyCount: number;
      exactRadius: number;
      nearbyRadius: number;
    };
  };
}): SearchResponse {
  const response: SearchResponse = {
    sessionId: params.sessionId,
    query: {
      original: params.originalQuery,
      parsed: params.intent,
      language: params.intent.language,
    },
    results: params.results,
    chips: params.chips,
    meta: params.meta,
  };

  // Only add groups if they exist
  if (params.groups) {
    response.groups = params.groups;
  }

  // Only add assist if it exists
  if (params.assist) {
    response.assist = params.assist;
  }

  // Only add proposedActions if it exists
  if (params.proposedActions) {
    response.proposedActions = params.proposedActions;
  }

  // NEW: Add clarification if it exists
  if (params.clarification) {
    response.clarification = params.clarification;
    response.requiresClarification = params.requiresClarification ?? true;
  }

  return response;
}

/**
 * Creates an error response
 */
export function createSearchError(
  error: string,
  code?: string,
  details?: unknown
): SearchErrorResponse {
  const response: SearchErrorResponse = { error };
  if (code) response.code = code;
  if (details) response.details = details;
  return response;
}

