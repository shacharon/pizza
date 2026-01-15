/**
 * V2 Pipeline Types
 * 
 * Type definitions for the new search pipeline architecture:
 * GATE -> INTENT_LITE -> ROUTE_MAP -> Existing Flow
 * 
 * Phase: Structural Scaffold (placeholders only)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { ISessionService, Coordinates } from '../types/search.types.js';

// ============================================================================
// Pipeline Context
// ============================================================================

/**
 * Context passed through the entire pipeline
 * Contains request metadata and timing information
 */
export interface PipelineContext {
  requestId: string;
  traceId?: string | undefined;
  sessionId: string;
  startTime: number;
  skipAssistant: boolean;
  // NEW: Access to request for userLocation coords
  request: SearchRequest;
  // NEW: Session service for cached region
  sessionService?: ISessionService;
}

// ============================================================================
// Stage 1: GATE Result
// ============================================================================

/**
 * GATE stage output
 * Mapped from IntentGateResult with additional pipeline-specific fields
 */
export interface GateResult {
  // Language detection
  language: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other';
  
  // Food-related classification (NEW)
  isFoodRelated: boolean;
  
  // Food anchor
  hasFood: boolean;
  food: {
    raw: string | null;
    canonical: string | null; // English canonical
  };
  
  // Location anchor
  hasLocation: boolean;
  location: {
    raw: string | null;
    canonical: string | null; // Original language
    isRelative: boolean; // "near me", "closest"
    requiresUserLocation: boolean;
  };
  
  // Modifiers
  hasModifiers: boolean;
  modifiers: {
    openNow: boolean;
    cheap: boolean;
    glutenFree: boolean;
    vegetarian: boolean;
    vegan: boolean;
    kosher: boolean;
    delivery: boolean;
    takeaway: boolean;
    exclude: string[];
  };
  
  // Confidence
  confidence: number; // 0-1
  
  // Routing decision (UPDATED)
  route: 'INTENT_LITE' | 'ASK_CLARIFY' | 'BYPASS';
  routeReason: string;
  
  // Region code (UPDATED)
  regionCode: string; // ISO-2 uppercase (e.g., "IL", "US", "FR")
  
  // Debug info (NEW, optional)
  debug?: {
    hasFoodAnchor: boolean;
    hasLocationAnchor: boolean;
    regionSource: 'device_coords' | 'session_cache' | 'default_config';
  };
}

// ============================================================================
// Stage 2: INTENT_LITE Result
// ============================================================================

/**
 * INTENT_LITE stage output
 * LLM-based lightweight intent extraction
 */
export interface IntentLiteResult {
  // Core extracted intent
  food: { raw?: string; canonical: string }; // canonical MUST be English
  location: { text?: string; isRelative: boolean }; // Required, text is optional
  radiusMeters?: number;
  targetType: 'EXACT' | 'COORDS' | 'FREE';
  confidence: number; // 0-1
  virtual?: {
    dairy?: boolean;
    meat?: boolean;
    kosher?: boolean;
    vegan?: boolean;
    vegetarian?: boolean;
    glutenFree?: boolean;
    openNow?: boolean;
    cheap?: boolean;
    delivery?: boolean;
  };
  
  // Reference to gate result
  gateResult: GateResult;
  
  // Metadata
  skipped: boolean; // If stage was skipped
  reason?: string; // Why it was skipped
  fallback?: boolean; // True if timeout fallback was used
}

// ============================================================================
// Stage 3: ROUTE_MAP Result (Search Plan)
// ============================================================================

/**
 * ROUTE_MAP stage output (Search Plan)
 * Determines optimal search strategy
 */
export interface SearchPlan {
  // Search mode
  mode: 'nearbysearch' | 'textsearch';
  
  // Radius in meters
  radius: number;
  
  // Input context
  intentLiteResult: IntentLiteResult;
  
  // Metadata
  skipped: boolean;
  reason?: string;
}

// Re-export Coordinates for convenience
export type { Coordinates };

// ============================================================================
// Pipeline Result
// ============================================================================

/**
 * Final result from the pipeline
 * Contains the search response and pipeline metadata
 */
export interface PipelineResult {
  response: SearchResponse;
  metadata: {
    pipelineVersion: 'v2';
    stages: {
      gate: { durationMs: number; skipped: boolean };
      intentLite: { durationMs: number; skipped: boolean };
      routeMap: { durationMs: number; skipped: boolean };
    };
    totalPipelineMs: number;
  };
}

// ============================================================================
// Pipeline Stage Interface
// ============================================================================

/**
 * Generic pipeline stage interface
 * All stages should implement this for consistent behavior
 */
export interface PipelineStage<TInput, TOutput> {
  name: string;
  execute(input: TInput, context: PipelineContext): Promise<TOutput>;
}
