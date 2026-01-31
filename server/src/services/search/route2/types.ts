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
  debug?: { stopAfter: string }; // ← הוסף רק את זה

  jobCreatedAt?: number; // Timestamp when search job was created (for queueDelayMs)
  sessionService?: any; // Optional session service for region caching
  llmProvider: LLMProvider;
  query?: string; // Original user query (for assistant context on failures)
  userLocation?: {
    lat: number;
    lng: number;
  } | null;
  // UI language (from client, for assistant messages ONLY)
  // Backend owns searchLanguage policy; uiLanguage is for display only
  uiLanguage?: 'he' | 'en';
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
 * NEW: Includes hybrid ordering intent flags (language-agnostic)
 * 
 * IMPORTANT: regionCandidate is a suggestion only - filters_resolved decides the final region
 */
export interface IntentResult {
  route: MappingRoute;
  confidence: number;
  reason: string;
  language: Gate2Language;
  languageConfidence: number;
  regionCandidate: string | null; // ISO-3166-1 alpha-2 candidate (e.g., "IL", "GZ", "FR") or null if invalid - NOT final, must be validated by filters_resolved
  regionConfidence: number;
  regionReason: string;
  cityText?: string; // Optional city name for location bias (e.g., "גדרה", "אשקלון")

  // ===== NEW: Hybrid Ordering Intent Flags (Language-Agnostic) =====
  /** Distance/proximity intent detected */
  distanceIntent: boolean;
  /** Explicit "open now" filter requested */
  openNowRequested: boolean;
  /** Price preference intent */
  priceIntent: 'cheap' | 'any';
  /** Quality/special occasion intent */
  qualityIntent: boolean;
  /** Specific occasion type (if detected) */
  occasion: 'romantic' | null;
  /** Cuisine key (canonical identifier) */
  cuisineKey: string | null;
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
}
