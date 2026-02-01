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
import { executeCuisineEnforcement, type CuisineEnforcerInput, type PlaceInput } from './stages/cuisine-enforcer/index.js';

import { resolveUserRegionCode } from './utils/region-resolver.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { wsManager } from '../../../server.js';
import { sanitizeQuery } from '../../../lib/telemetry/query-sanitizer.js';
import { withTimeout } from '../../../lib/reliability/timeout-guard.js';
import { searchJobStore } from '../job-store/index.js';
import { JOB_MILESTONES } from '../job-store/job-milestones.js';

// Extracted modules
import { fireParallelTasks } from './orchestrator.parallel-tasks.js';
import { handleNearMeLocationCheck, applyNearMeRouteOverride } from './orchestrator.nearme.js';
import { handleGateStop, handleGateClarify, handleIntentClarify, handleNearbyLocationGuard, handleGenericQueryGuard, checkGenericFoodQuery } from './orchestrator.guards.js';
import { resolveAndStoreFilters, applyPostFiltersToResults, mergePostConstraints } from './orchestrator.filters.js';
import { applyRankingIfEnabled } from './orchestrator.ranking.js';
import { buildFinalResponse } from './orchestrator.response.js';
import { handlePipelineError } from './orchestrator.error.js';
import { deriveEarlyRoutingContext } from './orchestrator.early-context.js';
import { detectHardConstraints } from './shared/hard-constraints.types.js';

