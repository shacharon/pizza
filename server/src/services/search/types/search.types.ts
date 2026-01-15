/**
 * Core type definitions for the unified search BFF
 * Phase 3: Capability-based architecture
 */

// ============================================================================
// Language Types (Language Normalization)
// ============================================================================

/**
 * UI display language (chips, assistant, errors)
 * This determines the language of the app UI elements
 */
export type UILanguage = 'he' | 'en';

/**
 * Detected language of user's raw query (informational only)
 * Can be any language - used for logging and language-aware processing
 */
export type RequestLanguage = 'he' | 'en' | 'fr' | 'ar' | 'ru' | 'es' | 'de' | 'other';

/**
 * Language parameter sent to Google Places API
 * Rule: Hebrew → 'he', everything else → 'en' (universal fallback)
 */
export type GoogleLanguage = 'he' | 'en';

/**
 * Language context for a search request
 * Separates three distinct language concepts for consistent behavior
 */
export interface LanguageContext {
  uiLanguage: UILanguage;           // App display language (he|en only)
  requestLanguage: RequestLanguage; // Detected from query (any language)
  googleLanguage: GoogleLanguage;   // Sent to Google API (he if Hebrew, else en)
}

// ============================================================================
// Core Domain Types
// ============================================================================

export type SearchMode = 'textsearch' | 'nearbysearch' | 'findplace';

export type SearchGranularity = 'CITY' | 'STREET' | 'LANDMARK' | 'AREA';

export type Occasion = 'date' | 'friends' | 'family' | 'business' | 'casual' | 'any';

export type RestaurantSource = 'google_places' | 'tripadvisor' | 'internal';

/**
 * Verifiable Boolean - Tri-state type for data quality
 * - true: Verified and confirmed
 * - false: Verified and confirmed false
 * - 'UNKNOWN': Not verified or data not available
 * 
 * This enables the assistant to explicitly communicate uncertainty
 * instead of making assumptions about missing data.
 */
export type VerifiableBoolean = true | false | 'UNKNOWN';

// ============================================================================
// Location Types
// ============================================================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ResolvedLocation {
  coords: Coordinates;
  displayName: string;
  source: 'user' | 'geocode' | 'city';
  region?: string;  // NEW: Country code from geocoding (e.g., 'fr', 'il', 'us')
}

// ============================================================================
// Intent & Query Types
// ============================================================================

export interface ParsedIntent {
  // What the user wants
  query: string;  // Normalized query (e.g., "pizza")

  // Where to search
  location?: {
    city?: string;
    cityValidation?: 'VERIFIED' | 'FAILED' | 'AMBIGUOUS';  // NEW: Geocoding validation status
    place?: string;
    placeType?: 'street' | 'neighborhood' | 'landmark';
    coords?: Coordinates;
    radius?: number;
    region?: string;  // NEW: Country code from geocoding (e.g., 'fr', 'il', 'us')
  };

  // Search mode
  searchMode: SearchMode;

  // Filters
  filters: {
    openNow?: boolean;
    priceLevel?: number;  // 1-4
    dietary?: string[];   // ['kosher', 'vegan', 'gluten_free']
    mustHave?: string[];  // ['parking', 'wifi', 'outdoor_seating']
  };

  // Context
  occasion?: Occasion;
  vibe?: string[];  // ['romantic', 'quiet', 'casual', 'local']
  cuisine?: string[];  // ['pizza', 'sushi', 'italian']

  // Language (NEW: Separated into three distinct concepts)
  languageContext: LanguageContext;

  // DEPRECATED (kept for backward compatibility):
  language?: string;  // Use languageContext.googleLanguage instead
  regionLanguage?: string;  // Use languageContext.requestLanguage instead

  // NEW: Semantic header for AI assistant (non-breaking additions)
  intent?: 'search_food' | 'refine' | 'check_opening_status';
  confidenceLevel?: 'high' | 'medium' | 'low';  // Derived from numeric confidence
  requiresLiveData?: boolean;  // True if user asked about open/close/hours
  originalQuery: string;  // Immutable, for assistant context (REQUIRED)

  // NEW: Canonical extraction for consistent query building across languages
  canonical?: {
    category?: string;      // English: "italian restaurant", "sushi", "pizza"
    locationText?: string;  // Original: "Paris", "תל אביב", "Champs-Élysées"
  };

  // NEW: Search granularity (determines grouping behavior)
  granularity?: SearchGranularity;
}

