/**
 * ROUTE2 Orchestrator (Thin Coordinator)
 * Delegates to focused modules for SOLID compliance
 *
 * Pipeline: gate2 → intent → route-llm → filters → google-maps → post-filter → response
 * Parallelization: base_filters + post_constraints fire after Gate2, awaited when needed
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context } from './types.js';

import { executeGate2Stage } from './stages/gate2.stage.js';
import { executeIntentStage } from './stages/intent/intent.stage.js';
import { executeRouteLLM } from './stages/route-llm/route-llm.dispatcher.js';
import { executeGoogleMapsStage } from './stages/google-maps.stage.js';

import { resolveUserRegionCode } from './utils/region-resolver.js';
import { detectQueryLanguage } from './utils/query-language-detector.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { wsManager } from '../../../server.js';
import { sanitizeQuery } from '../../../lib/telemetry/query-sanitizer.js';
import { withTimeout } from '../../../lib/reliability/timeout-guard.js';

// Extracted modules
import { fireParallelTasks } from './orchestrator.parallel-tasks.js';
import { handleNearMeLocationCheck, applyNearMeRouteOverride } from './orchestrator.nearme.js';
import { handleGateStop, handleGateClarify, handleNearbyLocationGuard, handleGenericQueryGuard, checkGenericFoodQuery } from './orchestrator.guards.js';
import { resolveAndStoreFilters, applyPostFiltersToResults, mergePostConstraints } from './orchestrator.filters.js';
import { applyRankingIfEnabled } from './orchestrator.ranking.js';
import { buildFinalResponse } from './orchestrator.response.js';
import { handlePipelineError } from './orchestrator.error.js';
import { deriveEarlyRoutingContext } from './orchestrator.early-context.js';

// Extracted helpers
import { shouldDebugStop, resolveSessionId } from './orchestrator.helpers.js';

/**
 * Internal pipeline implementation (without timeout)
 */
