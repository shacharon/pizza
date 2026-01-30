/**
 * API Contracts - External Boundaries
 * 
 * These types define the contract between client and server.
 * Breaking changes here affect external consumers and require coordination.
 * 
 * Version: v1
 * Should be carefully managed and versioned when changed.
 */

import type { Coordinates, RestaurantResult, RefinementChip, ResultGroup, SearchMode, FailureReason } from './domain.types.js';

// ============================================================================
// Search Parameters (for PlacesProvider)
// ============================================================================

export interface SearchParams {
  query: string;
  location: Coordinates;
  radius?: number;
  language: string;  // Google Places API language (he or en)
  region?: string;    // Country code for biasing results (e.g., 'fr', 'il', 'us')

  filters: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  };

  mode?: SearchMode;
  pageSize?: number;
}

// ============================================================================
// Phase 1: Async Assistant - Core Search Types
// ============================================================================

/**
 * Core search result - fast response without LLM assistant
 * Returned by searchCore() in ~500ms
 */
export interface CoreSearchResult {
  requestId: string;
  sessionId: string;
  query: {
    original: string;
    parsed: import('./domain.types.js').ParsedIntent;
    language: string;
  };
  results: RestaurantResult[];
  groups?: ResultGroup[];
  chips: RefinementChip[];
  truthState: import('./truth-state.types.js').TruthState;
  meta: CoreSearchMetadata;
}

/**
 * Metadata for core search (before assistant)
 */
export interface CoreSearchMetadata {
  tookMs: number;
  mode: SearchMode;
  appliedFilters: string[];
  confidence: number;
  source: string;
  failureReason: FailureReason;
  timings: {
    intentMs: number;
    geocodeMs: number;
    providerMs: number;
    rankingMs: number;
  };
  liveData?: import('./domain.types.js').LiveDataVerification;
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
}
