/**
 * Search Domain Types
 * Mirror backend response contracts
 */

// Tri-state boolean for verifiable attributes
export type VerifiableBoolean = boolean | 'UNKNOWN';

export interface SearchRequest {
  query: string;
  sessionId?: string;
  userLocation?: Coordinates;
  filters?: SearchFilters;
  locale?: string;
  region?: string;
  clearContext?: boolean;  // Intent reset flag
}

export interface SearchResponse {
  requestId: string;  // For WebSocket subscription
  sessionId: string;
  query: ParsedQuery;
  results: Restaurant[];
  groups?: ResultGroup[];  // NEW: Phase B - Street grouping
  chips: RefinementChip[];
  assist?: MicroAssist;
  proposedActions?: ProposedActions;
  clarification?: Clarification;  // NEW: Answer-First UX
  requiresClarification?: boolean;  // NEW: Shorthand flag
  meta: SearchMeta;
}

export interface Restaurant {
  id: string;
  placeId: string;
  name: string;
  address: string;
  location: Coordinates;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  openNow?: VerifiableBoolean;  // Tri-state: true | false | 'UNKNOWN'

  // P0 Security: New photo fields (backend proxy)
  photoReference?: string;        // Photo reference (no API key): places/ChIJ.../photos/...
  photoReferences?: string[];     // Array of photo references
  photoUrl?: string;              // DEPRECATED: May still be present from backend (sanitized or internal proxy URL)

  phoneNumber?: string;
  website?: string;
  tags?: string[];
  source?: string;  // NEW: Phase B
  groupKind?: 'EXACT' | 'NEARBY';  // NEW: Phase B
  distanceMeters?: number;  // NEW: Phase B

  // NEW: Mobile-first UX - Match reason for top result
  matchReason?: string;  // Single reason text from backend
  matchReasons?: string[];  // Array of reason tags (e.g., ['highly_rated', 'open_now', 'nearby'])

  // Phase 1: Candidate pool ranking
  rank?: number;  // 1-based ranking position (1 = best)
  score?: number;  // 0-100 internal score (debug only)

  // NEW: Dietary hints (SOFT hints - no filtering)
  dietaryHints?: DietaryHints;
}

// Dietary hints for SOFT preferences (metadata only)
export interface DietaryHints {
  glutenFree?: DietaryHint;
  // Future: kosher?, vegan?, vegetarian?
}

export interface DietaryHint {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  matchedTerms: string[];
}

// Alias for backward compatibility
export type RestaurantResult = Restaurant;

/**
 * UX SIGNALS MODEL
 * Canonical priority system for card visual hints
 * 
 * PRIORITY ORDER (only ONE signal per card):
 * 1. OPEN/CLOSED (hard rule - always wins if exists)
 * 2. PRICE (cheap/mid/expensive)
 * 3. DISTANCE (nearby signal)
 * 4. INTENT_MATCH (e.g., "Great for breakfast")
 * 5. POPULARITY (highly rated)
 * 
 * UI consumes this signal, not raw fields.
 */
export type CardSignalType = 
  | 'OPEN_NOW'        // Priority 1: Currently open
  | 'CLOSED_NOW'      // Priority 1: Currently closed
  | 'PRICE_CHEAP'     // Priority 2: $ (priceLevel 1)
  | 'PRICE_MID'       // Priority 2: $$ (priceLevel 2)
  | 'PRICE_EXPENSIVE' // Priority 2: $$$ (priceLevel 3+)
  | 'NEARBY'          // Priority 3: < 500m distance
  | 'INTENT_MATCH'    // Priority 4: Matches query intent
  | 'POPULAR';        // Priority 5: Highly rated (>= 4.5 rating, >= 100 reviews)

