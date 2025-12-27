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
    ProposedActions,
    ActionDefinition,
    RestaurantResult,
} from '../types/search.types.js';
import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import { createSearchResponse } from '../types/search-response.dto.js';
import { QueryComposer } from '../utils/query-composer.js';
import { CityFilterService } from '../filters/city-filter.service.js';
import { StreetDetectorService } from '../detectors/street-detector.service.js';
import { TokenDetectorService } from '../detectors/token-detector.service.js';
import { ClarificationService } from '../clarification/clarification.service.js';
import { ResultStateEngine } from '../rse/result-state-engine.js';
import { ChatBackService } from '../chatback/chatback.service.js';
import type { ResultGroup } from '../types/search.types.js';

/**
 * SearchOrchestrator
 * Implements the Backend-for-Frontend pattern for unified search
 */
export class SearchOrchestrator {
    private cityFilter: CityFilterService;
    private streetDetector: StreetDetectorService;
    private tokenDetector: TokenDetectorService;
    private clarificationService: ClarificationService;
    private rse: ResultStateEngine;
    private chatBackService: ChatBackService;

    constructor(
        private intentService: IIntentService,
        private geoResolver: IGeoResolverService,
        private placesProvider: IPlacesProviderService,
        private rankingService: IRankingService,
        private suggestionService: ISuggestionService,
        private sessionService: ISessionService
    ) {
        this.cityFilter = new CityFilterService(5); // Min 5 results before fallback
        this.streetDetector = new StreetDetectorService();
        this.tokenDetector = new TokenDetectorService();
        this.clarificationService = new ClarificationService();
        this.rse = new ResultStateEngine();
        this.chatBackService = new ChatBackService();
        
        // Wire up session service to intent service for city caching
        if ('setSessionService' in this.intentService) {
            (this.intentService as any).setSessionService(this.sessionService);
        }
    }