async function searchRoute2Internal(request: SearchRequest, ctx: Route2Context): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);
  const { queryLen, queryHash } = sanitizeQuery(request.query);

  logger.info(
    { requestId, pipelineVersion: 'route2', event: 'pipeline_selected', queryLen, queryHash },
    '[ROUTE2] Pipeline selected'
  );

  // Store query in context for assistant hooks on failures
  ctx.query = request.query;

  // Detect query language (deterministic, for assistant messages)
  ctx.queryLanguage = detectQueryLanguage(request.query);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'query_language_detected',
      queryLanguage: ctx.queryLanguage,
      queryLen
    },
    '[ROUTE2] Query language detected (deterministic)'
  );

  let baseFiltersPromise = null;
  let postConstraintsPromise = null;

  try {
    // Best-effort: region resolution
    try {
      const { userRegionCode, source: userRegionSource } = await resolveUserRegionCode(ctx);
      ctx.userRegionCode = userRegionCode;

      logger.info(
        {
          requestId,
          pipelineVersion: 'route2',
          event: 'device_region_resolved',
          userRegionCode,
          userRegionSource
        },
        '[ROUTE2] Device region resolved'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.userRegionCode = 'OTHER';

      logger.warn(
        { requestId, pipelineVersion: 'route2', event: 'device_region_failed', error: msg },
        '[ROUTE2] Device region resolve failed (continuing)'
      );
    }

    if (!ctx.timings) ctx.timings = {};

    // STAGE 1: GATE2
    const gateResult = await executeGate2Stage(request, ctx);

    // Debug stop after gate2
    if (shouldDebugStop(ctx, 'gate2')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: gateResult.gate.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after gate2' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: gateResult.gate.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: { stopAfter: 'gate2', gate: gateResult } as any
      } as any;
    }

    // Gate2 error check
    if (gateResult.error) {
      logger.error(
        {
          requestId,
          pipelineVersion: 'route2',
          event: 'pipeline_failed',
          reason: 'gate2_error',
          errorCode: gateResult.error.code,
          errorMessage: gateResult.error.message
        },
        '[ROUTE2] Pipeline failed - gate2 error'
      );
      throw new Error(`${gateResult.error.code}: ${gateResult.error.message}`);
    }

    // Guard: GATE STOP (not food)
    const stopResponse = await handleGateStop(request, gateResult, ctx, wsManager);
    if (stopResponse) return stopResponse;

    // Guard: GATE ASK_CLARIFY (uncertain)
    const clarifyResponse = await handleGateClarify(request, gateResult, ctx, wsManager);
    if (clarifyResponse) return clarifyResponse;

    // STAGE 2: INTENT
    let intentDecision = await executeIntentStage(request, ctx);

    // Debug stop after intent
    if (shouldDebugStop(ctx, 'intent')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after intent' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: { stopAfter: 'intent', gate: gateResult, intent: intentDecision } as any
      } as any;
    }

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'intent_decided',
        route: intentDecision.route,
        ...(intentDecision.regionCandidate && { regionCandidate: intentDecision.regionCandidate }),
        language: intentDecision.language,
        confidence: intentDecision.confidence,
        reason: intentDecision.reason
      },
      '[ROUTE2] Intent routing decided' + (intentDecision.regionCandidate ? ' (regionCandidate will be validated by filters_resolved)' : '')
    );

    // Check for generic food query (e.g., "what to eat") - sets flag for later
    checkGenericFoodQuery(gateResult, intentDecision, ctx);

    // Guard: Block generic TEXTSEARCH queries without location anchor
    // CRITICAL: Run BEFORE parallel tasks to avoid wasted LLM work
    const genericQueryResponse = await handleGenericQueryGuard(request, gateResult, intentDecision, ctx, wsManager);
    if (genericQueryResponse) return genericQueryResponse;

    // Fire parallel tasks AFTER guard checks pass
    // Optimizes LLM calls for generic queries with location (skips unnecessary calls)
    const parallelTasks = fireParallelTasks(request, gateResult, intentDecision, ctx);
    baseFiltersPromise = parallelTasks.baseFiltersPromise;
    postConstraintsPromise = parallelTasks.postConstraintsPromise;

    // Near-me location check (early stop if no location)
    const nearMeResponse = await handleNearMeLocationCheck(request, intentDecision, ctx, wsManager);
    if (nearMeResponse) return nearMeResponse;

    // Near-me route override (if detected with location)
    intentDecision = applyNearMeRouteOverride(request, intentDecision, ctx);

    // OPTIMIZATION: Derive early routing context (region + language) from intent + device
    // This allows starting Google fetch immediately without waiting for base_filters
    const earlyContext = deriveEarlyRoutingContext(intentDecision, ctx);
    const googleParallelStartTime = Date.now();

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'google_parallel_started',
        regionCode: earlyContext.regionCode,
        providerLanguage: earlyContext.providerLanguage,
        uiLanguage: earlyContext.uiLanguage
      },
      '[ROUTE2] Starting Google fetch in parallel (early context derived)'
    );

    // STAGE 3: ROUTE_LLM + GOOGLE (parallel with base_filters/post_constraints)
    // Uses early context (deterministic subset of filters_resolved)
    const earlyFiltersForRouting = {
      regionCode: earlyContext.regionCode,
      providerLanguage: earlyContext.providerLanguage,
      uiLanguage: earlyContext.uiLanguage,
      // Minimal filters for routing (openState will be applied in post_filter)
      openState: null,
      openAt: null,
      openBetween: null,
      disclaimers: { hours: true, dietary: true }
    } as any;

    const mapping = await executeRouteLLM(intentDecision, request, ctx, earlyFiltersForRouting);

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'route_llm_mapped',
        providerMethod: mapping.providerMethod,
        region: mapping.region,
        language: mapping.language
      },
      '[ROUTE2] Route-LLM mapping completed (using early context)'
    );

    // DEBUG: Log normalized query effect on routing
    // Shows how query normalization impacts route selection and final textQuery
    if (mapping.providerMethod === 'textSearch') {
      logger.debug({
        event: 'normalized_query_effect',
        requestId,
        rawQuery: request.query,
        canonicalTextQuery: mapping.textQuery,
        route: intentDecision.route,
        profileSelected: intentDecision.route // Route serves as the "profile" for this query
      }, '[ROUTE2] Query normalization applied for routing');
    }

    // Guard: NEARBY requires userLocation
    const nearbyGuardResponse = await handleNearbyLocationGuard(request, gateResult, intentDecision, mapping, ctx, wsManager);
    if (nearbyGuardResponse) return nearbyGuardResponse;

    // Start Google fetch immediately (don't await yet)
    const googlePromise = executeGoogleMapsStage(mapping, request, ctx);

    // STAGE 4: BARRIER - Await both Google results AND base_filters/post_constraints
    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'google_parallel_awaited',
        parallelDurationMs: Date.now() - googleParallelStartTime
      },
      '[ROUTE2] Awaiting Google results + base_filters/post_constraints (barrier)'
    );

    // Await base_filters to get full filter context (includes openState)
    const baseFilters = await baseFiltersPromise;

    // Resolve final filters (for logging and post_filter)
    const finalFilters = await resolveAndStoreFilters(baseFilters, intentDecision, ctx);

    // Verify early context matches final filters (sanity check)
    if (finalFilters.regionCode !== earlyContext.regionCode) {
      logger.warn({
        requestId,
        pipelineVersion: 'route2',
        event: 'early_context_mismatch',
        earlyRegion: earlyContext.regionCode,
        finalRegion: finalFilters.regionCode
      }, '[ROUTE2] Early context region mismatch (unexpected)');
    }

    // Await Google results
    const googleResult = await googlePromise;
    ctx.timings.googleMapsMs = googleResult.durationMs;

    const googleTotalDurationMs = Date.now() - googleParallelStartTime;
    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'google_parallel_completed',
        totalDurationMs: googleTotalDurationMs,
        googleDurationMs: googleResult.durationMs,
        criticalPathSavedMs: Math.max(0, googleTotalDurationMs - googleResult.durationMs)
      },
      '[ROUTE2] Google fetch completed (parallel optimization saved time)'
    );

    // STAGE 6: POST_FILTERS (await post constraints, apply filters)
    const postConstraints = await postConstraintsPromise;
    const postFilterResult = applyPostFiltersToResults(googleResult.results, postConstraints, finalFilters, ctx);

    // Get merged filters for response building (using shared utility)
    const filtersForPostFilter = mergePostConstraints(finalFilters, postConstraints);

    // STAGE 6.5: LLM RANKING (if enabled) + RANKING SIGNALS
    // Apply LLM-driven ranking to post-filtered results and build ranking signals
    const rankingResult = await applyRankingIfEnabled(
      postFilterResult.resultsFiltered,
      intentDecision,
      finalFilters,
      postFilterResult.stats.before,
      postFilterResult.relaxed || {},
      ctx,
      mapping // Pass mapping for biasRadiusMeters extraction
    );

    const finalResults = rankingResult.rankedResults;
    const rankingSignals = rankingResult.signals;

    // STAGE 7: BUILD RESPONSE
    return await buildFinalResponse(
      request,
      gateResult,
      intentDecision,
      mapping,
      finalResults,
      filtersForPostFilter,
      rankingSignals,
      ctx,
      wsManager
    );
  } catch (error) {
    return await handlePipelineError(error, ctx, wsManager);
  } finally {
    // Drain parallel promises to prevent unhandled rejections
    if (baseFiltersPromise) {
      await baseFiltersPromise.catch(() => {
        // Already logged in the promise's own catch handler
      });
    }
    if (postConstraintsPromise) {
      await postConstraintsPromise.catch(() => {
        // Already logged in the promise's own catch handler
      });
    }
  }
}

/**
 * Route2 Search Pipeline with Global Timeout
 * P1 Reliability: Wraps pipeline with 45s timeout to prevent indefinite hangs
 */
export async function searchRoute2(request: SearchRequest, ctx: Route2Context): Promise<SearchResponse> {
  const PIPELINE_TIMEOUT_MS = 45_000; // 45 seconds global timeout

  try {
    return await withTimeout(
      searchRoute2Internal(request, ctx),
      PIPELINE_TIMEOUT_MS,
      'route2_pipeline'
    );
  } catch (error) {
    // Re-throw timeout errors with more context
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') {
      logger.error({
        requestId: ctx.requestId,
        timeoutMs: PIPELINE_TIMEOUT_MS,
        event: 'pipeline_timeout'
      }, '[ROUTE2] Pipeline timeout exceeded');
    }
    throw error;
  }
}
