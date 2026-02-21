/**
 * ROUTE2 Types
 * 
 * Clean pipeline types for the new search flow
 * Does NOT import V1/V2 orchestrator types
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { LLMProvider } from '../../../llm/types.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared/shared-filters.types.js';

// Re-export for convenience
export type { SearchRequest, SearchResponse };
export type { PreGoogleBaseFilters, FinalSharedFilters };

/**
 * ROUTE2 Pipeline Context
 * Minimal context passed through all stages
 */
export interface Route2Context {
  requestId: string;
  traceId?: string;
  sessionId?: string;
  startTime: number;
  /** Request-scoped abort signal; set by orchestrator at pipeline start. Aborted on pipeline timeout. */
  abortSignal?: AbortSignal;
  debug?: { stopAfter: string }; // ← הוסף רק את זה

  jobCreatedAt?: number; // Timestamp when search job was created (for queueDelayMs)
  sessionService?: any; // Optional session service for region caching
  llmProvider: LLMProvider;
  query?: string; // Original user query (for assistant context on failures)
  queryLanguage?: 'he' | 'en' | 'ru' | 'ar' | 'unknown'; // Detected language from query text (deterministic, majority-script heuristic)
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
  // Region tracking: user (device) vs query (LLM-detected)
  userRegionCode?: 'IL' | 'OTHER';
  queryRegionCode?: 'IL' | 'OTHER';
  regionCodeFinal?: 'IL' | 'OTHER';
  // Shared filters: Pre-Google (base) and Final (tightened)
  sharedFilters?: {
    preGoogle?: PreGoogleBaseFilters;
    final?: FinalSharedFilters;
  };
  // Stage timing tracking for duration decomposition
  timings?: {
    gate2Ms?: number;
    intentMs?: number;
    routeLLMMs?: number;
    baseFiltersMs?: number;
    googleMapsMs?: number;
    postFilterMs?: number;
    responseBuildMs?: number;
  };
}

/**
 * Returns true if the request has been aborted (e.g. pipeline timeout).
 * Use before WS/SSE publish and before cache/Redis writes to avoid side-effects after abort.
 * @param ctx - Route2Context or any object with optional abortSignal (e.g. job for provider worker)
 */
export function shouldAbort(ctx?: { abortSignal?: AbortSignal | null } | null): boolean {
  return ctx?.abortSignal?.aborted === true;
}

// Gate2 specific types
export type Gate2Language = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other';
export type Gate2FoodSignal = 'NO' | 'UNCERTAIN' | 'YES';
export type Gate2Route = 'CONTINUE' | 'ASK_CLARIFY' | 'STOP';

/**
 * GATE2 Stage Result
 * Tri-state food classifier with early-stop routing
 */
export interface Gate2Result {
  foodSignal: Gate2FoodSignal;
  language: Gate2Language;
  route: Gate2Route;
  confidence: number;
}

export interface Gate2StageOutput {
  gate: Gate2Result;
  error?: {
    code: string;
    message: string;
    stage: string;
  };
}

// INTENT stage types (router-only)
export type MappingRoute = 'TEXTSEARCH' | 'NEARBY' | 'LANDMARK';

/**
 * INTENT Stage Result
 * Router-only decision without extraction
 * Includes language and regionCandidate detection (NOT final region)
 * 
 * IMPORTANT: regionCandidate is a suggestion only - filters_resolved decides the final region
 */
export interface IntentResult {
  route: MappingRoute;
  confidence: number;
  reason: string;
  language: Gate2Language;
  regionCandidate: string | null;
  regionConfidence: number;
  regionReason: string;
  cityText?: string;
  landmarkText?: string | null;
  radiusMeters?: number | null;
}

// Intent2 specific types (DEPRECATED - will be removed)
export type Intent2Mode = 'nearby' | 'landmark' | 'textsearch';
export type Intent2Reason = 'near_me_phrase' | 'explicit_distance_from_me' | 'landmark_detected' | 'default_textsearch' | 'ambiguous';
export type LandmarkType = 'address' | 'poi' | 'street' | 'neighborhood' | 'area' | 'unknown' | null;
export type RadiusSource = 'explicit' | 'default' | null;

/**
 * INTENT2 Stage Result
 * Extracts food and location intent from query with mode classification
 */
export interface Intent2Result {
  language: Gate2Language;
  mode: Intent2Mode;
  reason: Intent2Reason;
  food: {
    raw: string | null;
    canonicalEn: string | null;
  };
  location: {
    isRelative: boolean;
    text: string | null;
    landmarkText: string | null;
    landmarkType: LandmarkType;
  };
  radiusMeters: number | null;
  radiusSource: RadiusSource;
  queryRegionCode: 'IL' | 'OTHER' | null;
  confidence: number;
}

/**
 * ROUTE_LLM Stage Result
 * Discriminated union of all route-specific mappings
 * Imported from schemas.ts (Zod as source of truth)
 */
export type { RouteLLMMapping } from './stages/route-llm/schemas.js';

/**
 * GOOGLE_MAPS Stage Result
 * Raw results from Google Places API
 */
export interface GoogleMapsResult {
  results: any[];
  providerMethod: 'textSearch' | 'nearbySearch' | 'landmarkPlan';
  durationMs: number;
  servedFrom?: 'cache' | 'google_api'; // Track if results came from cache or API
}
