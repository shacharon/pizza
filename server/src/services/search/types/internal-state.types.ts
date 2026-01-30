/**
 * Internal State Types - Implementation Details
 * 
 * These types are internal to the search service and NOT exposed to external consumers.
 * Changes here do NOT affect API contracts or domain models.
 * 
 * Contains:
 * - Session management types
 * - Orchestration context
 * - Service interfaces (for dependency injection)
 * 
 * INTERNAL USE ONLY - Do not export to API responses
 */

import type { Coordinates, ParsedIntent, RestaurantResult, RefinementChip, RestaurantSource, ResolvedLocation, IntentParseResult } from './domain.types.js';
import type { SearchParams } from './api-contracts.types.js';

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
// Search Context (Orchestrator-level)
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
