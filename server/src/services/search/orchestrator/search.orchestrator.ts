/**
 * SearchOrchestrator: The heart of the BFF
 * Coordinates all capability services to provide unified search functionality
 * 
 * Phase 2: Builds TruthState to lock deterministic decisions
 * before passing minimal context to LLM Pass B
 * Phase 7: Production hardening with timeout/retry guards and structured logging
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
import type { Diagnostics } from '../types/diagnostics.types.js';
import type { TruthState } from '../types/truth-state.types.js';
import { computeResponseMode, buildAssistantContext } from '../types/truth-state.types.js';
import { createSearchResponse } from '../types/search-response.dto.js';
import { QueryComposer } from '../utils/query-composer.js';
import { CityFilterService } from '../filters/city-filter.service.js';
import { StreetDetectorService } from '../detectors/street-detector.service.js';
import { TokenDetectorService } from '../detectors/token-detector.service.js';
import { GranularityClassifier } from '../detectors/granularity-classifier.service.js';
import { ClarificationService } from '../clarification/clarification.service.js';
import { ResultStateEngine } from '../rse/result-state-engine.js';
import { ChatBackService } from '../chatback/chatback.service.js';
import { FailureDetectorService, AssistantNarrationService, isTimeoutError, isQuotaError } from '../assistant/index.js';
import type { ResultGroup, LiveDataVerification } from '../types/search.types.js';
import { calculateOpenNowSummary } from '../utils/opening-hours-summary.js';

// Phase 7: Production hardening imports
import { logger } from '../../../lib/logger/structured-logger.js';
import { withTimeout, isTimeoutError as isTimeout } from '../../../lib/reliability/timeout-guard.js';
import { withRetry } from '../../../lib/reliability/retry-policy.js';
import { ReliabilityConfig } from '../config/reliability.config.js';
import { SearchConfig } from '../config/search.config.js';

/**
 * SearchOrchestrator
 * Implements the Backend-for-Frontend pattern for unified search
 */
export class SearchOrchestrator {
    private cityFilter: CityFilterService;
    private streetDetector: StreetDetectorService;
    private tokenDetector: TokenDetectorService;
    private granularityClassifier: GranularityClassifier;
    private clarificationService: ClarificationService;
    private rse: ResultStateEngine;
    private chatBackService: ChatBackService;
    // NEW: AI Assistant services
    private failureDetector: FailureDetectorService;
    private assistantNarration: AssistantNarrationService;

    constructor(
        private intentService: IIntentService,
        private geoResolver: IGeoResolverService,
        private placesProvider: IPlacesProviderService,
        private rankingService: IRankingService,
        private suggestionService: ISuggestionService,
        private sessionService: ISessionService,
        private llm?: import('../../../types/llm.types.js').LLMProvider | null
    ) {
        this.cityFilter = new CityFilterService(5); // Min 5 results before fallback
        this.streetDetector = new StreetDetectorService();
        this.tokenDetector = new TokenDetectorService();
        this.granularityClassifier = new GranularityClassifier();
        this.clarificationService = new ClarificationService();
        this.rse = new ResultStateEngine();
        this.chatBackService = new ChatBackService();
        // NEW: AI Assistant services
        this.failureDetector = new FailureDetectorService();
        this.assistantNarration = new AssistantNarrationService(llm || null);
        
        // Wire up session service to intent service for city caching
        if ('setSessionService' in this.intentService) {
            (this.intentService as any).setSessionService(this.sessionService);
        }
    }