    /**
     * Main search orchestration method
     * Coordinates all services to provide unified search results
     */
    async search(request: SearchRequest): Promise<SearchResponse> {
        const startTime = Date.now();

        console.log(`[SearchOrchestrator] Starting search: "${request.query}"`);

        try {
            // Step 1: Get or create session (generate ID if not provided)
            const sessionId = request.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const session = await this.sessionService.getOrCreate(sessionId);
            console.log(`[SearchOrchestrator] Session: ${session.id}`);

            // Step 1.5: Clear context if requested (intent reset)
            if (request.clearContext) {
                await this.sessionService.clearContext(session.id);
                console.log(`[SearchOrchestrator] 🔄 Context cleared (intent reset)`);
            }

            // Step 2: Parse intent with confidence scoring
            // Add sessionId to context for city caching
            const contextWithSession = {
                ...session.context,
                sessionId: session.id,
            };
            const { intent, confidence } = await this.intentService.parse(
                request.query,
                contextWithSession
            );
            console.log(`[SearchOrchestrator] Intent parsed (confidence: ${confidence.toFixed(2)})`);

            // Step 2.5: Check for ambiguous city (requires clarification)
            if (intent.location?.cityValidation === 'AMBIGUOUS') {
                console.log(`[SearchOrchestrator] ⚠️ Ambiguous city - returning clarification`);
                // We'd need geocoding candidates here - for now, return a generic clarification
                const clarification = this.clarificationService.generateConstraintClarification(
                    intent.location.city || 'location',
                    intent.language
                );

                return createSearchResponse({
                    sessionId,
                    originalQuery: request.query,
                    intent,
                    results: [],
                    chips: [],
                    clarification,
                    requiresClarification: true,
                    meta: {
                        tookMs: Date.now() - startTime,
                        mode: intent.searchMode,
                        appliedFilters: [],
                        confidence,
                        source: 'clarification'
                    }
                });
            }

            // Step 2.6: Check for failed city validation
            // Note: Only block if city validation explicitly failed (city doesn't exist)
            // If cityValidation is undefined, it means validation was skipped (API unavailable)
            // In that case, proceed with search using LLM-extracted coordinates
            if (intent.location?.cityValidation === 'FAILED' && intent.location?.city) {
                console.log(`[SearchOrchestrator] ❌ City not found: "${intent.location.city}" - showing clarification`);
                const clarification = this.clarificationService.generateConstraintClarification(
                    intent.location.city!,  // Safe: we checked it exists above
                    intent.language
                );

                return createSearchResponse({
                    sessionId,
                    originalQuery: request.query,
                    intent,
                    results: [],
                    chips: [],
                    clarification,
                    requiresClarification: true,
                    meta: {
                        tookMs: Date.now() - startTime,
                        mode: intent.searchMode,
                        appliedFilters: [],
                        confidence,
                        source: 'clarification'
                    }
                });
            } else if (intent.location?.city && !intent.location?.cityValidation) {
                console.log(`[SearchOrchestrator] ⚠️ City validation skipped (API unavailable), proceeding with LLM coordinates`);
            }

            // Step 2.7: Check for single-token ambiguous queries
            const tokenDetection = this.tokenDetector.detect(request.query, session.context);
            if (tokenDetection.requiresClarification && tokenDetection.constraintType) {
                console.log(`[SearchOrchestrator] 🤔 Single-token query detected: "${request.query}" (${tokenDetection.tokenType})`);

                const clarification = this.clarificationService.generateTokenClarification(
                    request.query,
                    tokenDetection.constraintType,
                    intent.language
                );

                return createSearchResponse({
                    sessionId,
                    originalQuery: request.query,
                    intent,
                    results: [],
                    chips: [],
                    clarification,
                    requiresClarification: true,
                    meta: {
                        tookMs: Date.now() - startTime,
                        mode: intent.searchMode,
                        appliedFilters: [],
                        confidence: tokenDetection.confidence,
                        source: 'clarification'
                    }
                });
            }

            // Step 3: Resolve location to coordinates
            const location = await this.resolveLocation(intent, request);
            console.log(`[SearchOrchestrator] Location resolved: ${location.displayName}`);

            // Step 4: Search for places
            const filters: SearchParams['filters'] = {};

            // Merge filters carefully
            const openNow = request.filters?.openNow ?? intent.filters.openNow;
            if (openNow !== undefined) filters.openNow = openNow;

            const priceLevel = request.filters?.priceLevel ?? intent.filters.priceLevel;
            if (priceLevel !== undefined) filters.priceLevel = priceLevel;

            const dietary = request.filters?.dietary ?? intent.filters.dietary;
            if (dietary !== undefined) filters.dietary = dietary;

            const mustHave = request.filters?.mustHave ?? intent.filters.mustHave;
            if (mustHave !== undefined) filters.mustHave = mustHave;

            // Compose city-aware query (adds city if not already present)
            const composedQuery = QueryComposer.composeCityQuery(
                intent.query,
                intent.location?.city
            );

            const searchParams: SearchParams = {
                query: composedQuery,  // Use composed query instead of raw intent.query
                location: location.coords,
                language: intent.language,
                filters,
                mode: intent.searchMode,
                pageSize: 10,
            };

            // Only add radius if it exists
            if (intent.location?.radius !== undefined) {
                searchParams.radius = intent.location.radius;
            }

            // Enhanced logging: query details
            console.log(`[SearchOrchestrator] 📍 Target city: ${intent.location?.city || 'none'}`);
            console.log(`[SearchOrchestrator] 📏 Radius: ${searchParams.radius || 'default'}m`);
            console.log(`[SearchOrchestrator] 🔎 Query sent to Google: "${composedQuery}"`);

            // Step 4: Detect if this is a street-level query
            const streetDetection = this.streetDetector.detect(intent, request.query);

            let groups: ResultGroup[];
            let allResults: RestaurantResult[];
            let googleCallTime: number;

            const googleCallStart = Date.now();

            if (streetDetection.isStreet) {
                console.log(`[SearchOrchestrator] 🛣️ Street query detected: "${streetDetection.streetName}" (${streetDetection.detectionMethod})`);

                // Dual search: exact (200m) + nearby (400m)
                const exactParams = { ...searchParams, radius: 200 };
                const nearbyParams = { ...searchParams, radius: 400 };

                const [exactResults, nearbyResults] = await Promise.all([
                    this.placesProvider.search(exactParams),
                    this.placesProvider.search(nearbyParams)
                ]);

                googleCallTime = Date.now() - googleCallStart;

                console.log(`[SearchOrchestrator] 📊 Exact (200m): ${exactResults.length}, Nearby (400m): ${nearbyResults.length}`);

                // Filter out duplicates (exact results already in nearby)
                const exactIds = new Set(exactResults.map(r => r.placeId));
                const uniqueNearby = nearbyResults.filter(r => !exactIds.has(r.placeId));

                // Mark group kind and distance
                exactResults.forEach(r => {
                    r.groupKind = 'EXACT';
                    r.distanceMeters = 200;
                });
                uniqueNearby.forEach(r => {
                    r.groupKind = 'NEARBY';
                    r.distanceMeters = 400;
                });

                // Create groups
                groups = [
                    {
                        kind: 'EXACT',
                        label: streetDetection.streetName || 'ברחוב',
                        results: exactResults,
                        radiusMeters: 200
                    },
                    {
                        kind: 'NEARBY',
                        label: 'באיזור',
                        results: uniqueNearby,
                        distanceLabel: '5 דקות הליכה',
                        radiusMeters: 400
                    }
                ];

                allResults = [...exactResults, ...uniqueNearby];
                console.log(`[SearchOrchestrator] ✅ Grouped: ${exactResults.length} exact + ${uniqueNearby.length} nearby = ${allResults.length} total`);
            } else {
                // Single search (existing flow)
                const rawResults = await this.placesProvider.search(searchParams);
                googleCallTime = Date.now() - googleCallStart;

                console.log(`[SearchOrchestrator] 🔍 Raw results: ${rawResults.length} (took ${googleCallTime}ms)`);

                allResults = rawResults;

                // Single group for non-street queries
                groups = [{
                    kind: 'EXACT',
                    label: 'תוצאות',
                    results: allResults,
                    radiusMeters: searchParams.radius || 3000
                }];
            }

            // Step 4.5: Apply city filter to all results (coordinate-based)
            const filterStartTime = Date.now();
            const filterResult = this.cityFilter.filter(
                allResults,
                intent.location?.city,
                location.coords  // Pass city center coordinates for distance calculation
            );
            const filterTime = Date.now() - filterStartTime;

            console.log(`[SearchOrchestrator] ✂️ City filter: ${filterResult.kept.length} kept, ${filterResult.dropped.length} dropped (took ${filterTime}ms)`);
            if (Object.keys(filterResult.stats.dropReasons).length > 0) {
                console.log(`[SearchOrchestrator] 📊 Drop reasons:`, filterResult.stats.dropReasons);
            }

            // Update groups with filtered results
            if (streetDetection.isStreet) {
                const keptIds = new Set(filterResult.kept.map(r => r.placeId));
                groups = groups.map(group => ({
                    ...group,
                    results: group.results.filter(r => keptIds.has(r.placeId))
                }));
            } else {
                const firstGroup = groups[0];
                if (firstGroup) {
                    firstGroup.results = filterResult.kept;
                }
            }

            // Step 5: Rank filtered results by relevance
            const rankedResults = this.rankingService.rank(filterResult.kept, intent);
            console.log(`[SearchOrchestrator] Results ranked`);

            // Step 6: Take top 10
            const topResults = rankedResults.slice(0, 10);

            // Step 7: Generate suggestion chips
            const chips = this.suggestionService.generate(intent, topResults);
            console.log(`[SearchOrchestrator] Generated ${chips.length} suggestion chips`);

            // Step 7.5: RSE analyzes results and creates ResponsePlan
            const responsePlan = this.rse.analyze(
                topResults,
                intent,
                filterResult,
                confidence,
                groups
            );

            // Step 8: ChatBack generates natural language message if needed
            let assist: AssistPayload | undefined;
            if (responsePlan.scenario !== 'exact_match' || confidence < 0.8) {
                const memory = this.sessionService.getChatBackMemory(request.sessionId);
                const recentMessages = this.sessionService.getRecentMessages(request.sessionId, 3);
                
                const chatBackInput = {
                    userText: request.query,
                    intent,
                    responsePlan,
                    memory: memory ? {
                        turnIndex: memory.turnIndex,
                        lastMessages: recentMessages,
                        scenarioCount: memory.scenarioCount[responsePlan.scenario] || 0
                    } : undefined
                };
                
                const chatBackOutput = await this.chatBackService.generate(chatBackInput);
                
                assist = {
                    type: chatBackOutput.mode === 'RECOVERY' ? 'recovery' : 'clarify',
                    mode: chatBackOutput.mode,
                    message: chatBackOutput.message,
                    suggestedActions: chatBackOutput.actions.map(a => ({ 
                        label: a.label, 
                        query: a.query 
                    }))
                };
                
                // Save to session memory
                const messageHash = this.chatBackService.hashMessage(chatBackOutput.message);
                this.sessionService.addChatBackTurn(
                    request.sessionId,
                    topResults.map(r => r.placeId),
                    chatBackOutput.actions.map(a => a.id),
                    messageHash,
                    responsePlan.scenario
                );
                
                console.log(`[SearchOrchestrator] ChatBack generated ${chatBackOutput.mode} message for scenario: ${responsePlan.scenario}`);
            }

            // Step 8.5: Generate proposed actions (Human-in-the-Loop pattern)
            const proposedActions = this.generateProposedActions();
            console.log(`[SearchOrchestrator] Generated proposed actions (${proposedActions.perResult.length} quick, ${proposedActions.selectedItem.length} detailed)`);

            // Step 9: Update session with current state
            await this.sessionService.update(session.id, {
                currentIntent: intent,
                currentResults: topResults,
            });

            // Step 10: Build and return response
            const tookMs = Date.now() - startTime;
            const responseParams: Parameters<typeof createSearchResponse>[0] = {
                sessionId: session.id,
                originalQuery: request.query,
                intent,
                results: topResults,
                groups,  // NEW: Grouped results
                chips,
                proposedActions,
                meta: {
                    tookMs,
                    mode: intent.searchMode,
                    appliedFilters: this.getAppliedFiltersList(intent, request),
                    confidence,
                    source: this.placesProvider.getName(),
                    // NEW: City filter stats
                    cityFilter: intent.location?.city ? {
                        enabled: true,
                        targetCity: intent.location.city,
                        resultsRaw: allResults.length,
                        resultsFiltered: filterResult.kept.length,
                        dropped: filterResult.dropped.length,
                        dropReasons: filterResult.stats.dropReasons,
                    } : {
                        enabled: false,
                        resultsRaw: allResults.length,
                        resultsFiltered: filterResult.kept.length,
                        dropped: filterResult.dropped.length,
                        dropReasons: {},
                    },
                    // NEW: Performance breakdown
                    performance: {
                        total: tookMs,
                        googleCall: googleCallTime,
                        cityFilter: filterTime,
                    },
                    // NEW: Street grouping stats (only if street detected)
                    ...(streetDetection.isStreet ? {
                        streetGrouping: {
                            enabled: true,
                            ...(streetDetection.streetName ? { streetName: streetDetection.streetName } : {}),
                            detectionMethod: streetDetection.detectionMethod,
                            exactCount: groups[0]?.results.length || 0,
                            nearbyCount: groups[1]?.results.length || 0,
                            exactRadius: 200,
                            nearbyRadius: 400,
                        }
                    } : {}),
                },
            };

            // Only add assist if it exists
            if (assist) {
                responseParams.assist = assist;
            }

            const response = createSearchResponse(responseParams);

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
     * Generate proposed actions for Human-in-the-Loop pattern
     * Returns quick actions (per-result cards) and detailed actions (selected item)
     * Phase 1: All actions are defined here. Future: LLM-generated based on context
     */
    private generateProposedActions(): ProposedActions {
        // Quick actions shown on each restaurant card
        const perResult: ActionDefinition[] = [
            {
                id: 'directions',
                type: 'GET_DIRECTIONS',
                level: 0,
                label: 'Directions',
                icon: '📍',
                enabled: true,
            },
            {
                id: 'call',
                type: 'CALL_RESTAURANT',
                level: 0,
                label: 'Call',
                icon: '📞',
                enabled: true,
            },
            {
                id: 'save',
                type: 'SAVE_FAVORITE',
                level: 1,
                label: 'Save',
                icon: '❤️',
                enabled: true,
            },
        ];

        // Detailed actions shown when restaurant is selected
        const selectedItem: ActionDefinition[] = [
            {
                id: 'details',
                type: 'VIEW_DETAILS',
                level: 0,
                label: 'View Details',
                icon: 'ℹ️',
                requiresSelection: true,
                enabled: true,
            },
            {
                id: 'directions_full',
                type: 'GET_DIRECTIONS',
                level: 0,
                label: 'Get Directions',
                icon: '📍',
                requiresSelection: true,
                enabled: true,
            },
            {
                id: 'call_full',
                type: 'CALL_RESTAURANT',
                level: 0,
                label: 'Call Restaurant',
                icon: '📞',
                requiresSelection: true,
                enabled: true,
            },
            {
                id: 'menu',
                type: 'VIEW_MENU',
                level: 0,
                label: 'View Menu',
                icon: '📋',
                requiresSelection: true,
                enabled: true,
            },
            {
                id: 'save_full',
                type: 'SAVE_FAVORITE',
                level: 1,
                label: 'Save to Favorites',
                icon: '❤️',
                requiresSelection: true,
                enabled: true,
            },
            {
                id: 'share',
                type: 'SHARE',
                level: 0,
                label: 'Share Restaurant',
                icon: '↗️',
                requiresSelection: true,
                enabled: true,
            },
        ];

        return { perResult, selectedItem };
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
            sessionStats: this.sessionService.getStats?.(),
            geocodeStats: this.geoResolver.getCacheStats?.(),
        };
    }
}