export interface IntentParseResult {
  intent: ParsedIntent;
  confidence: number;  // 0-1, indicates how well we understood the query
}

// ============================================================================
// Restaurant Types
// ============================================================================

export interface RestaurantResult {
  // Identity
  id: string;  // Internal ID
  placeId: string;  // Provider's place ID
  source: RestaurantSource;

  // Basic info
  name: string;
  address: string;
  location: Coordinates;

  // Ratings & reviews
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;  // 1-4

  // Status (using VerifiableBoolean for data quality)
  openNow?: VerifiableBoolean;  // true | false | 'UNKNOWN'

  // Contact
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;

  // Media
  photoUrl?: string;
  photos?: string[];

  // Enrichment
  tags?: string[];  // ['pizza', 'romantic', 'fast-food']
  matchReasons?: string[];  // Why this matches the query (REQUIRED after ranking)

  // Scoring (added by RankingService)
  score?: number;  // 0-100 (REQUIRED after ranking)
  rank?: number;  // Phase 1: 1-based ranking position (1 = best)
  isWeakMatch?: boolean;  // Phase 3: True if score < weakMatchThreshold
  distanceScore?: number;  // Phase 3: 0-100 based on distance from center

  // City matching (added by CityFilterService)
  cityMatch?: boolean;  // Does this result match the target city?
  cityMatchReason?: 'LOCALITY' | 'FORMATTED_ADDRESS' | 'UNKNOWN';
  isNearbyFallback?: boolean;  // Was this added as a fallback result?

  // Grouping metadata (added by SearchOrchestrator)
  groupKind?: 'EXACT' | 'NEARBY';  // Which group this result belongs to
  distanceMeters?: number;  // Distance from search point

  // Metadata
  metadata?: {
    lastUpdated?: Date;
    cacheAge?: number;
  };
}

// ============================================================================
// Result Grouping Types (Answer-First UX)
// ============================================================================

export type GroupKind = 'EXACT' | 'NEARBY';

export interface ResultGroup {
  kind: GroupKind;
  label: string;  // e.g., "ברחוב אלנבי" or "באיזור"
  results: RestaurantResult[];
  distanceLabel?: string;  // e.g., "5 דקות הליכה"
  radiusMeters?: number;  // Actual radius used for this group
}

export interface StreetDetectionResult {
  isStreet: boolean;
  streetName?: string;
  detectionMethod: 'LLM' | 'PATTERN' | 'NONE';
}

// ============================================================================
// Suggestion Types
// ============================================================================

/**
 * Phase 5: RefinementChip - Actionable UI chips for search refinement
 * 
 * Action semantics:
 * - 'filter': Apply or modify search constraints (e.g., price, dietary, radius)
 * - 'sort': Change result ordering (e.g., by rating, distance, price)
 * - 'map': Location-based actions (e.g., show on map, get directions)
 * 
 * All chips are deterministic and i18n-translated.
 * Assistant can only select from allowlist (cannot invent new chips).
 */
/**
 * Refinement Chip - Single control surface for user actions
 * 
 * Chip Taxonomy (UI/UX Contract):
 * - FILTER: Multi-select, changes which results are included (e.g., "Budget", "Open now")
 * - SORT: Single-select, changes ordering only (exactly one active at a time)
 * - VIEW: Single-select, changes presentation mode (list vs map)
 * 
 * Action Types:
 * - action='filter' + filter='price<=2' → Include/exclude results
 * - action='sort' + filter='rating' → Sort results by field (filter field is sort key)
 * - action='map' → Switch to map view
 * 
 * State Management:
 * - SORT chips: Single-select (clicking new sort deactivates previous)
 * - FILTER chips: Multi-select (can activate multiple simultaneously)
 * - VIEW chips: Single-select (list or map)
 */
export interface RefinementChip {
  id: string;
  emoji: string;
  label: string;
  action: 'filter' | 'sort' | 'map';  // Taxonomy: FILTER=include/exclude, SORT=order, VIEW=presentation
  filter?: string;  // For action='filter': condition (e.g., "price<=2") | For action='sort': sort key (e.g., "rating")
}

// ============================================================================
// Assist Types (AI Assistant "Next Step" UI)
// ============================================================================

// Deterministic failure reasons (computed by code, not LLM)
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

// Live data verification metadata (for safety rules)
export interface LiveDataVerification {
  openingHoursVerified: boolean;  // True only if we fetched detailed hours
  source?: 'places_details' | 'places_search' | 'unknown';
}

export type AssistType = 'clarify' | 'suggest' | 'guide' | 'recovery';

