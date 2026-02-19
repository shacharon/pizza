/**
 * Core type definitions for the unified search BFF
 * Phase 3: Capability-based architecture
 * 
 * This file is now a re-export facade for backward compatibility.
 * Types have been split into domain-specific modules:
 * - language.types.ts: Language and localization types
 * - restaurant.types.ts: Restaurant, location, and provider types
 * - filter.types.ts: Search modes, filters, and parameters
 * - response.types.ts: Search responses, results, and metadata
 */

// Re-export all types from domain-specific modules
export * from './language.types.js';
export * from './restaurant.types.js';
export * from './filter.types.js';
export * from './response.types.js';

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * IntentService: Parses natural language queries into structured intents
 */
export interface IIntentService {
  parse(text: string, context?: import('./response.types.js').SessionContext): Promise<import('./response.types.js').IntentParseResult>;
  // Phase 3: Direct SearchIntent extraction (optional - requires LLM)
  parseSearchIntent?(
    query: string,
    context?: import('./response.types.js').SessionContext,
    llm?: import('../../../llm/types.js').LLMProvider | null
  ): Promise<{ intent: import('./intent.dto.js').SearchIntent; confidence: number }>;
}

/**
 * GeoResolverService: Resolves location strings to coordinates
 */
export interface IGeoResolverService {
  resolve(location: string | import('./restaurant.types.js').Coordinates): Promise<import('./restaurant.types.js').ResolvedLocation>;
  getCacheStats?(): { size: number; hits: number; misses: number; hitRate: number };
}

/**
 * PlacesProviderService: Searches for restaurants via external APIs
 */
export interface IPlacesProviderService {
  search(params: import('./filter.types.js').SearchParams): Promise<import('./restaurant.types.js').RestaurantResult[]>;
  getName(): import('./restaurant.types.js').RestaurantSource;
}

/**
 * RankingService: Scores and sorts results based on relevance
 */
export interface IRankingService {
  rank(results: import('./restaurant.types.js').RestaurantResult[], intent: import('./response.types.js').ParsedIntent): import('./restaurant.types.js').RestaurantResult[];
}

/**
 * SuggestionService: Generates refinement chips and suggestions
 */
export interface ISuggestionService {
  generate(intent: import('./response.types.js').ParsedIntent, results: import('./restaurant.types.js').RestaurantResult[]): import('./response.types.js').RefinementChip[];
}

/**
 * SessionService: Manages search sessions and context
 */
export interface ISessionService {
  getOrCreate(sessionId?: string): Promise<import('./response.types.js').SearchSession>;
  get(sessionId: string): Promise<import('./response.types.js').SearchSession | null>;
  update(sessionId: string, data: Partial<import('./response.types.js').SearchSession>): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  getStats?(): { totalSessions: number; activeSessions: number };
}

// ============================================================================
// Response Plan Types (RSE → ChatBack Communication)
// ============================================================================

export * from './response-plan.types.js';
