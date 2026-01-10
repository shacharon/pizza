/**
 * Async Search Types - Phase 6
 * Mirror backend CoreSearchResult with tolerant optional fields
 */

import type { Restaurant, RefinementChip, ParsedQuery, ResultGroup } from '../../domain/types/search.types';

/**
 * Core Search Result from async endpoint
 * Minimal required fields + optional extensions
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
