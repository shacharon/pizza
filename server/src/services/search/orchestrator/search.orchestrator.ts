/**
 * SearchOrchestrator: The heart of the BFF
 * Coordinates all capability services to provide unified search functionality
 */

import type {
  IIntentService,
  IGeoResolverService,
  IPlacesProviderService,
  IRankingService,
  ISuggestionService,
  ISessionService,
  ParsedIntent,
  SearchParams,
  AssistPayload,
} from '../types/search.types.js';
import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import { createSearchResponse } from '../types/search-response.dto.js';

/**
 * SearchOrchestrator
 * Implements the Backend-for-Frontend pattern for unified search
 */
export class SearchOrchestrator {
  constructor(
    private intentService: IIntentService,
    private geoResolver: IGeoResolverService,
    private placesProvider: IPlacesProviderService,
    private rankingService: IRankingService,
    private suggestionService: ISuggestionService,
    private sessionService: ISessionService
  ) {}

  /**
   * Main search orchestration method
   * Coordinates all services to provide unified search results
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();

    console.log(`[SearchOrchestrator] Starting search: "${request.query}"`);

    try {
      // Step 1: Get or create session
      const session = await this.sessionService.getOrCreate(request.sessionId);
      console.log(`[SearchOrchestrator] Session: ${session.id}`);

      // Step 2: Parse intent with confidence scoring
      const { intent, confidence } = await this.intentService.parse(
        request.query,
        session.context
      );
      console.log(`[SearchOrchestrator] Intent parsed (confidence: ${confidence.toFixed(2)})`);

      // Step 3: Resolve location to coordinates
      const location = await this.resolveLocation(intent, request);
      console.log(`[SearchOrchestrator] Location resolved: ${location.displayName}`);

      // Step 4: Search for places
      const searchParams: SearchParams = {
        query: intent.query,
        location: location.coords,
        radius: intent.location?.radius,
        language: intent.language,
        filters: {
          ...intent.filters,
          ...request.filters,
        },
        mode: intent.searchMode,
        pageSize: 10,
      };

      const rawResults = await this.placesProvider.search(searchParams);
      console.log(`[SearchOrchestrator] Found ${rawResults.length} raw results`);

      // Step 5: Rank results by relevance
      const rankedResults = this.rankingService.rank(rawResults, intent);
      console.log(`[SearchOrchestrator] Results ranked`);

      // Step 6: Take top 10
      const topResults = rankedResults.slice(0, 10);

      // Step 7: Generate suggestion chips
      const chips = this.suggestionService.generate(intent, topResults);
      console.log(`[SearchOrchestrator] Generated ${chips.length} suggestion chips`);

      // Step 8: Create assist payload if confidence is low
      const assist = this.shouldShowAssist(confidence)
        ? this.createAssistPayload(intent, confidence)
        : undefined;

      if (assist) {
        console.log(`[SearchOrchestrator] Low confidence (${confidence.toFixed(2)}) - attaching assist`);
      }

      // Step 9: Update session with current state
      await this.sessionService.update(session.id, {
        currentIntent: intent,
        currentResults: topResults,
      });

      // Step 10: Build and return response
      const tookMs = Date.now() - startTime;
      const response = createSearchResponse({
        sessionId: session.id,
        originalQuery: request.query,
        intent,
        results: topResults,
        chips,
        assist,
        meta: {
          tookMs,
          mode: intent.searchMode,
          appliedFilters: this.getAppliedFiltersList(intent, request),
          confidence,
          source: this.placesProvider.getName(),
        },
      });

      console.log(`[SearchOrchestrator] ✅ Search complete in ${tookMs}ms`);
      return response;

    } catch (error) {
      console.error('[SearchOrchestrator] ❌ Search failed:', error);
      throw error;
    }
  }

  /**
   * Resolve location to coordinates
   * Handles user location, city names, place names
   */
  private async resolveLocation(
    intent: ParsedIntent,
    request: SearchRequest
  ) {
    // Priority 1: User's explicit location (GPS)
    if (request.userLocation) {
      return await this.geoResolver.resolve(request.userLocation);
    }

    // Priority 2: Intent's location (city/place from query)
    if (intent.location?.city) {
      return await this.geoResolver.resolve(intent.location.city);
    }

    if (intent.location?.place) {
      return await this.geoResolver.resolve(intent.location.place);
    }

    // Priority 3: Intent's coordinates (if LLM extracted them)
    if (intent.location?.coords) {
      return await this.geoResolver.resolve(intent.location.coords);
    }

    // Fallback: return default location
    console.warn('[SearchOrchestrator] No location found, using fallback');
    return await this.geoResolver.resolve({ lat: 0, lng: 0 });
  }

