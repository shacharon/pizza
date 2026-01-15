/**
 * ROUTE2 Types
 * 
 * Clean pipeline types for the new search flow
 * Does NOT import V1/V2 orchestrator types
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { SessionService } from '../capabilities/session.service.js';

// Re-export for convenience
export type { SearchRequest, SearchResponse };

/**
 * ROUTE2 Pipeline Context
 * Minimal context passed through all stages
 */
export interface Route2Context {
  requestId: string;
  traceId?: string;
  sessionId?: string;
  startTime: number;
  sessionService?: SessionService;
  userLocation?: {
    lat: number;
    lng: number;
  };
}

/**
 * GATE2 Stage Result
 * Determines if request should bypass, ask for clarification, or continue
 */
export interface Gate2Result {
  route: 'BYPASS' | 'ASK_CLARIFY' | 'CONTINUE';
  language?: string;
  regionCode?: string;
  reason?: string;
}

/**
 * INTENT2 Stage Result
 * Extracts food and location intent from query
 */
export interface Intent2Result {
  food?: {
    raw?: string;
    canonical?: string;
  };
  location?: {
    text?: string;
    isRelative?: boolean;
    radiusMeters?: number;
  };
}

/**
 * ROUTE_LLM Stage Result
 * Determines search mode and parameters
 */
export interface RouteLLMResult {
  mode: 'textsearch' | 'nearbysearch';
  radiusMeters: number;
}

/**
 * GOOGLE_MAPS Stage Result
 * Raw results from Google Places API
 */
export interface GoogleMapsResult {
  results: any[];
}
