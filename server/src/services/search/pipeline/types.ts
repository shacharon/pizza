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
  
  // Confidence and routing
  confidence: number; // 0-1
  route: 'CORE' | 'FULL_LLM' | 'ASK_CLARIFY';
  routeReason: string;
  
  // Pipeline-specific: region from language/config
  region: string | null; // ISO country code (e.g., 'il', 'us', 'fr')
}

// ============================================================================
// Stage 2: INTENT_LITE Result
// ============================================================================

/**
 * INTENT_LITE stage output
 * Placeholder: Currently just passes through gate data
 * Future: Lightweight heuristics for common patterns
 */
export interface IntentLiteResult {
  // Passed through from gate
  gateResult: GateResult;
  
  // Placeholder fields (not used yet)
  refinedFood?: string | null;
  refinedLocation?: string | null;
  detectedPatterns?: string[];
  
  // Metadata
  skipped: boolean; // If stage was skipped
  reason?: string; // Why it was skipped
}

// ============================================================================
// Stage 3: ROUTE_MAP Result (Search Plan)
// ============================================================================

/**
 * ROUTE_MAP stage output (Search Plan)
 * Placeholder: Currently just passes through data
 * Future: Determines optimal search strategy
 */
export interface SearchPlan {
  // Input context
  intentLiteResult: IntentLiteResult;
  
  // Placeholder: Route decision (not used yet)
  routeType?: 'GOOGLE_PLACES' | 'FALLBACK' | 'CLARIFY';
  
  // Placeholder: Query strategy (not used yet)
  queryStrategy?: 'CANONICAL' | 'ORIGINAL' | 'COMPOSED';
  
  // Placeholder: Search parameters (not used yet)
  suggestedRadius?: number;
  suggestedFilters?: Record<string, unknown>;
  
  // Metadata
  skipped: boolean;
  reason?: string;
}

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
