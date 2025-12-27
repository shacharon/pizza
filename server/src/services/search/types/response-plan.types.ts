/**
 * Response Plan Types
 * Full context for RSE → ChatBack communication
 * 
 * ⚠️ DEPRECATED: This interface is legacy and will be removed in Milestone B.
 * 
 * Current usage:
 * - ResultStateEngine.analyze() generates ResponsePlan
 * - ChatBackService consumes ResponsePlan
 * 
 * Migration plan:
 * - Milestone A: Mark as deprecated, no new usages
 * - Milestone B: Refactor RSE to use FailureReason directly
 * - Milestone C: Remove completely
 * 
 * Use SearchResponse + AssistPayload + FailureReason instead.
 */

export type ResponseScenario = 
  | 'exact_match'           // Good results, high confidence
  | 'zero_nearby_exists'    // 0 on street, but X nearby
  | 'zero_different_city'   // 0 in city, but X in nearby city
  | 'few_closing_soon'      // Found <3, all closing soon
  | 'few_all_closed'        // Found <3, all closed today
  | 'constraint_too_strict' // 0 results, constraint blocking
  | 'missing_location'      // Query has no city/place
  | 'missing_query'         // Query has no food type
  | 'repeat_search'         // Same query 2+ times
  | 'low_confidence'        // Good results but uncertain intent
  | 'high_unknown_rate';    // Many results but UNKNOWN hours/etc

export interface ResultsSummary {
  total: number;
  exact: number;           // On-street matches
  nearby: number;          // Within 400m
  openNow: number;
  closingSoon: number;     // Closing in <1 hour
  closedToday: number;
  unknownHours: number;    // openNow === 'UNKNOWN'
}

export interface FilterStats {
  droppedCount: number;
  reasons: {
    TOO_FAR?: number;
    DIFFERENT_CITY?: number;
    WRONG_CUISINE?: number;
  };
  nearbyCity?: string;      // If dropped due to different city
  nearbyDistance?: number;  // km to nearby city
}

export interface TimingInfo {
  currentTime: string;      // ISO timestamp
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';
  isWeekend: boolean;
}

export interface FallbackOption {
  type: 'expand_radius' | 'nearby_city' | 'remove_constraint' | 'similar_cuisine' | 'show_closed';
  label: string;            // For action button
  value: any;               // New search params
  explanation: string;      // Why suggesting this
}

export interface SuggestedAction {
  id: string;
  label: string;            // Action button text
  query: string;            // New search query
  priority: number;         // 1-3 (1=highest)
}

export interface ResponsePlan {
  scenario: ResponseScenario;
  results: ResultsSummary;
  filters: FilterStats;
  timing: TimingInfo;
  fallback: FallbackOption[];
  suggestedActions: SuggestedAction[];
  
  // Guardrails for ChatBack
  constraints: {
    mustMentionCount: boolean;     // Must reference result count
    mustSuggestAction: boolean;    // Must offer next step
    canMentionTiming: boolean;     // Can reference time/hours
    canMentionLocation: boolean;   // Can reference city/street
  };
}






