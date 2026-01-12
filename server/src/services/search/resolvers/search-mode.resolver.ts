/**
 * Search Mode Resolver
 * 
 * Determines whether to execute Full Search, Assisted Search, or enter Clarify mode.
 * This is a deterministic function based on anchor presence and context availability.
 * 
 * References:
 * - docs/SEARCH_TRUTH_MODEL.md (Section 3: Anchor Model)
 * - docs/SEARCH_INTENT_CONTRACT.md (Intent schema definition)
 */

import { SearchIntent } from '../types/intent.dto.js';

/**
 * Search mode types
 * 
 * FULL: Both anchors explicitly provided by user
 * ASSISTED: Location resolved via GPS or fallback (transparent to user)
 * CLARIFY: Missing anchors, need user clarification
 */
export type SearchMode = 'FULL' | 'ASSISTED' | 'CLARIFY';

/**
 * Context required for search mode resolution
 */
export interface SearchModeContext {
  /**
   * Whether GPS coordinates are available
   * (e.g., from browser geolocation API, mobile device)
   */
  gpsAvailable: boolean;
}

/**
 * Result of search mode resolution
 */
export interface SearchModeResult {
  /**
   * Resolved search mode
   */
  mode: SearchMode;
  
  /**
   * Reason code for transparency
   * Used in backend response to explain mode selection
   */
  reason: SearchModeReason;
  
  /**
   * Human-readable explanation (for logging/debugging)
   */
  explanation: string;
}

/**
 * Reason codes for search mode selection
 */
export type SearchModeReason =
  | 'both_anchors_explicit'      // Full: User provided food + location
  | 'gps_fallback'               // Assisted: Using GPS for location
  | 'missing_food_anchor'        // Clarify: No food type detected
  | 'missing_location_anchor'    // Clarify: No location detected
  | 'gps_unavailable'            // Clarify: User wants "near me" but GPS unavailable
  | 'default';                   // Fallback reason

/**
 * Resolve search mode based on intent and context
 * 
 * Decision Logic (from SEARCH_TRUTH_MODEL.md):
 * 
 * 1. IF food anchor missing → CLARIFY (ask for food)
 * 2. IF food present AND location explicit → FULL
 * 3. IF food present AND nearMe AND GPS available → ASSISTED
 * 4. IF food present AND nearMe AND GPS unavailable → CLARIFY
 * 5. IF food present AND no location → CLARIFY (ask for location)
 * 
 * @param intent - Validated search intent from LLM
 * @param context - Execution context (GPS availability, etc.)
 * @returns Search mode result with reason and explanation
 */
export function resolveSearchMode(
  intent: SearchIntent,
  context: SearchModeContext
): SearchModeResult {
  
  // Rule 1: Food anchor missing → CLARIFY
  if (!intent.foodAnchor.present) {
    return {
      mode: 'CLARIFY',
      reason: 'missing_food_anchor',
      explanation: 'Food anchor not detected in user query'
    };
  }
  
  // Rule 2: Food + explicit location (not nearMe) → FULL
  if (intent.locationAnchor.present && !intent.nearMe) {
    return {
      mode: 'FULL',
      reason: 'both_anchors_explicit',
      explanation: 'Both food and location anchors explicitly provided'
    };
  }
  
  // Rule 3: Food + nearMe + GPS available → ASSISTED
  if (intent.nearMe && context.gpsAvailable) {
    return {
      mode: 'ASSISTED',
      reason: 'gps_fallback',
      explanation: 'Using GPS coordinates for near-me search'
    };
  }
  
  // Rule 4: Food + nearMe + GPS unavailable → CLARIFY
  if (intent.nearMe && !context.gpsAvailable) {
    return {
      mode: 'CLARIFY',
      reason: 'gps_unavailable',
      explanation: 'User wants near-me search but GPS unavailable'
    };
  }
  
  // Rule 5: Food + no location → CLARIFY
  if (!intent.locationAnchor.present) {
    return {
      mode: 'CLARIFY',
      reason: 'missing_location_anchor',
      explanation: 'Location anchor not detected in user query'
    };
  }
  
  // Fallback (should not reach here if logic is complete)
  return {
    mode: 'FULL',
    reason: 'default',
    explanation: 'Default mode selection'
  };
}

/**
 * Helper: Check if search can proceed (not in CLARIFY mode)
 */
export function canExecuteSearch(result: SearchModeResult): boolean {
  return result.mode !== 'CLARIFY';
}

/**
 * Helper: Check if search is using GPS fallback
 */
export function isAssistedSearch(result: SearchModeResult): boolean {
  return result.mode === 'ASSISTED';
}

/**
 * Helper: Check if user clarification is needed
 */
export function needsClarification(result: SearchModeResult): boolean {
  return result.mode === 'CLARIFY';
}
