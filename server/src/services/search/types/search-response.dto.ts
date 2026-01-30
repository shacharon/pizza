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
import type { Diagnostics } from './diagnostics.types.js';

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
  confidenceLevel?: 'high' | 'medium' | 'low';  // Phase 1: Combined confidence level
  source: string;  // Provider source(s) used
  cached?: boolean;  // Whether results were cached
  // NEW: For AI assistant context
  originalQuery?: string;
  failureReason: import('./search.types.js').FailureReason;  // REQUIRED: Always computed
  liveData?: import('./search.types.js').LiveDataVerification;
  // Pagination metadata (for "load more" UX)
  pagination?: {
    shownNow: number;     // Results returned in this response
    totalPool: number;    // Total results available (stable pool)
    offset: number;       // Current offset (0-based)
    hasMore: boolean;     // Whether more results are available
  };
  // Ranking signals (when ranking is enabled or triggers active)
  rankingSignals?: import('../route2/ranking/ranking-signals.js').RankingSignals;
  // PHASE 1: Transparency metadata (deterministic resolution)
  transparency?: {
    searchMode: 'FULL' | 'ASSISTED' | 'CLARIFY';  // Resolved search mode
    searchModeReason: string;  // Why this mode was selected
    locationUsed: {
      text: string;  // Location text (e.g., "Tel Aviv", "near me")
      source: 'explicit' | 'gps' | 'geocoded' | 'unknown';  // Where location came from
      coords: { lat: number; lng: number } | null;  // Resolved coordinates
    };
    radiusUsedMeters: number;  // Radius applied (hard filter)
    radiusSource: 'explicit' | 'default_near_me' | 'default_city' | 'default_street' | 'default_poi' | 'fallback';  // Where radius came from
  };
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
  // Opening hours summary (for closed filter transparency)
  openNowSummary?: {
    open: number;
    closed: number;
    unknown: number;
    total: number;
  };
  // API capabilities (for transparent derived filters)
  capabilities?: {
    openNowApiSupported: boolean;
    closedNowApiSupported: boolean;
    closedNowIsDerived: boolean;
  };
}

export interface SearchResponse {
  // Request ID (for WebSocket subscription)
  requestId: string;
  
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
  
  // REQUIRED: Assist payload (AI assistant)
  assist: AssistPayload;
  
  // Optional: Proposed actions (Human-in-the-Loop pattern)
  proposedActions?: ProposedActions;
  
  // Optional: Clarification (Answer-First UX)
  clarification?: import('./search.types.js').Clarification;
  requiresClarification?: boolean;  // Shorthand flag for easier UI logic
  
  // Optional: Diagnostics (dev/debug only)
  diagnostics?: Diagnostics;
  
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
  requestId: string;
  sessionId: string;
  originalQuery: string;
  intent: ParsedIntent;
  results: RestaurantResult[];
  groups?: ResultGroup[];
  chips: RefinementChip[];
  assist: AssistPayload;  // REQUIRED: Always included
  proposedActions?: ProposedActions;
  clarification?: import('./search.types.js').Clarification;
  requiresClarification?: boolean;
  diagnostics?: Diagnostics;  // NEW: Optional diagnostics
  meta: {
    tookMs: number;
    mode: SearchMode;
    appliedFilters: string[];
    confidence: number;
    source: string;
    failureReason: import('./search.types.js').FailureReason;  // REQUIRED
    cached?: boolean;
    originalQuery?: string;
    liveData?: import('./search.types.js').LiveDataVerification;
    // PHASE 1: Transparency metadata
    transparency?: {
      searchMode: 'FULL' | 'ASSISTED' | 'CLARIFY';
      searchModeReason: string;
      locationUsed: {
        text: string;
        source: 'explicit' | 'gps' | 'geocoded' | 'unknown';
        coords: { lat: number; lng: number } | null;
      };
      radiusUsedMeters: number;
      radiusSource: 'explicit' | 'default_near_me' | 'default_city' | 'default_street' | 'default_poi' | 'fallback';
    };
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
    openNowSummary?: {
      open: number;
      closed: number;
      unknown: number;
      total: number;
    };
    capabilities?: {
      openNowApiSupported: boolean;
      closedNowApiSupported: boolean;
      closedNowIsDerived: boolean;
    };
  };
}): SearchResponse {
  const response: SearchResponse = {
    requestId: params.requestId,
    sessionId: params.sessionId,
    query: {
      original: params.originalQuery,
      parsed: params.intent,
      language: params.intent.language || params.intent.languageContext.uiLanguage || 'en',
    },
    results: params.results,
    chips: params.chips,
    assist: params.assist,  // Always included
    meta: params.meta,
  };

  // Only add groups if they exist
  if (params.groups) {
    response.groups = params.groups;
  }

  // Only add proposedActions if it exists
  if (params.proposedActions) {
    response.proposedActions = params.proposedActions;
  }

  // Add clarification if it exists
  if (params.clarification) {
    response.clarification = params.clarification;
    response.requiresClarification = params.requiresClarification ?? true;
  }

  // Add diagnostics if provided
  if (params.diagnostics) {
    response.diagnostics = params.diagnostics;
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

