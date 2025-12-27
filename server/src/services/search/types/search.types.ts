/**
 * Core type definitions for the unified search BFF
 * Phase 3: Capability-based architecture
 */

// ============================================================================
// Core Domain Types
// ============================================================================

export type SearchMode = 'textsearch' | 'nearbysearch' | 'findplace';

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
  
  // Language
  language: string;  // ISO code: 'en', 'he', 'ar', etc.
  regionLanguage?: string;  // Region's primary language
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
  matchReasons?: string[];  // Why this matches the query
  
  // Scoring (added by RankingService)
  score?: number;  // 0-100
  
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

export interface RefinementChip {
  id: string;
  emoji: string;
  label: string;
  action: 'filter' | 'sort' | 'map';
  filter?: string;  // Filter to apply (e.g., "price<=2")
}

// ============================================================================
// Assist Types (Future: micro-assist UI)
// ============================================================================

export type AssistType = 'clarify' | 'suggest' | 'guide' | 'recovery';

export interface AssistPayload {
  type: AssistType;
  mode?: 'NORMAL' | 'RECOVERY';  // Recovery mode for 0 results or weak results
  message: string;
  suggestedActions: {
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
  language: string;
  
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
// Response Plan Types (RSE → ChatBack Communication)
// ============================================================================

export * from './response-plan.types.js';
