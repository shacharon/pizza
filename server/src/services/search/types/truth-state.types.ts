/**
 * TruthState Types
 * 
 * Phase 2: Deterministic Truth Pipeline Hardening
 * 
 * Purpose: Lock all deterministic decisions in a single state object
 * before passing minimal context to LLM Pass B.
 * 
 * Key Principle: AssistantContext is an allowlist.
 * Adding fields requires Phase 0 review.
 */

import type { ParsedIntent, RestaurantResult, RefinementChip, FailureReason } from './search.types.js';
import type { Diagnostics } from './diagnostics.types.js';

/**
 * TruthState represents all deterministic decisions
 * This is the ONLY state that matters
 * LLM Pass B receives a filtered subset (assistantContext)
 */
export interface TruthState {
  // Core intent (semantic understanding)
  intent: ParsedIntent;

  // Results (ranked, filtered, grouped)
  results: RestaurantResult[];
  
  // Refinement chips (deterministically generated)
  chips: RefinementChip[];

  // Failure detection (deterministic)
  failureReason: FailureReason;
  
  // Response mode (deterministic)
  mode: ResponseMode;

  // Intent confidence (for assistant strategy decision)
  confidence?: number;
  
  // Response language (for assistant template selection)
  language: string;

  // Minimal context for LLM Pass B (ALLOWLIST ONLY)
  assistantContext: AssistantContext;

  // Performance metrics (optional)
  diagnostics?: Diagnostics;
}

/**
 * Response mode determines assistant behavior
 * Computed deterministically from failureReason
 */
export type ResponseMode = 'NORMAL' | 'RECOVERY' | 'CLARIFY';

/**
 * AssistantContext is the ONLY data LLM Pass B receives
 * This is an allowlist - adding fields here requires Phase 0 review
 */
export interface AssistantContext {
  // Language for response generation
  language: string;
  
  // Original user query (immutable reference)
  originalQuery: string;
  
  // Canonical interpretation (for narration)
  canonical?: {
    category?: string;      // "pizza"
    locationText?: string;  // "Tel Aviv"
  };
  
  // Result summary (aggregated, not individual results)
  resultsCount: number;
  topPlaceIds: string[];  // First 3 IDs only (for debugging)
  
  // Chip allowlist (ID + label only, no actions)
  chipAllowlist: ChipReference[];
  
  // Failure information
  failureReason: FailureReason;
  mode: ResponseMode;
  
  // Live data verification (for safety rules)
  liveData: {
    openingHoursVerified: boolean;
    source?: 'places_details' | 'places_search' | 'none';
  };
  
  // Intent flags (for conditional messaging)
  flags: {
    requiresLiveData: boolean;
    isLowConfidence: boolean;
    hasLocation: boolean;
  };
}

/**
 * ChipReference is minimal chip info for LLM selection
 * Does NOT include action details (prevents LLM from manipulating queries)
 */
export interface ChipReference {
  id: string;
  label: string;
  emoji?: string;
}

/**
 * Phase 5: Deterministic mode computation
 * Maps FailureReason + weak match state to ResponseMode
 * 
 * Mode semantics:
 * - NORMAL: Results available, good quality, standard UX
 * - RECOVERY: No results, weak matches, or system errors - guide user to refine
 * - CLARIFY: Ambiguous input or missing info - ask for clarification
 * 
 * @param failureReason - The detected failure reason (or NONE if successful)
 * @param hasWeakMatches - True if results have low scores (below weak threshold)
 * @returns The appropriate UI mode for the response
 */
export function computeResponseMode(
  failureReason: FailureReason,
  hasWeakMatches: boolean = false
): ResponseMode {
  // Clarification needed (user input ambiguous)
  if (failureReason === 'GEOCODING_FAILED' || failureReason === 'LOW_CONFIDENCE') {
    return 'CLARIFY';
  }
  
  // Recovery needed (system failure or no results)
  if (
    failureReason === 'NO_RESULTS' ||
    failureReason === 'GOOGLE_API_ERROR' ||
    failureReason === 'TIMEOUT' ||
    failureReason === 'QUOTA_EXCEEDED' ||
    failureReason === 'LIVE_DATA_UNAVAILABLE' ||
    failureReason === 'WEAK_MATCHES'
  ) {
    return 'RECOVERY';
  }
  
  // Phase 5: If weak matches detected, suggest recovery even if failureReason is NONE
  if (failureReason === 'NONE' && hasWeakMatches) {
    return 'RECOVERY';  // Suggest refinement for weak matches
  }
  
  // Normal operation
  return 'NORMAL';
}

/**
 * Build minimal assistant context from TruthState components
 * Extracts only allowlisted fields for LLM Pass B
 */
export function buildAssistantContext(params: {
  intent: ParsedIntent;
  results: RestaurantResult[];
  chips: RefinementChip[];
  failureReason: FailureReason;
  mode: ResponseMode;
  liveDataVerified?: boolean;
}): AssistantContext {
  return {
    // Language
    language: params.intent.language,
    
    // Original query
    originalQuery: params.intent.originalQuery || params.intent.query,
    
    // Canonical interpretation
    canonical: params.intent.canonical,
    
    // Result summary (count only, not full results)
    resultsCount: params.results.length,
    topPlaceIds: params.results.slice(0, 3).map(r => r.placeId),
    
    // Chip allowlist (minimal info only)
    chipAllowlist: params.chips.map(chip => ({
      id: chip.id,
      label: chip.label,
      emoji: chip.emoji,
    })),
    
    // Failure info
    failureReason: params.failureReason,
    mode: params.mode,
    
    // Live data verification
    liveData: {
      openingHoursVerified: params.liveDataVerified || false,
      source: params.liveDataVerified ? 'places_details' : 'places_search',
    },
    
    // Intent flags
    flags: {
      requiresLiveData: params.intent.requiresLiveData || false,
      isLowConfidence: params.intent.confidenceLevel === 'low',
      hasLocation: !!params.intent.location?.city,
    },
  };
}