// Extracted helpers
import { shouldDebugStop, resolveSessionId } from './orchestrator.helpers.js';
import { countSentences } from './assistant/text-validator.js';

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

    // CRITICAL: Initialize langCtx from Gate2 result IMMEDIATELY (before any guards/publishes)
    // This ensures assistantLanguage is available for all downstream stages and WS publishes
    if (gateResult.gate && !ctx.langCtx) {
      const { resolveAssistantLanguage } = await import('./orchestrator.helpers.js');
      const assistantLanguage = resolveAssistantLanguage(ctx, request, gateResult.gate.language, gateResult.gate.confidence);
      ctx.langCtx = {
        assistantLanguage,
        assistantLanguageConfidence: gateResult.gate.confidence || 0,
        uiLanguage: assistantLanguage,
        providerLanguage: assistantLanguage,
        region: 'IL'
      };

      logger.info({
        requestId,
        event: 'langCtx_initialized',
        source: 'gate2',
        assistantLanguage,
        confidence: gateResult.gate.confidence
      }, '[ROUTE2] langCtx initialized from Gate2 - assistantLanguage set');
    }

    // DEBUG LOG A: Gate2 language snapshot (after storing langCtx)
    logger.debug({
      requestId,
      traceId: ctx.traceId,
      sessionId: ctx.sessionId,
      event: 'gate2_lang_snapshot',
      queryHash,
      queryLen,
      foodSignal: gateResult.gate.foodSignal,
      confidence: gateResult.gate.confidence,
      gateAssistantLanguage: gateResult.gate.language,
      gateAssistantLanguageConfidence: gateResult.gate.confidence,
      uiLanguageHint: request.uiLanguage || null,
      source: 'gate2_result'
    }, '[ROUTE2] Gate2 language snapshot captured');

    // MILESTONE: GATE_DONE (25%)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', JOB_MILESTONES.GATE_DONE);
      // Heartbeat: Keep job alive after Gate2
      await searchJobStore.updateHeartbeat(requestId);
      logger.debug({ requestId, stage: 'gate2', event: 'job_heartbeat_sent' }, '[ROUTE2] Job heartbeat after gate2');
    } catch (err) {
      // Non-fatal: progress tracking is optional
      logger.debug({ requestId, error: err instanceof Error ? err.message : 'unknown' }, '[ROUTE2] Progress update failed (non-fatal)');
    }

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



    // MILESTONE: INTENT_DONE (40%)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', JOB_MILESTONES.INTENT_DONE);
      // Heartbeat: Keep job alive after Intent
      await searchJobStore.updateHeartbeat(requestId);
      logger.debug({ requestId, stage: 'intent', event: 'job_heartbeat_sent' }, '[ROUTE2] Job heartbeat after intent');
    } catch (err) {
      // Non-fatal: progress tracking is optional
      logger.debug({ requestId, error: err instanceof Error ? err.message : 'unknown' }, '[ROUTE2] Progress update failed (non-fatal)');
    }

    // Guard: INTENT CLARIFY (e.g. near-me requested but no userLocation)
    const intentClarifyResponse = await handleIntentClarify(request, intentDecision, ctx, wsManager);
    if (intentClarifyResponse) return intentClarifyResponse;

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

    // Debug stop after route_llm
    if (shouldDebugStop(ctx, 'route_llm')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after route_llm' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: {
          stopAfter: 'route_llm',
          gate: gateResult,
          intent: intentDecision,
          mapping: {
            providerMethod: mapping.providerMethod,
            region: mapping.region,
            language: mapping.language,
            mode: (mapping as any).mode,
            cuisineKey: (mapping as any).cuisineKey,
            strictness: (mapping as any).strictness
          }
        } as any
      } as any;
    }

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

    // Debug stop after google
    if (shouldDebugStop(ctx, 'google')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after google' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: {
          stopAfter: 'google',
          gate: gateResult,
          intent: intentDecision,
          mapping: {
            providerMethod: mapping.providerMethod,
            region: mapping.region,
            language: mapping.language
          },
          google: {
            count: googleResult.results.length,
            durationMs: googleResult.durationMs,
            providerMethod: googleResult.providerMethod,
            firstFivePlaceIds: googleResult.results.slice(0, 5).map((r: any) => r.placeId || r.id)
          }
        } as any
      } as any;
    }

    // MILESTONE: GOOGLE_DONE (60%)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', JOB_MILESTONES.GOOGLE_DONE);
      // Heartbeat: Keep job alive after Google Maps fetch
      await searchJobStore.updateHeartbeat(requestId);
      logger.debug({ requestId, stage: 'google_maps', event: 'job_heartbeat_sent' }, '[ROUTE2] Job heartbeat after google_maps');
    } catch (err) {
      // Non-fatal: progress tracking is optional
      logger.debug({ requestId, error: err instanceof Error ? err.message : 'unknown' }, '[ROUTE2] Progress update failed (non-fatal)');
    }

    // STAGE 5.5: CUISINE ENFORCEMENT (LLM-based post-Google filtering)
    // Apply only if explicit cuisine requirements exist in mapping
    let enforcedResults = googleResult.results;
    let cuisineEnforcementApplied = false;
    let cuisineEnforcementFailed = false;
    let cuisineScores: Record<string, number> | undefined;

    if (mapping.providerMethod === 'textSearch' && mapping.requiredTerms && mapping.requiredTerms.length > 0) {
      // Detect if hard constraints exist (kosher or meat/dairy)
      // Note: We check finalFilters + postConstraints inline since filtersForPostFilter isn't available yet
      const cuisineKey = (mapping as any).cuisineKey ?? null;
      const postConstraints = await postConstraintsPromise; // Await to check isKosher
      const hardConstraintsActive = detectHardConstraints(
        { ...finalFilters, isKosher: postConstraints.isKosher } as any,
        cuisineKey
      );
      const hardConstraintsExist = hardConstraintsActive.length > 0;

      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'cuisine_enforcement_started',
        strictness: mapping.strictness,
        requiredTerms: mapping.requiredTerms,
        preferredTerms: mapping.preferredTerms || [],
        countIn: googleResult.results.length,
        hardConstraintsExist,
        hardConstraintsActive
      }, '[ROUTE2] Starting cuisine enforcement');

      /*
     try {
       // Convert Google results to PlaceInput format
       const placesForEnforcement: PlaceInput[] = googleResult.results.map(r => ({
         placeId: r.placeId || r.id,
         name: r.name || '',
         types: r.types || [],
         address: r.address || r.formattedAddress || '',
         rating: r.rating,
         userRatingsTotal: r.userRatingsTotal
       }));

       // Execute LLM-based enforcement (with hard constraints awareness)
       const enforcerInput: CuisineEnforcerInput = {
         requiredTerms: mapping.requiredTerms,
         preferredTerms: mapping.preferredTerms || [],
         strictness: mapping.strictness || 'RELAX_IF_EMPTY',
         places: placesForEnforcement,
         hardConstraintsExist // Pass hard constraints flag
       };

       let enforcementResult = await executeCuisineEnforcement(
         enforcerInput,
         ctx.llmProvider,
         requestId
       );

       // Store cuisine scores if in BOOST mode
       if (enforcementResult.cuisineScores) {
         cuisineScores = enforcementResult.cuisineScores;

         // Attach cuisine scores to results for ranking
         for (const result of googleResult.results) {
           const placeId = result.placeId || result.id;
           if (placeId && cuisineScores[placeId] !== undefined) {
             result.cuisineScore = cuisineScores[placeId];
           }
         }

         logger.info({
           requestId,
           event: 'cuisine_scores_attached',
           scoresAttached: Object.keys(cuisineScores).length,
           resultsCount: googleResult.results.length
         }, '[ROUTE2] Cuisine scores attached to results for ranking');
       }

       logger.info({
         requestId,
         pipelineVersion: 'route2',
         event: 'cuisine_enforcement_completed',
         countIn: googleResult.results.length,
         countOut: enforcementResult.keepPlaceIds.length,
         relaxApplied: enforcementResult.relaxApplied,
         relaxStrategy: enforcementResult.relaxStrategy,
         enforcementSkipped: enforcementResult.enforcementSkipped,
         hasScores: !!enforcementResult.cuisineScores
       }, '[ROUTE2] Cuisine enforcement completed');

       // Track result drops from cuisine enforcement
       if (enforcementResult.keepPlaceIds.length < googleResult.results.length) {
         logger.info({
           requestId,
           event: 'results_drop_reason',
           reason: 'cuisine_filter',
           countBefore: googleResult.results.length,
           countAfter: enforcementResult.keepPlaceIds.length,
           dropped: googleResult.results.length - enforcementResult.keepPlaceIds.length
         }, '[ROUTE2] Results dropped by cuisine enforcement');
       }

       // REAL RELAX STRATEGY: If 0 results after enforcement (and not skipped), apply relaxation
       if (enforcementResult.keepPlaceIds.length === 0 && !enforcementResult.enforcementSkipped) {
         logger.info({
           requestId,
           pipelineVersion: 'route2',
           event: 'cuisine_enforcement_relax_triggered',
           reason: 'zero_results_after_strict',
           originalStrictness: mapping.strictness
         }, '[ROUTE2] Zero results after STRICT enforcement, applying relaxation');

         // Relax #1: Downgrade STRICT → SOFT (requiredTerms become preferred-only)
         logger.info({
           requestId,
           event: 'relax_strategy_soft',
           attempt: 1
         }, '[ROUTE2] Relax #1: Downgrade to SOFT mode (requiredTerms → preferredTerms)');

         const relaxedInput: CuisineEnforcerInput = {
           requiredTerms: [], // Clear required terms
           preferredTerms: [...mapping.requiredTerms, ...mapping.preferredTerms], // Merge into preferred
           strictness: 'RELAX_IF_EMPTY',
           places: placesForEnforcement
         };

         enforcementResult = await executeCuisineEnforcement(
           relaxedInput,
           ctx.llmProvider,
           requestId
         );

         logger.info({
           requestId,
           event: 'relax_soft_completed',
           countOut: enforcementResult.keepPlaceIds.length
         }, '[ROUTE2] SOFT mode enforcement completed');

         // Relax #2: If still 0, rerun Google with broader query
         if (enforcementResult.keepPlaceIds.length === 0 && mapping.cityText) {
           logger.info({
             requestId,
             event: 'relax_strategy_google_rerun',
             attempt: 2,
             cityText: mapping.cityText
           }, '[ROUTE2] Relax #2: Rerun Google with broader query');

           // Import the text search handler
           const { executeTextSearch } = await import('./stages/google-maps/text-search.handler.js');

           // Build broader mapping: "restaurants in <city>" (English)
           const broaderMapping = {
             ...mapping,
             mode: 'KEYED' as const,
             cuisineKey: null,
             providerTextQuery: `restaurants in ${mapping.cityText}`,
             providerLanguage: 'en' as const,
             requiredTerms: [],
             preferredTerms: [],
             strictness: 'RELAX_IF_EMPTY' as const
           };

           logger.info({
             requestId,
             event: 'google_rerun_broader_query',
             providerTextQuery: broaderMapping.providerTextQuery,
             providerLanguage: broaderMapping.providerLanguage
           }, '[ROUTE2] Rerunning Google with broader query');

           // Rerun Google search
           const broaderResults = await executeTextSearch(broaderMapping, ctx);

           logger.info({
             requestId,
             event: 'google_rerun_completed',
             countOut: broaderResults.length
           }, '[ROUTE2] Google rerun completed');

           // Apply SOFT enforcement to broader results
           if (broaderResults.length > 0) {
             const broaderPlaces: PlaceInput[] = broaderResults.map(r => ({
               placeId: r.placeId || r.id,
               name: r.name || '',
               types: r.types || [],
               address: r.address || r.formattedAddress || '',
               rating: r.rating,
               userRatingsTotal: r.userRatingsTotal
             }));

             enforcementResult = await executeCuisineEnforcement(
               {
                 ...relaxedInput,
                 places: broaderPlaces
               },
               ctx.llmProvider,
               requestId
             );

             logger.info({
               requestId,
               event: 'relax_google_rerun_completed',
               countIn: broaderResults.length,
               countOut: enforcementResult.keepPlaceIds.length
             }, '[ROUTE2] Google rerun + SOFT enforcement completed');

             // Use broader results if enforcement succeeded
             if (enforcementResult.keepPlaceIds.length > 0) {
               googleResult.results = broaderResults; // Update base results
               enforcementResult.relaxStrategy = 'google_rerun_broader';
               enforcementResult.relaxApplied = true;
             }
           }
         }
       }

       // Apply enforcement: In SCORE-ONLY mode, keep all results (no filtering)
       // Results already have cuisineScore attached for ranking
       if (enforcementResult.keepPlaceIds.length > 0) {
         // SCORE-ONLY mode: keepPlaceIds should equal input (no filtering)
         // Keep results in Google order; ranking will reorder based on scores
         enforcedResults = googleResult.results;
         cuisineEnforcementApplied = true;

         logger.info({
           requestId,
           event: 'cuisine_score_only_applied',
           countIn: googleResult.results.length,
           countOut: enforcedResults.length,
           mode: 'SCORE_ONLY'
         }, '[ROUTE2] Cuisine score-only mode: all results kept for ranking');
       } else if (!enforcementResult.relaxApplied && !enforcementResult.enforcementSkipped) {
         // No matches and no relaxation => enforcement failed, keep original
         logger.warn({
           requestId,
           pipelineVersion: 'route2',
           event: 'cuisine_enforcement_empty',
           strictness: mapping.strictness
         }, '[ROUTE2] Cuisine enforcement returned empty, keeping original results');
         cuisineEnforcementFailed = true;
       } else if (enforcementResult.enforcementSkipped) {
         // Enforcement was skipped (small sample guard)
         logger.info({
           requestId,
           pipelineVersion: 'route2',
           event: 'cuisine_enforcement_skipped',
           reason: 'small_sample_guard'
         }, '[ROUTE2] Cuisine enforcement skipped (small sample guard)');
       } else {
         // Relaxation applied but still empty => keep original with flag
         logger.warn({
           requestId,
           pipelineVersion: 'route2',
           event: 'cuisine_enforcement_failed_after_relax',
           relaxStrategy: enforcementResult.relaxStrategy
         }, '[ROUTE2] Cuisine enforcement failed even after relaxation');
         cuisineEnforcementFailed = true;
       }

     } catch (error) {
       const msg = error instanceof Error ? error.message : String(error);
       logger.error({
         requestId,
         pipelineVersion: 'route2',
         event: 'cuisine_enforcement_error',
         error: msg
       }, '[ROUTE2] Cuisine enforcement failed, keeping original results');
       // Fail gracefully: keep original results
       cuisineEnforcementFailed = true;
     } */
    }


    // Debug stop after cuisine
    /*
    if (shouldDebugStop(ctx, 'cuisine')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after cuisine' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: {
          stopAfter: 'cuisine',
          gate: gateResult,
          intent: intentDecision,
          mapping: {
            providerMethod: mapping.providerMethod,
            region: mapping.region
          },
          google: {
            count: googleResult.results.length,
            durationMs: googleResult.durationMs
          },
          cuisine: {
            enforcementApplied: cuisineEnforcementApplied,
            enforcementFailed: cuisineEnforcementFailed,
            countIn: googleResult.results.length,
            countOut: enforcedResults.length,
            hasScores: !!cuisineScores
          }
        } as any
      } as any;
   
    }
    */
    // STAGE 6: POST_FILTERS (await post constraints, apply filters)
    const postConstraints = await postConstraintsPromise;
    const cuisineKey = (mapping as any).cuisineKey ?? null; // Extract cuisineKey for hard constraint detection
    const postFilterResult = applyPostFiltersToResults(enforcedResults, postConstraints, finalFilters, ctx, cuisineKey);

    // Track result drops from post-filters
    if (postFilterResult.stats.removed > 0) {
      const reasons: string[] = [];
      if (postFilterResult.applied.openState) reasons.push('openNow_filter');
      if (postFilterResult.applied.priceIntent) reasons.push('price_filter');
      if (postFilterResult.applied.minRatingBucket) reasons.push('rating_filter');

      logger.info({
        requestId,
        event: 'results_drop_reason',
        reason: reasons.length > 0 ? reasons.join('+') : 'post_constraints',
        countBefore: postFilterResult.stats.before,
        countAfter: postFilterResult.stats.after,
        dropped: postFilterResult.stats.removed,
        details: {
          openState: postFilterResult.applied.openState,
          priceIntent: postFilterResult.applied.priceIntent,
          minRatingBucket: postFilterResult.applied.minRatingBucket,
          relaxed: postFilterResult.relaxed
        }
      }, '[ROUTE2] Results dropped by post-filters');
    }

    // Get merged filters for response building (using shared utility)
    const filtersForPostFilter = mergePostConstraints(finalFilters, postConstraints);

    // MILESTONE: POST_CONSTRAINTS_DONE (75%)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', JOB_MILESTONES.POST_CONSTRAINTS_DONE);
      // Heartbeat: Keep job alive after post-constraints
      await searchJobStore.updateHeartbeat(requestId);
      logger.debug({ requestId, stage: 'post_constraints', event: 'job_heartbeat_sent' }, '[ROUTE2] Job heartbeat after post_constraints');
    } catch (err) {
      // Non-fatal: progress tracking is optional
      logger.debug({ requestId, error: err instanceof Error ? err.message : 'unknown' }, '[ROUTE2] Progress update failed (non-fatal)');
    }

    // Debug stop after post_filters
    if (shouldDebugStop(ctx, 'post_filters')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after post_filters' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: {
          stopAfter: 'post_filters',
          gate: gateResult,
          intent: intentDecision,
          mapping: {
            providerMethod: mapping.providerMethod
          },
          google: {
            count: googleResult.results.length,
            durationMs: googleResult.durationMs
          },
          cuisine: {
            enforcementApplied: cuisineEnforcementApplied,
            countOut: enforcedResults.length
          },
          postFilters: {
            stats: postFilterResult.stats,
            applied: postFilterResult.applied,
            relaxed: postFilterResult.relaxed
          }
        } as any
      } as any;
    }

    // STAGE 6.5: LLM RANKING (if enabled) + RANKING SIGNALS
    // Apply LLM-driven ranking to post-filtered results and build ranking signals
    // Extract cityCenter from mapping if present (for distance calculation)
    const cityCenter = (mapping.providerMethod === 'textSearch' && mapping.cityCenter)
      ? mapping.cityCenter
      : null;

    const rankingResult = await applyRankingIfEnabled(
      postFilterResult.resultsFiltered,
      intentDecision,
      finalFilters,
      postFilterResult.stats.before,
      postFilterResult.relaxed || {},
      ctx,
      mapping, // Pass mapping for biasRadiusMeters extraction
      cityCenter // Pass cityCenter for distance anchor (explicit city queries)
    );

    const finalResults = rankingResult.rankedResults;
    const rankingSignals = rankingResult.signals;
    const rankingApplied = rankingResult.rankingApplied;
    const orderExplain = rankingResult.orderExplain;

    // MILESTONE: RANKING_DONE (90%)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', JOB_MILESTONES.RANKING_DONE);
      // Heartbeat: Keep job alive after ranking
      await searchJobStore.updateHeartbeat(requestId);
      logger.debug({ requestId, stage: 'ranking', event: 'job_heartbeat_sent' }, '[ROUTE2] Job heartbeat after ranking');
    } catch (err) {
      // Non-fatal: progress tracking is optional
      logger.debug({ requestId, error: err instanceof Error ? err.message : 'unknown' }, '[ROUTE2] Progress update failed (non-fatal)');
    }

    // Debug stop after ranking
    if (shouldDebugStop(ctx, 'ranking')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP after ranking' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: {
          stopAfter: 'ranking',
          gate: gateResult,
          intent: intentDecision,
          mapping: {
            providerMethod: mapping.providerMethod
          },
          google: {
            count: googleResult.results.length,
            durationMs: googleResult.durationMs
          },
          cuisine: {
            enforcementApplied: cuisineEnforcementApplied,
            countOut: enforcedResults.length
          },
          postFilters: {
            stats: postFilterResult.stats
          },
          ranking: {
            rankingApplied,
            countIn: postFilterResult.resultsFiltered.length,
            countOut: finalResults.length,
            orderExplain
          }
        } as any
      } as any;
    }

    // Debug stop before response
    if (shouldDebugStop(ctx, 'response')) {
      return {
        requestId: ctx.requestId,
        sessionId,
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'debug', message: 'DEBUG STOP before response' } as any,
        meta: {
          tookMs: Date.now() - ctx.startTime,
          mode: 'textsearch' as any,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_debug_stop',
          failureReason: 'NONE' as any
        },
        debug: {
          stopAfter: 'response',
          gate: gateResult,
          intent: intentDecision,
          mapping: {
            providerMethod: mapping.providerMethod
          },
          google: {
            count: googleResult.results.length
          },
          cuisine: {
            enforcementApplied: cuisineEnforcementApplied
          },
          postFilters: {
            stats: postFilterResult.stats
          },
          ranking: {
            rankingApplied,
            countOut: finalResults.length
          }
        } as any
      } as any;
    }

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
      wsManager,
      rankingApplied,
      cuisineEnforcementFailed,
      orderExplain,
      finalFilters  // NEW: For language context transparency
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
