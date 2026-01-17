/**
 * Async Search Types - Phase 6
 * Proper 202 async flow with polling + WebSocket
 */

import type { Restaurant, RefinementChip, ParsedQuery, ResultGroup, SearchResponse } from '../../domain/types/search.types';

/**
 * Async Search Accepted Response (HTTP 202)
 * Returned immediately when POST /search?mode=async
 */
export interface AsyncSearchAccepted {
  requestId: string;
  resultUrl: string;
  contractsVersion: string;
}

/**
 * Async Search Pending Response (HTTP 202 from GET /result)
 * Returned when polling while pipeline is still running
 */
export interface AsyncSearchPending {
  requestId: string;
  status: 'PENDING';
  resultUrl: string;
  contractsVersion: string;
}

/**
 * Core Search Result from async endpoint
 * Minimal required fields + optional extensions
 * 
 * @deprecated Use SearchResponse directly for DONE state
 */
export interface CoreSearchResult {
  // Required fields (strict)
  requestId: string;
  results: Restaurant[];
  chips: RefinementChip[];
  meta: CoreSearchMetadata;
  
  // Optional fields (tolerant of backend changes)
  sessionId?: string;
  query?: ParsedQuery;
  groups?: ResultGroup[];
  truthState?: any;
}

/**
 * Core Search Metadata
 * Required fields + extensible for backend evolution
 */
export interface CoreSearchMetadata {
  tookMs: number;
  mode: 'fast' | 'deep' | 'clarify';
  appliedFilters: Record<string, any>;
  confidence: number;
  source: string;
  timings?: {
    intentMs: number;
    geocodeMs: number;
    providerMs: number;
    rankingMs: number;
    totalMs: number;
  };
  // Allow extra fields for forward compatibility
  [key: string]: any;
}
