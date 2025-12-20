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
    place?: string;
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
  
  // Status
  openNow?: boolean;
  
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
  
  // Metadata
  metadata?: {
    lastUpdated?: Date;
    cacheAge?: number;
  };
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

export type AssistType = 'clarify' | 'suggest' | 'guide';

export interface AssistPayload {
  type: AssistType;
  message: string;
  suggestedActions: {
    label: string;
    query: string;
  }[];
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionContext {
  previousIntent?: ParsedIntent;
  conversationHistory: {
    query: string;
    intent: ParsedIntent;
    timestamp: Date;
  }[];
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

