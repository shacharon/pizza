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
import { fireParallelTasks, drainParallelPromises } from './orchestrator.parallel-tasks.js';
import { handleNearMeLocationCheck, applyNearMeRouteOverride } from './orchestrator.nearme.js';
import { handleGateStop, handleGateClarify, handleEarlyTextSearchLocationGuard, handleNearbyLocationGuard, handleTextSearchMissingLocationGuard, checkGenericFoodQuery } from './orchestrator.guards.js';
import { resolveAndStoreFilters, applyPostFiltersToResults } from './orchestrator.filters.js';
import { buildFinalResponse } from './orchestrator.response.js';
import { handlePipelineError } from './orchestrator.error.js';
import { deriveEarlyRoutingContext, upgradeToFinalFilters } from './orchestrator.early-context.js';

// Extracted helpers
import { shouldDebugStop, resolveSessionId } from './orchestrator.helpers.js';

// Enrichment stages
import { enrichWithWoltLinks } from './enrichment/wolt/wolt-enrichment.service.js';
import { enrichWithTenbisLinks } from './enrichment/tenbis/tenbis-enrichment.service.js';
import { getMetricsCollector } from './enrichment/metrics-collector.js';

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

    // Guard: Early TEXTSEARCH location check (blocks Google search if no location)
    const earlyTextSearchGuardResponse = await handleEarlyTextSearchLocationGuard(request, gateResult, intentDecision, ctx, wsManager);
    if (earlyTextSearchGuardResponse) return earlyTextSearchGuardResponse;

    // Check for generic food query (e.g., "what to eat") - sets flag for later
    checkGenericFoodQuery(gateResult, intentDecision, ctx);

    // Near-me location check (early stop if no location)
    const nearMeResponse = await handleNearMeLocationCheck(request, intentDecision, ctx, wsManager);
    if (nearMeResponse) return nearMeResponse;

    // Near-me route override (if detected with location)
    intentDecision = applyNearMeRouteOverride(request, intentDecision, ctx);

    // OPTIMIZATION: Derive early routing context (region + language) from intent + device
    // This allows starting Google fetch immediately after guards without waiting for base_filters
    const earlyContext = deriveEarlyRoutingContext(intentDecision, ctx);
    const googleParallelStartTime = Date.now();

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

    // Guard: NEARBY requires userLocation
    const nearbyGuardResponse = await handleNearbyLocationGuard(request, gateResult, intentDecision, mapping, ctx, wsManager);
    if (nearbyGuardResponse) return nearbyGuardResponse;

    // CHEESEBURGER 2 FIX: TEXTSEARCH anchor validation
    // For TEXTSEARCH: ONLY cityText OR locationBias count as anchors (NOT userLocation)
    // For NEARBY: userLocation counts
    const hasUserLocation = !!ctx.userLocation;
    const hasCityText = !!intentDecision.cityText || !!(mapping as any).cityText;
    const hasLocationBias = !!(mapping as any).bias;

    let allowed = true;
    let reason = 'location_anchor_present';

    if (intentDecision.route === 'TEXTSEARCH') {
      // TEXTSEARCH requires cityText OR bias (NOT userLocation)
      const hasTextSearchAnchor = hasCityText || hasLocationBias;
      allowed = hasTextSearchAnchor;
      reason = hasTextSearchAnchor ? 'has_city_or_bias' : 'missing_location_anchor_textsearch';

      logger.info({
        requestId,
        event: 'textsearch_anchor_eval',
        hasCityText,
        hasLocationBias,
        hasUserLocation,
        allowed
      }, '[ROUTE2] TEXTSEARCH anchor evaluation');
    }

    // Decision log for Google parallel start
    logger.info({
      requestId,
      event: 'google_parallel_start_decision',
      route: intentDecision.route,
      allowed,
      reason
    }, '[ROUTE2] Google parallel start decision');

    // HARD STOP: TEXTSEARCH without location anchor must CLARIFY and must NOT start Google
    if (!allowed) {
      const r = await handleTextSearchMissingLocationGuard(request, gateResult, intentDecision, mapping, ctx, wsManager);
      if (r) return r;
      throw new Error('TEXTSEARCH blocked: missing location anchor');
    }

    // CRITICAL: Fire parallel tasks ONLY after all guards pass (blocksSearch=false confirmed)
    // This ensures CLARIFY responses never start base_filters or post_constraints
    const parallelTasks = fireParallelTasks(request, ctx);
    baseFiltersPromise = parallelTasks.baseFiltersPromise;
    postConstraintsPromise = parallelTasks.postConstraintsPromise;

    // Start Google fetch immediately (don't await yet) - ONLY after guards pass
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
    const finalResults = postFilterResult.resultsFiltered;

    // Get merged filters for response building
    const filtersForPostFilter = {
      ...finalFilters,
      openState: postConstraints.openState ?? finalFilters.openState,
      priceLevel: postConstraints.priceLevel ?? (finalFilters as any).priceLevel,
      isKosher: postConstraints.isKosher ?? (finalFilters as any).isKosher,
      isGlutenFree: postConstraints.isGlutenFree ?? (finalFilters as any).isGlutenFree
    };

    // STAGE 6.5: PROVIDER ENRICHMENT (async, non-blocking cache-first)
    // Mutates finalResults in-place to attach provider status/urls
    // Cost controls: Cap at N results (default 10), max 3 concurrent jobs
    const cityText = (intentDecision as any).cityText ?? null;
    const maxResultsToEnrich = parseInt(process.env.MAX_RESULTS_TO_ENRICH || '10');
    const resultsToEnrich = finalResults.slice(0, maxResultsToEnrich);
    
    // Initialize metrics tracking
    const metricsCollector = getMetricsCollector();
    metricsCollector.initRequest(requestId, resultsToEnrich.length);
    
    // Enrich with both providers in parallel (cache-first, idempotent)
    await Promise.all([
      enrichWithWoltLinks(resultsToEnrich, requestId, cityText, ctx),
      enrichWithTenbisLinks(resultsToEnrich, requestId, cityText, ctx),
    ]);
    
    // Finalize metrics after enrichment stage completes
    metricsCollector.finalizeRequest(requestId);
    
    logger.info(
      {
        event: 'provider_enrichment_completed',
        requestId,
        totalResults: finalResults.length,
        enrichedResults: resultsToEnrich.length,
        cappedAt: maxResultsToEnrich,
      },
      '[ROUTE2] Provider enrichment stage completed'
    );

    // STAGE 7: BUILD RESPONSE
    return await buildFinalResponse(
      request,
      gateResult,
      intentDecision,
      mapping,
      finalResults,
      filtersForPostFilter,
      ctx,
      wsManager,
      googleResult.servedFrom
    );
  } catch (error) {
    return await handlePipelineError(error, ctx, wsManager);
  } finally {
    await drainParallelPromises(baseFiltersPromise, postConstraintsPromise);
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
