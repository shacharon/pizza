/**
 * LLM Purpose Types
 * 
 * Defines the distinct purposes for LLM calls across the application.
 * Each purpose can have its own model and timeout configuration.
 */

export type LLMPurpose = 
  | 'gate'           // Gate2 stage - fast food/non-food classification
  | 'intent'         // Intent stage - route decision (TEXTSEARCH/NEARBY/LANDMARK)
  | 'baseFilters'    // Base filters extraction (language, openState, etc.)
  | 'routeMapper'    // Route-specific query mapping (textSearch/nearbySearch/landmark)
  | 'ranking_profile' // Ranking profile selection - LLM-driven scoring weights
  | 'assistant';     // Assistant messages - UX-facing guidance (LLM-generated)

/**
 * Validate purpose at runtime
 */
export function isValidLLMPurpose(purpose: string): purpose is LLMPurpose {
  return ['gate', 'intent', 'baseFilters', 'routeMapper', 'ranking_profile', 'assistant'].includes(purpose);
}