export interface CardSignal {
  type: CardSignalType;
  priority: 1 | 2 | 3 | 4 | 5;
  label: string;      // UI display text (e.g., "פתוח עכשיו", "$$", "קרוב")
  metadata?: {        // Optional context for signal
    distanceMeters?: number;
    priceLevel?: number;
    matchReason?: string;
    rating?: number;
    reviewCount?: number;
  };
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SearchFilters {
  openNow?: boolean;
  priceLevel?: number;
  dietary?: string[];
  mustHave?: string[];
}

export interface RefinementChip {
  id: string;
  emoji: string;
  label: string;
  action: 'filter' | 'sort' | 'map';
  filter?: string;
}

// NEW: Failure reasons (deterministic, computed by backend)
export type FailureReason =
  | 'NONE'
  | 'NO_RESULTS'
  | 'LOW_CONFIDENCE'
  | 'GEOCODING_FAILED'
  | 'GOOGLE_API_ERROR'
  | 'TIMEOUT'
  | 'QUOTA_EXCEEDED'
  | 'LIVE_DATA_UNAVAILABLE'
  | 'WEAK_MATCHES';

// NEW: Live data verification
export interface LiveDataVerification {
  openingHoursVerified: boolean;
  source?: 'places_details' | 'places_search' | 'unknown';
}

// Updated: AI Assistant Payload (was MicroAssist)
export interface AssistPayload {
  type: 'clarify' | 'suggest' | 'guide' | 'recovery';
  mode?: 'NORMAL' | 'RECOVERY' | 'CLARIFY';  // Phase 5: Added CLARIFY mode
  message: string;  // LLM-generated, multilingual

  // NEW: Reference chip IDs instead of inline actions
  primaryActionId?: string;     // Highlighted chip
  secondaryActionIds?: string[]; // Up to 4 additional chips (optional for backward compat)

  // NEW: Debug metadata
  reasoning?: string;
  failureReason?: FailureReason;

  // DEPRECATED: For backward compatibility only
  suggestedActions?: { label: string; query: string }[];
}

// Alias for backward compatibility
export type MicroAssist = AssistPayload;

export interface ParsedQuery {
  original: string;
  parsed: any;
  language: string;
}

export interface SearchMeta {
  tookMs: number;
  mode: string;
  appliedFilters: string[];
  confidence: number;
  confidenceLevel?: 'high' | 'medium' | 'low';  // Phase 1: Combined confidence level
  source: string;
  // NEW: AI Assistant context
  originalQuery?: string;
  failureReason?: FailureReason;
  liveData?: LiveDataVerification;
  // Phase 8: Opening hours summary (for transparency)
  openNowSummary?: {
    open: number;
    closed: number;
    unknown: number;
    total: number;
  };
  // Phase 8: API capabilities (for derived filter disclosure)
  capabilities?: {
    openNowApiSupported: boolean;
    closedNowApiSupported: boolean;
    closedNowIsDerived: boolean;
  };
  // Order explanation (for ranking transparency)
  order_explain?: {
    profile: string;
    weights: {
      rating: number;
      reviews: number;
      distance: number;
      openBoost: number;
    };
    distanceOrigin: 'CITY_CENTER' | 'USER_LOCATION' | 'NONE';
    distanceRef: { lat: number; lng: number } | null;
    reordered: boolean;
  };
}

export interface ProposedActions {
  perResult: ActionDefinition[];
  selectedItem: ActionDefinition[];
}

export interface ActionDefinition {
  id: string;
  type: ActionType;
  level: ActionLevel;
  label: string;
  icon: string;
  requiresSelection?: boolean;
  enabled?: boolean;
}

// Re-export from action.types for convenience
export type ActionType =
  | 'VIEW_DETAILS'
  | 'GET_DIRECTIONS'
  | 'CALL_RESTAURANT'
  | 'SAVE_FAVORITE'
  | 'DELETE_FAVORITE'
  | 'SHARE'
  | 'VIEW_MENU'
  | 'REPORT_ISSUE';

export type ActionLevel = 0 | 1 | 2;

// NEW: Phase B - Result Grouping Types
export type GroupKind = 'EXACT' | 'NEARBY';

export interface ResultGroup {
  kind: GroupKind;
  label: string;
  results: Restaurant[];
  distanceLabel?: string;
  radiusMeters?: number;
}

// NEW: Answer-First UX - Clarification Types
export interface Clarification {
  question: string;
  questionHe?: string;
  questionEn?: string;
  choices: ClarificationChoice[];
}

export interface ClarificationChoice {
  id: string;
  label: string;
  emoji?: string;
  constraintPatch: Partial<SearchFilters>;  // Constraints to apply if chosen
}