/**
 * Phase 5: AssistPayload - AI assistant guidance with mode-aware behavior
 * 
 * Mode behavior:
 * - NORMAL: Brief summary + suggested next action
 * - RECOVERY: Explain issue + concrete recovery steps
 * - CLARIFY: Ask specific clarifying question
 */
export interface AssistPayload {
  type: AssistType;
  mode?: 'NORMAL' | 'RECOVERY' | 'CLARIFY';  // Phase 5: Added CLARIFY mode
  message: string;  // LLM-generated, multilingual

  // NEW: Reference chip IDs instead of inline actions
  primaryActionId?: string;     // Highlighted chip (most important next step)
  secondaryActionIds?: string[]; // Up to 4 additional chips (optional for backward compat)

  // NEW: Debug metadata
  reasoning?: string;            // Why these actions were chosen (debug only)
  failureReason?: FailureReason; // If something went wrong

  // DEPRECATED: Use chip IDs instead
  suggestedActions?: {
    label: string;
    query: string;
  }[];
}

// ============================================================================
// Clarification Types (Answer-First UX)
// ============================================================================

/**
 * Clarification - Used when user intent is ambiguous
 * Backend returns this instead of results, frontend displays as choice buttons
 */
export interface Clarification {
  question: string;        // Question in detected language (e.g., "Which city did you mean?")
  questionHe?: string;     // Hebrew translation (fallback)
  questionEn?: string;     // English translation (fallback)
  choices: ClarificationChoice[];
}

/**
 * ClarificationChoice - A single choice in a clarification
 */
export interface ClarificationChoice {
  id: string;                             // Choice ID (e.g., 'tel-aviv', 'parking-constraint')
  label: string;                          // Display label (e.g., "Tel Aviv, Israel")
  emoji?: string;                         // Optional emoji/icon
  constraintPatch: Partial<SearchParams>; // Constraints to apply if chosen
}

// ============================================================================
// Action Types (Human-in-the-Loop Pattern)
// ============================================================================

/**
 * Action levels define the approval requirements:
 * - L0: Read-only, no side effects, execute immediately
 * - L1: Soft actions, local side effects, approval UI recommended
 * - L2: Hard actions, external side effects, explicit approval required
 */
export type ActionLevel = 0 | 1 | 2;

/**
 * Action types for restaurant interactions
 */
export type ActionType =
  | 'VIEW_DETAILS'      // L0: View full restaurant details
  | 'GET_DIRECTIONS'    // L0: Open maps for directions
  | 'CALL_RESTAURANT'   // L0: Open phone dialer
  | 'SAVE_FAVORITE'     // L1: Save to favorites (localStorage in Phase 1)
  | 'SHARE'             // L0: Open share dialog
  | 'VIEW_MENU';        // L0: Open restaurant website/menu

/**
 * Action definition returned in search response
 */
export interface ActionDefinition {
  id: string;                // Unique action ID (e.g., 'directions', 'call')
  type: ActionType;          // Action type enum
  level: ActionLevel;        // Approval level (0, 1, 2)
  label: string;             // Display label (localized)
  icon: string;              // Icon/emoji to display
  requiresSelection?: boolean;  // True if requires a restaurant to be selected
  enabled?: boolean;         // False if action not available (e.g., no phone number)
}

/**
 * Proposed actions for a search result
 * - perResult: Quick actions shown on each restaurant card
 * - selectedItem: Detailed actions shown when a restaurant is selected
 */
export interface ProposedActions {
  perResult: ActionDefinition[];      // Quick actions (Directions, Call, Save)
  selectedItem: ActionDefinition[];   // Detailed actions (View Details, Menu, Share)
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionContext {
  sessionId?: string;  // For session-level caching
  previousIntent?: ParsedIntent;
  conversationHistory: {
    query: string;
    intent: ParsedIntent;
    timestamp: Date;
  }[];

  // Session-level city cache (avoid redundant geocoding calls)
  validatedCities?: Map<string, {
    displayName: string;
    coordinates: Coordinates;
    status: 'VERIFIED' | 'FAILED' | 'AMBIGUOUS';
    timestamp: number;
  }>;

  // NEW: Cached region code from device/geocoding
  regionCode?: string; // ISO-2 uppercase (e.g., "IL")
}

export interface SearchSession {
  id: string;
  context: SessionContext;
  createdAt: Date;
  updatedAt: Date;

  // Current search
  currentIntent?: ParsedIntent;
  currentResults?: RestaurantResult[];

