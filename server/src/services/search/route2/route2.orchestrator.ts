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
import { logger } from '../../../lib/logger/structured-logger.js';
import { wsManager } from '../../../server.js';
import { sanitizeQuery } from '../../../lib/telemetry/query-sanitizer.js';
import { withTimeout } from '../../../lib/reliability/timeout-guard.js';

// Extracted modules
import { fireParallelTasks, drainParallelPromises } from './orchestrator.parallel-tasks.js';
import { handleNearMeLocationCheck, applyNearMeRouteOverride } from './orchestrator.nearme.js';
import { handleGateStop, handleGateClarify, handleNearbyLocationGuard } from './orchestrator.guards.js';
import { resolveAndStoreFilters, applyPostFiltersToResults } from './orchestrator.filters.js';
import { buildFinalResponse } from './orchestrator.response.js';
import { handlePipelineError } from './orchestrator.error.js';

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

    // Fire parallel tasks after Gate2
    const parallelTasks = fireParallelTasks(request, ctx);
    baseFiltersPromise = parallelTasks.baseFiltersPromise;
    postConstraintsPromise = parallelTasks.postConstraintsPromise;

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
        regionCandidate: intentDecision.regionCandidate,
        language: intentDecision.language,
        confidence: intentDecision.confidence,
        reason: intentDecision.reason
      },
      '[ROUTE2] Intent routing decided (regionCandidate will be validated by filters_resolved)'
    );

    // Near-me location check (early stop if no location)
    const nearMeResponse = await handleNearMeLocationCheck(request, intentDecision, ctx, wsManager);
    if (nearMeResponse) return nearMeResponse;

    // Near-me route override (if detected with location)
    intentDecision = applyNearMeRouteOverride(request, intentDecision, ctx);

    // STAGE 3: FILTERS (await base filters, resolve final - BEFORE route_llm)
    const baseFilters = await baseFiltersPromise;
    const finalFilters = await resolveAndStoreFilters(baseFilters, intentDecision, ctx);

    // STAGE 4: ROUTE_LLM (uses finalFilters as single source of truth)
    const mapping = await executeRouteLLM(intentDecision, request, ctx, finalFilters);

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'route_llm_mapped',
        providerMethod: mapping.providerMethod,
        region: mapping.region,
        language: mapping.language
      },
      '[ROUTE2] Route-LLM mapping completed (using filters_resolved region)'
    );

    // Guard: NEARBY requires userLocation
    const nearbyGuardResponse = await handleNearbyLocationGuard(request, gateResult, intentDecision, mapping, ctx, wsManager);
    if (nearbyGuardResponse) return nearbyGuardResponse;

    // STAGE 5: GOOGLE_MAPS
    const googleResult = await executeGoogleMapsStage(mapping, request, ctx);
    ctx.timings.googleMapsMs = googleResult.durationMs;

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

    // STAGE 7: BUILD RESPONSE
    return await buildFinalResponse(
      request,
      gateResult,
      intentDecision,
      mapping,
      finalResults,
      filtersForPostFilter,
      ctx,
      wsManager
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