    /**
     * Main search orchestration method
     * Coordinates all services to provide unified search results
     * 
     * Phase 7: Enhanced with structured logging
     */
    async search(request: SearchRequest): Promise<SearchResponse> {
        const startTime = Date.now();
        const requestId = request.sessionId || `req-${Date.now()}`;

        // Diagnostics tracking
        const timings = {
            intentMs: 0,
            geocodeMs: 0,
            providerMs: 0,
            rankingMs: 0,
            assistantMs: 0,
            totalMs: 0,
        };
        const flags = {
            usedLLMIntent: false,
            usedLLMAssistant: false,
            usedTranslation: false,
            liveDataRequested: false,
        };

        // Phase 7: Structured logging at entry point
        logger.info('Search request received', {
            requestId,
            query: request.query,
            language: request.language,
            hasUserLocation: !!request.userLocation
        });

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
            // Step 2: Parse intent with confidence scoring
            // NOTE: Intent is parsed ONCE per search request.
            // Chip interactions/refinements apply on top of this intent WITHOUT re-parsing.
            // This prevents unnecessary LLM calls and maintains consistency.
            // Intent Performance Policy: Fast Path → Cache → LLM fallback
            
            // Add sessionId to context for city caching
            const contextWithSession = {
                ...session.context,
                sessionId: session.id,
            };
            const intentStart = Date.now();
            const { intent, confidence } = await this.intentService.parse(
                request.query,
                contextWithSession
            );
            timings.intentMs = Date.now() - intentStart;
            flags.usedLLMIntent = true;
            flags.liveDataRequested = intent.requiresLiveData || false;
            
            // Chips/refinements are deterministic operations on the base intent.
            // If user selects a chip (e.g., "Budget", "Open Now"), the frontend
            // applies that filter directly without triggering a new intent parse.
            
            /**
             * Phase 4: Language Resolution Policy (Single Source of Truth)
             * Priority: request.language > session.language > intent.language > default ('en')
             * Once resolved, ParsedIntent.language is AUTHORITATIVE for entire request.
             */
            if (!intent.language || intent.language.length === 0) {
                intent.language = this.resolveLanguage(request, session);
                console.warn(`[SearchOrchestrator] Language not set by intent, using fallback: ${intent.language}`);
            }
            
            console.log(`[SearchOrchestrator] Intent parsed (confidence: ${confidence.toFixed(2)}, language: ${intent.language}, ${timings.intentMs}ms)`);

            // Step 2.5: Check for ambiguous city (requires clarification)
            if (intent.location?.cityValidation === 'AMBIGUOUS') {
                console.log(`[SearchOrchestrator] ⚠️ Ambiguous city - returning clarification`);
                const clarification = this.clarificationService.generateConstraintClarification(
                    intent.location.city || 'location',
                    intent.language
                );

                // Phase 2: Build TruthState for early exit
                const failureReason = 'GEOCODING_FAILED' as const;
                const mode = computeResponseMode(failureReason, false); // No weak matches in early exit
                const truthState: TruthState = {
                    intent,
                    results: [],
                    chips: [],
                    failureReason,
                    mode,
                    assistantContext: buildAssistantContext({
                        intent,
                        results: [],
                        chips: [],
                        failureReason,
                        mode,
                        liveDataVerified: false,
                    }),
                };

                // Generate assist with minimal context
                const assistStart = Date.now();
                const assist = await this.assistantNarration.generate({
                    context: truthState.assistantContext,
                });
                timings.assistantMs = Date.now() - assistStart;
                flags.usedLLMAssistant = !assist.reasoning?.includes('fallback');

                return createSearchResponse({
                    sessionId,
                    originalQuery: request.query,
                    intent,
                    results: [],
                    chips: [],
                    assist,
                    clarification,
                    requiresClarification: true,
                    meta: {
                        tookMs: Date.now() - startTime,
                        mode: intent.searchMode,
                        appliedFilters: [],
                        confidence,
                        source: 'clarification',
                        failureReason,
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

                // Phase 2: Build TruthState for early exit
                const failureReason = 'GEOCODING_FAILED' as const;
                const mode = computeResponseMode(failureReason, false); // No weak matches in early exit
                const truthState: TruthState = {
                    intent,
                    results: [],
                    chips: [],
                    failureReason,
                    mode,
                    assistantContext: buildAssistantContext({
                        intent,
                        results: [],
                        chips: [],
                        failureReason,
                        mode,
                        liveDataVerified: false,
                    }),
                };

                // Generate assist with minimal context
                const assistStart = Date.now();
                const assist = await this.assistantNarration.generate({
                    context: truthState.assistantContext,
                });
                timings.assistantMs = Date.now() - assistStart;
                flags.usedLLMAssistant = !assist.reasoning?.includes('fallback');

                return createSearchResponse({
                    sessionId,
                    originalQuery: request.query,
                    intent,
                    results: [],
                    chips: [],
                    assist,
                    clarification,
                    requiresClarification: true,
                    meta: {
                        tookMs: Date.now() - startTime,
                        mode: intent.searchMode,
                        appliedFilters: [],
                        confidence,
                        source: 'clarification',
                        failureReason,
                    }
                });
            } else if (intent.location?.city && !intent.location?.cityValidation) {
                console.log(`[SearchOrchestrator] ⚠️ City validation skipped (API unavailable), proceeding with LLM coordinates`);
            }

            // Step 2.7: Check for single-token ambiguous queries
            const tokenDetection = this.tokenDetector.detect(request.query, session.context);
            
            // Step 2.7.1: Check for "open/closed now" keywords and set filter
            if (tokenDetection.constraintType === 'openNow') {
                intent.filters.openNow = true;
                console.log(`[SearchOrchestrator] 🟢 Open keyword detected ("${request.query}"), setting openNow: true`);
            } else if (tokenDetection.constraintType === 'closedNow') {
                intent.filters.openNow = false;
                console.log(`[SearchOrchestrator] 🔴 Closed keyword detected ("${request.query}"), setting openNow: false`);
            }
            
            if (tokenDetection.requiresClarification && tokenDetection.constraintType) {
                console.log(`[SearchOrchestrator] 🤔 Single-token query detected: "${request.query}" (${tokenDetection.tokenType})`);

                const clarification = this.clarificationService.generateTokenClarification(
                    request.query,
                    tokenDetection.constraintType,
                    intent.language
                );

                // Phase 2: Build TruthState for early exit
                const failureReason = 'LOW_CONFIDENCE' as const;
                const mode = computeResponseMode(failureReason, false); // No weak matches in early exit
                const truthState: TruthState = {
                    intent,
                    results: [],
                    chips: [],
                    failureReason,
                    mode,
                    assistantContext: buildAssistantContext({
                        intent,
                        results: [],
                        chips: [],
                        failureReason,
                        mode,
                        liveDataVerified: false,
                    }),
                };

                // Generate assist with minimal context
                const assistStart = Date.now();
                const assist = await this.assistantNarration.generate({
                    context: truthState.assistantContext,
                });
                timings.assistantMs = Date.now() - assistStart;
                flags.usedLLMAssistant = !assist.reasoning?.includes('fallback');

                return createSearchResponse({
                    sessionId,
                    originalQuery: request.query,
                    intent,
                    results: [],
                    chips: [],
                    assist,
                    clarification,
                    requiresClarification: true,
                    meta: {
                        tookMs: Date.now() - startTime,
                        mode: intent.searchMode,
                        appliedFilters: [],
                        confidence: tokenDetection.confidence,
                        source: 'clarification',
                        failureReason,
                    }
                });
            }

            // Step 3: Resolve location to coordinates
            const geocodeStart = Date.now();
            const location = await this.resolveLocation(intent, request);
            timings.geocodeMs = Date.now() - geocodeStart;
            console.log(`[SearchOrchestrator] Location resolved: ${location.displayName} (${timings.geocodeMs}ms)`);

            // Step 4: Search for places
            const filters: SearchParams['filters'] = {};

            // Merge filters carefully
            // IMPORTANT: Google Places API doesn't support openNow=false (closed filter)
            // We'll filter for closed restaurants AFTER getting results (derived filter)
            const openNow = request.filters?.openNow ?? intent.filters.openNow;
            const needsClosedFiltering = openNow === false;
            
            // Only send openNow to Google if it's true (they don't support false)
            if (openNow === true) {
                filters.openNow = true;
            }

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
            
            // Step 4.1: Classify search granularity for grouping behavior
            const granularity = this.granularityClassifier.classify(intent, streetDetection);
            intent.granularity = granularity;
            console.log(`[SearchOrchestrator] 🎯 Search granularity: ${granularity}`);

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
                timings.providerMs = googleCallTime;

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
                timings.providerMs = googleCallTime;

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

            // Phase 8: Calculate opening hours summary BEFORE filtering (for transparency)
            const openNowSummary = calculateOpenNowSummary(allResults);
            console.log(`[SearchOrchestrator] 📊 Opening hours summary: ${openNowSummary.open} open, ${openNowSummary.closed} closed, ${openNowSummary.unknown} unknown`);

            // Phase 8: Apply derived filter for "closed now" (Google API doesn't support opennow=false)
            if (needsClosedFiltering) {
                console.log(`[SearchOrchestrator] 🔴 Applying derived "closed now" filter (Google API limitation)`);
                const beforeCount = allResults.length;
                allResults = allResults.filter(r => r.openNow === false);
                console.log(`[SearchOrchestrator] 🔴 Closed filter: ${beforeCount} → ${allResults.length} results`);
                
                // Update groups with closed-only results
                if (streetDetection.isStreet) {
                    const closedIds = new Set(allResults.map(r => r.placeId));
                    groups = groups.map(group => ({
                        ...group,
                        results: group.results.filter(r => closedIds.has(r.placeId))
                    }));
                } else {
                    groups[0].results = allResults;
                }
            }

            // Step 4.5: Apply city filter to all results (coordinate-based)
            const rankingStart = Date.now();
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

            // Step 5: Rank filtered results by relevance (Phase 3: with distance scoring)
            const rankedResults = this.rankingService.rank(
                filterResult.kept,
                intent,
                location.coords  // Phase 3: Pass center coords for distance scoring
            );
            timings.rankingMs = Date.now() - rankingStart;
            console.log(`[SearchOrchestrator] Results ranked (${timings.rankingMs}ms)`);

            // Phase 3: Detect weak matches
            const { strong, weak } = this.detectWeakMatches(rankedResults);
            
            if (weak.length > 0) {
                console.log(`[SearchOrchestrator] ⚠️ Detected ${weak.length} weak matches (score < ${SearchConfig.ranking.thresholds.weakMatch})`);
                console.log(`[SearchOrchestrator] 📉 Weak matches dropped:`, weak.map(r => ({
                    name: r.name,
                    score: r.score?.toFixed(1),
                    rating: r.rating
                })));
            }

            // Step 6: Use strong results (or all if no weak matches)
            const topResults = strong.length > 0 ? strong.slice(0, 10) : rankedResults.slice(0, 10);
            console.log(`[SearchOrchestrator] 📊 Final result count: ${topResults.length} (${strong.length} strong, ${weak.length} weak from ${rankedResults.length} ranked)`);

            // Phase 3: Group results by search granularity
            if (location.coords) {
                groups = this.groupByGranularity(
                    topResults,
                    location.coords,
                    intent.granularity || 'CITY',
                    intent.location?.city
                );
            } else {
                // No coords: single EXACT group
                groups = [{
                    kind: 'EXACT',
                    label: 'Results',
                    results: topResults,
                }];
            }

            // Step 7: Compute failure reason deterministically (BEFORE chip generation for Phase 5)
            const meta = {
                source: this.placesProvider.getName(),
                cached: false,
                liveData: {
                    openingHoursVerified: false, // TODO: Set true when we fetch Places Details with hours
                    source: 'places_search' as const
                } as LiveDataVerification
            };
            
            const failureReason = this.failureDetector.computeFailureReason(
                topResults,
                confidence,
                meta,
                intent
            );
            
            console.log(`[SearchOrchestrator] Failure reason: ${failureReason}`);
            
            // Step 7.5: Compute mode (Phase 5: before chip generation)
            // Phase 5: Pass weak match flag to mode computation
            const mode = computeResponseMode(failureReason, weak.length > 0);
            console.log(`[SearchOrchestrator] Response mode: ${mode}`);

            // Step 8: Generate mode-aware suggestion chips (Phase 5: pass mode)
            const chips = this.suggestionService.generate(intent, topResults, mode);
            console.log(`[SearchOrchestrator] Generated ${chips.length} ${mode}-mode suggestion chips`);

            // Step 8.5: Build TruthState (Phase 2: Lock all deterministic decisions)
            const truthState: TruthState = {
                intent,
                results: topResults,
                chips,
                failureReason,
                mode,
                assistantContext: buildAssistantContext({
                    intent,
                    results: topResults,
                    chips,
                    failureReason,
                    mode,
                    liveDataVerified: meta.liveData.openingHoursVerified,
                }),
            };
            
            console.log(`[SearchOrchestrator] TruthState built: mode=${mode}, failureReason=${failureReason}`);
            
            // Step 9: Generate assistant message (LLM Pass B with minimal context)
            const assistStart = Date.now();
            const assist = await this.assistantNarration.generate({
                context: truthState.assistantContext,  // Phase 2: Minimal allowlist only
            });
            timings.assistantMs = Date.now() - assistStart;
            flags.usedLLMAssistant = !assist.reasoning?.includes('fallback');
            
            console.log(`[SearchOrchestrator] Assistant generated ${assist.mode} message (${timings.assistantMs}ms)`);

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
            timings.totalMs = tookMs;

            // Build diagnostics (only in dev/debug mode)
            const shouldIncludeDiagnostics = process.env.NODE_ENV !== 'production' || request.debug;
            const diagnostics: Diagnostics | undefined = shouldIncludeDiagnostics ? {
                timings,
                counts: {
                    results: topResults.length,
                    chips: chips.length,
                    weakMatches: weak.length,  // Phase 3: Weak matches count
                    ...(streetDetection.isStreet ? {
                        exact: groups[0]?.results.length || 0,
                        nearby: groups[1]?.results.length || 0,
                    } : {}),
                },
                top: {
                    placeIds: topResults.slice(0, 3).map(r => r.placeId),
                    scores: topResults.slice(0, 3).map(r => r.score ?? 0),  // Phase 3: Top scores
                    reasons: topResults.slice(0, 3).map(r => r.matchReasons ?? []),  // Phase 3: Top reasons
                },
                flags: {
                    ...flags,
                    hasWeakMatches: weak.length > 0,  // Phase 3: Weak matches flag
                },
                // Phase 4: Language diagnostics
                language: {
                    input: request.language || 'none',
                    resolved: intent.language,
                    mismatchDetected: false,  // Would be set if assistant validation failed
                },
                // Phase 7: Search granularity
                granularity: intent.granularity,
            } : undefined;

            const responseParams: Parameters<typeof createSearchResponse>[0] = {
                sessionId: session.id,
                originalQuery: request.query,
                intent,
                results: topResults,
                groups,  // NEW: Grouped results
                chips,
                assist,  // REQUIRED: Always included
                proposedActions,
                diagnostics,  // NEW: Diagnostics
                meta: {
                    tookMs,
                    mode: intent.searchMode,
                    appliedFilters: this.getAppliedFiltersList(intent, request),
                    confidence,
                    source: this.placesProvider.getName(),
                    failureReason,  // REQUIRED: Always set
                    // Additional context
                    originalQuery: request.query,
                    liveData: meta.liveData,
                    // City filter stats
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
                    // Performance breakdown
                    performance: {
                        total: tookMs,
                        googleCall: googleCallTime,
                        cityFilter: filterTime,
                    },
                    // Street grouping stats (only if street detected)
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
                    // Phase 8: Opening hours summary (for transparency)
                    openNowSummary,
                    // Phase 8: API capabilities (for derived filter disclosure)
                    capabilities: {
                        openNowApiSupported: true,
                        closedNowApiSupported: false,
                        closedNowIsDerived: true,
                    },
                },
            };

            const response = createSearchResponse(responseParams);

            // Phase 7: Structured logging at success exit point
            logger.info('Search completed successfully', {
                requestId,
                timings,
                failureReason: response.meta.failureReason,
                mode: response.assist?.mode,
                resultCount: response.results.length,
                usedLLMIntent: flags.usedLLMIntent,
                usedLLMAssistant: flags.usedLLMAssistant
            });

            console.log(`[SearchOrchestrator] ✅ Search complete in ${tookMs}ms`);
            if (diagnostics) {
                console.log(`[SearchOrchestrator] 📊 Diagnostics: Intent(${timings.intentMs}ms) + Geocode(${timings.geocodeMs}ms) + Provider(${timings.providerMs}ms) + Ranking(${timings.rankingMs}ms) + Assistant(${timings.assistantMs}ms)`);
            }
            
            // Phase 8: Log cache stats periodically
            if (Math.random() < 0.1) { // 10% of requests
                const { caches } = await import('../../../lib/cache/cache-manager.js');
                console.log(`[SearchOrchestrator] 📈 Cache Stats:`, {
                    places: caches.placesSearch.getStats(),
                    geocoding: caches.geocoding.getStats()
                });
            }
            
            return response;

        } catch (error) {
            // Phase 7: Structured error logging
            logger.error('Search failed', {
                requestId,
                query: request.query,
                timings
            }, error as Error);
            
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
     * Phase 4: Resolve language for request
     * Priority: request.language > session.language > default ('en')
     */
    private resolveLanguage(request: SearchRequest, session: { context?: { language?: string } }): string {
        // 1. Explicit request language (user override)
        if (request.language && request.language.length > 0) {
            return request.language;
        }
        
        // 2. Session language (preserved from previous turn)
        if (session.context?.language && session.context.language.length > 0) {
            return session.context.language;
        }
        
        // 3. Default to English
        return 'en';
    }

    /**
     * Phase 3: Detect weak matches based on score threshold
     */
    private detectWeakMatches(results: RestaurantResult[]): {
        strong: RestaurantResult[];
        weak: RestaurantResult[];
    } {
        const weakThreshold = SearchConfig.ranking.thresholds.weakMatch;
        
        const strong = results.filter(r => (r.score ?? 0) >= weakThreshold);
        const weak = results.filter(r => (r.score ?? 0) < weakThreshold);
        
        return { strong, weak };
    }

    /**
     * Phase 3: Group results by distance from center
     * Makes EXACT/NEARBY grouping consistent for all searches
     */
    private groupResultsByDistance(
        results: RestaurantResult[],
        centerCoords: { lat: number; lng: number },
        exactRadiusM: number = 500,
        nearbyRadiusM: number = 2000
    ): ResultGroup[] {
        const exact: RestaurantResult[] = [];
        const nearby: RestaurantResult[] = [];
        
        results.forEach(result => {
            if (result.distanceMeters !== undefined) {
                if (result.distanceMeters <= exactRadiusM) {
                    (result as any).groupKind = 'EXACT';
                    exact.push(result);
                } else if (result.distanceMeters <= nearbyRadiusM) {
                    (result as any).groupKind = 'NEARBY';
                    nearby.push(result);
                } else {
                    (result as any).groupKind = 'NEARBY';  // Far results still in NEARBY
                    nearby.push(result);
                }
            } else {
                (result as any).groupKind = 'EXACT';  // Default to EXACT if no distance
                exact.push(result);
            }
        });
        
        const groups: ResultGroup[] = [];
        
        if (exact.length > 0) {
            groups.push({
                kind: 'EXACT',
                label: 'Closest Results',
                results: exact,
                radiusMeters: exactRadiusM,
            });
        }
        
        if (nearby.length > 0) {
            groups.push({
                kind: 'NEARBY',
                label: 'Nearby Options',
                results: nearby,
                radiusMeters: nearbyRadiusM,
            });
        }
        
        return groups;
    }

    /**
     * Group results by search granularity
     * Applies appropriate distance thresholds based on search type
     */
    private groupByGranularity(
        results: RestaurantResult[],
        centerCoords: { lat: number; lng: number },
        granularity: import('../types/search.types.js').SearchGranularity,
        cityName?: string
    ): ResultGroup[] {
        
        // CITY: No distance grouping - all results in one group
        if (granularity === 'CITY') {
            results.forEach(r => (r as any).groupKind = 'EXACT');
            return [{
                kind: 'EXACT',
                label: cityName ? `Results in ${cityName}` : 'Results',
                results,
                radiusMeters: 3000
            }];
        }
        
        // STREET: Tight radii
        if (granularity === 'STREET') {
            return this.groupResultsByDistance(
                results,
                centerCoords,
                SearchConfig.streetSearch.exactRadius,  // 200m
                SearchConfig.streetSearch.nearbyRadius  // 400m
            );
        }
        
        // LANDMARK: Medium radii
        if (granularity === 'LANDMARK') {
            return this.groupResultsByDistance(
                results,
                centerCoords,
                1000,  // 1km for exact
                3000   // 3km for nearby
            );
        }
        
        // AREA: Larger radii
        if (granularity === 'AREA') {
            return this.groupResultsByDistance(
                results,
                centerCoords,
                1500,  // 1.5km for exact
                5000   // 5km for nearby
            );
        }
        
        // Fallback: treat as CITY
        return this.groupByGranularity(results, centerCoords, 'CITY', cityName);
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