  // User preferences (future)
  userLanguage?: string;
  userLocation?: Coordinates;

  // ChatBack memory (RSE + ChatBack Layer)
  chatBackHistory?: {
    turnIndex: number;
    lastShownPlaceIds: string[];
    lastSuggestedActions: string[];    // Action IDs
    messageVariations: string[];        // Hashes of messages shown
    scenarioCount: Record<string, number>;  // Track scenario repetition
  };
}

// ============================================================================
// Search Parameters (for PlacesProvider)
// ============================================================================

export interface SearchParams {
  query: string;
  location: Coordinates;
  radius?: number;
  language: string;  // Google Places API language (he or en)
  region?: string;    // Country code for biasing results (e.g., 'fr', 'il', 'us')

  filters: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  };

  mode?: SearchMode;
  pageSize?: number;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * IntentService: Parses natural language queries into structured intents
 */
export interface IIntentService {
  parse(text: string, context?: SessionContext): Promise<IntentParseResult>;
  // Phase 3: Direct SearchIntent extraction (optional - requires LLM)
  parseSearchIntent?(
    query: string,
    context?: SessionContext,
    llm?: import('../../../llm/types.js').LLMProvider | null
  ): Promise<{ intent: import('./intent.dto.js').SearchIntent; confidence: number }>;
}

/**
 * GeoResolverService: Resolves location strings to coordinates
 */
export interface IGeoResolverService {
  resolve(location: string | Coordinates): Promise<ResolvedLocation>;
  getCacheStats?(): { size: number; hits: number; misses: number; hitRate: number };
}

/**
 * PlacesProviderService: Searches for restaurants via external APIs
 */
export interface IPlacesProviderService {
  search(params: SearchParams): Promise<RestaurantResult[]>;
  getName(): RestaurantSource;
}

/**
 * RankingService: Scores and sorts results based on relevance
 */
export interface IRankingService {
  rank(results: RestaurantResult[], intent: ParsedIntent): RestaurantResult[];
}

/**
 * SuggestionService: Generates refinement chips and suggestions
 */
export interface ISuggestionService {
  generate(intent: ParsedIntent, results: RestaurantResult[]): RefinementChip[];
}

/**
 * SessionService: Manages search sessions and context
 */
export interface ISessionService {
  getOrCreate(sessionId?: string): Promise<SearchSession>;
  get(sessionId: string): Promise<SearchSession | null>;
  update(sessionId: string, data: Partial<SearchSession>): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  getStats?(): { totalSessions: number; activeSessions: number };
}

// ============================================================================
// Phase 1: Async Assistant - Core Search Types
// ============================================================================

/**
 * Search context passed through the orchestrator
 * Contains request-level metadata and timing information
 */
export interface SearchContext {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  startTime: number;
  timings: {
    intentMs: number;
    geocodeMs: number;
    providerMs: number;
    rankingMs: number;
    assistantMs: number;
    totalMs: number;
  };
}

/**
 * Core search result - fast response without LLM assistant
 * Returned by searchCore() in ~500ms
 */
export interface CoreSearchResult {
  requestId: string;
  sessionId: string;
  query: {
    original: string;
    parsed: ParsedIntent;
    language: string;
  };
  results: RestaurantResult[];
  groups?: ResultGroup[];
  chips: RefinementChip[];
  truthState: import('./truth-state.types.js').TruthState;
  meta: CoreSearchMetadata;
}

/**
 * Metadata for core search (before assistant)
 */
export interface CoreSearchMetadata {
  tookMs: number;
  mode: SearchMode;
  appliedFilters: string[];
  confidence: number;
  source: string;
  failureReason: FailureReason;
  timings: {
    intentMs: number;
    geocodeMs: number;
    providerMs: number;
    rankingMs: number;
  };
  liveData?: LiveDataVerification;
  cityFilter?: {
    enabled: boolean;
    targetCity?: string;
    resultsRaw: number;
    resultsFiltered: number;
    dropped: number;
    dropReasons: Record<string, number>;
  };
  performance?: {
    total: number;
    googleCall: number;
    cityFilter: number;
  };
  openNowSummary?: {
    open: number;
    closed: number;
    unknown: number;
    total: number;
  };
  capabilities?: {
    openNowApiSupported: boolean;
    closedNowApiSupported: boolean;
    closedNowIsDerived: boolean;
  };
}

// ============================================================================
// Response Plan Types (RSE → ChatBack Communication)
// ============================================================================

export * from './response-plan.types.js';