  /**
   * Determine if we should show assist UI
   * Based on confidence threshold
   */
  private shouldShowAssist(confidence: number): boolean {
    const CONFIDENCE_THRESHOLD = 0.7;
    return confidence < CONFIDENCE_THRESHOLD;
  }

  /**
   * Create assist payload for micro-assist UI
   * Provides clarification or suggestions when confidence is low
   */
  private createAssistPayload(intent: ParsedIntent, confidence: number): AssistPayload {
    // Determine what's missing
    const missingLocation = !intent.location?.city && !intent.location?.place;
    const missingQuery = !intent.query || intent.query.length < 3;

    let message = '';
    const suggestedActions: AssistPayload['suggestedActions'] = [];

    if (missingQuery && missingLocation) {
      message = 'What are you looking for, and where?';
      suggestedActions.push(
        { label: 'Pizza in Paris', query: 'pizza in Paris' },
        { label: 'Sushi near me', query: 'sushi near me' },
        { label: 'Italian restaurant', query: 'italian restaurant' }
      );
    } else if (missingLocation) {
      message = `Where would you like to find ${intent.query}?`;
      suggestedActions.push(
        { label: `${intent.query} in Paris`, query: `${intent.query} in Paris` },
        { label: `${intent.query} near me`, query: `${intent.query} near me` },
        { label: `${intent.query} in London`, query: `${intent.query} in London` }
      );
    } else if (missingQuery) {
      message = `What type of food are you looking for?`;
      suggestedActions.push(
        { label: 'Pizza', query: 'pizza' },
        { label: 'Sushi', query: 'sushi' },
        { label: 'Italian', query: 'italian' }
      );
    } else {
      // Low confidence but complete query - offer refinements
      message = 'Here are some results. Want to refine your search?';
      suggestedActions.push(
        { label: 'Open now', query: `${intent.query} open now` },
        { label: 'Top rated', query: `${intent.query} top rated` },
        { label: 'Budget friendly', query: `${intent.query} budget` }
      );
    }

    return {
      type: 'clarify',
      message,
      suggestedActions,
    };
  }

  /**
   * Get list of applied filter strings for metadata
   */
  private getAppliedFiltersList(intent: ParsedIntent, request: SearchRequest): string[] {
    const filters: string[] = [];

    // From intent
    if (intent.filters.openNow) filters.push('opennow');
    if (intent.filters.priceLevel) filters.push(`price:${intent.filters.priceLevel}`);
    if (intent.filters.dietary) filters.push(...intent.filters.dietary.map(d => `dietary:${d}`));
    if (intent.filters.mustHave) filters.push(...intent.filters.mustHave.map(m => `amenity:${m}`));
    if (intent.location?.radius) filters.push(`radius:${intent.location.radius}`);

    // From explicit request filters
    if (request.filters?.openNow) filters.push('opennow');
    if (request.filters?.priceLevel) filters.push(`price:${request.filters.priceLevel}`);
    if (request.filters?.dietary) {
      filters.push(...request.filters.dietary.map(d => `dietary:${d}`));
    }

    return filters;
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      sessionStats: this.sessionService.getStats(),
      geocodeStats: this.geoResolver.getCacheStats(),
    };
  }
}

