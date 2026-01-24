/**
 * ROUTE2 Orchestrator
 *
 * A: True parallelization after Gate2:
 * - fire base_filters + post_constraints immediately after Gate2
 * - run intent + route_llm while those run
 * - await base_filters before resolveFilters
 * - await post_constraints as late as possible (before post_filter)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context } from './types.js';

import { executeGate2Stage } from './stages/gate2.stage.js';
import { executeIntentStage } from './stages/intent/intent.stage.js';
import { executeRouteLLM } from './stages/route-llm/route-llm.dispatcher.js';
import { executeGoogleMapsStage } from './stages/google-maps.stage.js';
import { executePostConstraintsStage } from './stages/post-constraints/post-constraints.stage.js';

import { resolveUserRegionCode } from './utils/region-resolver.js';
import { resolveBaseFiltersLLM } from './shared/base-filters-llm.js';
import { resolveFilters } from './shared/filters-resolver.js';
import { applyPostFilters } from './post-filters/post-results.filter.js';
import { isNearMeQuery, getNearMePattern } from './utils/near-me-detector.js';

import { logger } from '../../../lib/logger/structured-logger.js';
import { wsManager } from '../../../server.js';
import { startStage, endStage } from '../../../lib/telemetry/stage-timer.js';
import { sanitizeQuery } from '../../../lib/telemetry/query-sanitizer.js';

const DEFAULT_POST_CONSTRAINTS = {
  openState: null,
  openAt: null,
  openBetween: null,
  priceLevel: null,
  isKosher: null,
  requirements: { accessible: null, parking: null }
};

const DEFAULT_BASE_FILTERS: any = {
  language: 'he',
  openState: null,
  openAt: null,
  openBetween: null,
  regionHint: null
};

export async function searchRoute2(
  request: SearchRequest,
  ctx: Route2Context
): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;
  const { queryLen, queryHash } = sanitizeQuery(request.query);

  logger.info(
    { requestId, pipelineVersion: 'route2', event: 'pipeline_selected', queryLen, queryHash },
    '[ROUTE2] Pipeline selected'
  );

  try {
    // Best-effort: region is a hint, not a hard dependency
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

    // STAGE 1: GATE2 (must stay serial)
    const gateResult = await executeGate2Stage(request, ctx);
    if (shouldDebugStop(ctx, 'gate2')) {
      return {
        requestId: ctx.requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
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

    // EARLY STOP: Not food
    if (gateResult.gate.route === 'STOP') {
      logger.info(
        {
          requestId,
          pipelineVersion: 'route2',
          event: 'pipeline_stopped',
          reason: 'not_food_related',
          foodSignal: gateResult.gate.foodSignal
        },
        '[ROUTE2] Pipeline stopped - not food related'
      );

      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'he' as const,
              requestLanguage: 'he' as const,
              googleLanguage: 'he' as const
            },
            originalQuery: request.query
          },
          language: gateResult.gate.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'guide' as const,
          message: "זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: 'פיצה בתל אביב'."
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: gateResult.gate.confidence,
          source: 'route2_gate_stop',
          failureReason: 'LOW_CONFIDENCE'
        }
      };
    }

    // EARLY STOP: Ask clarify
    if (gateResult.gate.route === 'ASK_CLARIFY') {
      logger.info(
        {
          requestId,
          pipelineVersion: 'route2',
          event: 'pipeline_clarify',
          reason: 'uncertain_query',
          foodSignal: gateResult.gate.foodSignal
        },
        '[ROUTE2] Pipeline asking for clarification'
      );

      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'he' as const,
              requestLanguage: 'he' as const,
              googleLanguage: 'he' as const
            },
            originalQuery: request.query
          },
          language: gateResult.gate.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'clarify' as const,
          message: "כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה. לדוגמה: 'סושי באשקלון' או 'פיצה ליד הבית'."
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: gateResult.gate.confidence,
          source: 'route2_gate_clarify',
          failureReason: 'LOW_CONFIDENCE'
        }
      };
    }

    // ===== DEBUG STOP AFTER GATE2 =====
    if (ctx.debug?.stopAfter === 'gate2') {
      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: { original: request.query, parsed: null as any, language: gateResult.gate.language },
        results: [],
        chips: [],
        assist: { type: 'guide', message: 'DEBUG STOP: after gate2' },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: gateResult.gate.confidence,
          source: 'debug_gate2',
          failureReason: 'NONE'
        }
      };
    }
    // --- A: FIRE PARALLEL TASKS IMMEDIATELY AFTER GATE2 ---

    logger.info(
      { requestId, pipelineVersion: 'route2', event: 'parallel_started' },
      '[ROUTE2] Starting parallel tasks (base_filters + post_constraints + intent chain)'
    );

    // Base filters: start now (route is only a hint; safest default)
    const baseFiltersPromise = resolveBaseFiltersLLM({
      query: request.query,
      route: 'TEXTSEARCH' as any, // do NOT block on intent; resolveFilters will do the smart merge later
      llmProvider: ctx.llmProvider,
      requestId: ctx.requestId,
      ...(ctx.traceId && { traceId: ctx.traceId }),
      ...(ctx.sessionId && { sessionId: ctx.sessionId })
    }).catch((err) => {
      logger.warn(
        {
          requestId,
          pipelineVersion: 'route2',
          stage: 'base_filters_llm',
          event: 'stage_failed',
          error: err instanceof Error ? err.message : String(err),
          fallback: 'default_base_filters'
        },
        '[ROUTE2] Base filters extraction failed, using defaults'
      );
      return DEFAULT_BASE_FILTERS;
    });

    // Post constraints: start now, await later (do not block Google)
    const postConstraintsPromise = executePostConstraintsStage(request, ctx).catch((err) => {
      logger.warn(
        {
          requestId,
          pipelineVersion: 'route2',
          stage: 'post_constraints',
          event: 'stage_failed',
          error: err instanceof Error ? err.message : String(err),
          fallback: 'default_post_constraints'
        },
        '[ROUTE2] Post-constraints extraction failed, using defaults'
      );
      return DEFAULT_POST_CONSTRAINTS as any;
    });

    // INTENT + ROUTE_LLM chain (still serial inside the chain)
    let intentDecision = await executeIntentStage(request, ctx);
    if (shouldDebugStop(ctx, 'intent')) {
      return {
        requestId: ctx.requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
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
        region: intentDecision.region,
        language: intentDecision.language,
        confidence: intentDecision.confidence,
        reason: intentDecision.reason
      },
      '[ROUTE2] Intent routing decided'
    );

    if (ctx.debug?.stopAfter === 'intent') {
      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: { original: request.query, parsed: null as any, language: intentDecision.language },
        results: [],
        chips: [],
        assist: { type: 'guide', message: 'DEBUG STOP: after intent' },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'debug_intent',
          failureReason: 'NONE'
        }
      };
    }

    // HOTFIX: Deterministic "near me" location requirement
    const isNearMe = isNearMeQuery(request.query);

    if (isNearMe && !ctx.userLocation) {
      // CASE 1: "Near me" without location → CLARIFY (don't call Google)
      const pattern = getNearMePattern(request.query);

      logger.info(
        {
          requestId,
          pipelineVersion: 'route2',
          event: 'near_me_location_required',
          pattern,
          hasUserLocation: false,
          originalRoute: intentDecision.route
        },
        '[ROUTE2] Near-me query without location - returning CLARIFY'
      );

      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'he' as const,
              requestLanguage: 'he' as const,
              googleLanguage: 'he' as const
            },
            originalQuery: request.query
          },
          language: intentDecision.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'clarify' as const,
          message: "כדי לחפש מסעדות לידי אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור."
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_near_me_clarify',
          failureReason: 'LOCATION_REQUIRED'
        }
      };
    }

    if (isNearMe && ctx.userLocation) {
      // CASE 2: "Near me" with location → force NEARBY route
      const originalRoute = intentDecision.route;

      if (originalRoute !== 'NEARBY') {
        logger.info(
          {
            requestId,
            pipelineVersion: 'route2',
            event: 'intent_overridden',
            fromRoute: originalRoute,
            toRoute: 'NEARBY',
            reason: 'near_me_keyword_override',
            hasUserLocation: true,
            pattern: getNearMePattern(request.query)
          },
          '[ROUTE2] Near-me detected with location - forcing NEARBY route'
        );

        intentDecision = {
          ...intentDecision,
          route: 'NEARBY',
          reason: 'near_me_keyword_override'
        };
      }
    }

    const mapping = await executeRouteLLM(intentDecision, request, ctx);

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'route_llm_mapped',
        providerMethod: mapping.providerMethod,
        region: mapping.region,
        language: mapping.language
      },
      '[ROUTE2] Route-LLM mapping completed'
    );

    // ===== DEBUG STOP AFTER ROUTE_LLM =====
    if (ctx.debug?.stopAfter === 'route_llm') {
      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: { original: request.query, parsed: null as any, language: mapping.language },
        results: [],
        chips: [],
        assist: { type: 'guide', message: 'DEBUG STOP: after route_llm' },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'debug_route_llm',
          failureReason: 'NONE'
        }
      };
    }

    // Guard: NEARBY requires userLocation (do this before awaiting long tasks)
    if (mapping.providerMethod === 'nearbySearch' && !ctx.userLocation) {
      logger.info(
        {
          requestId,
          pipelineVersion: 'route2',
          event: 'pipeline_clarify',
          reason: 'missing_user_location_for_nearby'
        },
        '[ROUTE2] Missing userLocation for nearbySearch - asking to clarify'
      );

      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'he' as const,
              requestLanguage: 'he' as const,
              googleLanguage: 'he' as const
            },
            originalQuery: request.query
          },
          language: gateResult.gate.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'clarify' as const,
          message: "כדי לחפש 'לידי' אני צריך את המיקום שלך. אפשר לאשר מיקום או לכתוב עיר/אזור (למשל: 'פיצה בגדרה')."
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'route2_guard_clarify',
          failureReason: 'LOW_CONFIDENCE'
        }
      };
    }

    // Await base filters now (required for resolveFilters)
    logger.info({ requestId, pipelineVersion: 'route2', event: 'await_base_filters' }, '[ROUTE2] Awaiting base filters');
    const baseFilters = await baseFiltersPromise;

    // FILTERS_RESOLVED
    const finalFilters = await resolveFilters({
      base: baseFilters,
      intent: intentDecision,
      deviceRegionCode: ctx.userRegionCode ?? null,
      userLocation: ctx.userLocation ?? null,
      requestId: ctx.requestId
    });

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'filters_resolved',
        base: {
          language: baseFilters?.language ?? null,
          openState: baseFilters?.openState ?? null,
          openAt: baseFilters?.openAt ?? null,
          openBetween: baseFilters?.openBetween ?? null,
          regionHint: baseFilters?.regionHint ?? null
        },
        final: {
          uiLanguage: finalFilters.uiLanguage,
          providerLanguage: finalFilters.providerLanguage,
          openState: finalFilters.openState,
          openAt: finalFilters.openAt,
          openBetween: finalFilters.openBetween,
          regionCode: finalFilters.regionCode
        }
      },
      '[ROUTE2] Filters resolved'
    );

    ctx.sharedFilters = { preGoogle: baseFilters, final: finalFilters };

    mapping.language = finalFilters.providerLanguage;
    mapping.region = finalFilters.regionCode;

    // STAGE 5: GOOGLE_MAPS (do NOT await postConstraints before this)
    const googleResult = await executeGoogleMapsStage(mapping, request, ctx);
    if (ctx.debug?.stopAfter === 'google') {
      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: { original: request.query, parsed: null as any, language: gateResult.gate.language },
        results: googleResult.results,
        chips: [],
        assist: { type: 'guide', message: 'DEBUG STOP: after google' },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'debug_google',
          failureReason: 'NONE'
        }
      };
    }


    ctx.timings.googleMapsMs = googleResult.durationMs;

    // Await post constraints as late as possible (only needed for post_filter)
    logger.info(
      { requestId, pipelineVersion: 'route2', event: 'await_post_constraints' },
      '[ROUTE2] Awaiting post constraints (late)'
    );
    const postConstraints = await postConstraintsPromise;

    // STAGE 6: POST_FILTERS
    const postFilterStart = startStage(ctx, 'post_filter', {
      openState: postConstraints.openState,
      priceLevel: postConstraints.priceLevel,
      isKosher: postConstraints.isKosher
    });

    const filtersForPostFilter = {
      ...finalFilters,
      openState: postConstraints.openState ?? finalFilters.openState,
      openAt: postConstraints.openAt
        ? { day: postConstraints.openAt.day, timeHHmm: postConstraints.openAt.timeHHmm, timezone: null }
        : finalFilters.openAt,
      openBetween: postConstraints.openBetween
        ? {
          day: postConstraints.openBetween.day,
          startHHmm: postConstraints.openBetween.startHHmm,
          endHHmm: postConstraints.openBetween.endHHmm,
          timezone: null
        }
        : finalFilters.openBetween,
      priceLevel: postConstraints.priceLevel ?? (finalFilters as any).priceLevel,
      isKosher: postConstraints.isKosher ?? (finalFilters as any).isKosher,
      requirements: postConstraints.requirements ?? (finalFilters as any).requirements
    };

    const postFilterResult = applyPostFilters({
      results: googleResult.results,
      sharedFilters: filtersForPostFilter as any,
      requestId: ctx.requestId,
      pipelineVersion: 'route2'
    });

    endStage(ctx, 'post_filter', postFilterStart, {
      stats: postFilterResult.stats,
      usedPostConstraints:
        postConstraints.openState !== null ||
        postConstraints.openAt !== null ||
        postConstraints.openBetween !== null ||
        postConstraints.priceLevel !== null ||
        postConstraints.isKosher !== null ||
        postConstraints.requirements?.accessible !== null ||
        postConstraints.requirements?.parking !== null
    });

    const finalResults = postFilterResult.resultsFiltered;

    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'post_filter_applied',
        openState: postFilterResult.applied.openState,
        stats: {
          before: postFilterResult.stats.before,
          after: postFilterResult.stats.after,
          removed: postFilterResult.stats.removed,
          unknownKept: postFilterResult.stats.unknownKept,
          unknownRemoved: postFilterResult.stats.unknownRemoved
        }
      },
      '[ROUTE2] Post-filters applied'
    );

    if (ctx.debug?.stopAfter === 'post_filter') {
      return {
        requestId,
        sessionId: request.sessionId || ctx.sessionId || 'route2-session',
        query: { original: request.query, parsed: null as any, language: gateResult.gate.language },
        results: finalResults,
        chips: [],
        assist: { type: 'guide', message: 'DEBUG STOP: after post_filter' },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: intentDecision.confidence,
          source: 'debug_post_filter',
          failureReason: 'NONE'
        }
      };
    }

    // RESPONSE BUILD
    const responseBuildStart = startStage(ctx, 'response_build', { resultCount: finalResults.length });
    const totalDurationMs = Date.now() - startTime;

    const detectedLanguage = gateResult.gate.language;
    const uiLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';
    const googleLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';

    const response: SearchResponse = {
      requestId,
      sessionId: request.sessionId || ctx.sessionId || 'route2-session',
      query: {
        original: request.query,
        parsed: {
          query:
            mapping.providerMethod === 'textSearch'
              ? mapping.textQuery
              : mapping.providerMethod === 'nearbySearch'
                ? mapping.keyword
                : mapping.keyword,
          searchMode: mapping.providerMethod === 'textSearch' ? ('textsearch' as const) : ('nearbysearch' as const),
          filters: {},
          languageContext: { uiLanguage, requestLanguage: detectedLanguage, googleLanguage },
          originalQuery: request.query
        },
        language: detectedLanguage
      },
      results: finalResults,
      chips: [],
      assist: { type: 'guide', message: finalResults.length === 0 ? 'No results found (Google API stub)' : '' },
      meta: {
        tookMs: totalDurationMs,
        mode: mapping.providerMethod === 'textSearch' ? ('textsearch' as const) : ('nearbysearch' as const),
        appliedFilters: [],
        confidence: intentDecision.confidence,
        source: 'route2',
        failureReason: 'NONE'
      }
    };

    endStage(ctx, 'response_build', responseBuildStart);

    wsManager.publishToChannel('search', requestId, request.sessionId || ctx.sessionId, {
      type: 'status',
      requestId,
      status: 'completed'
    });

    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'pipeline_failed',
        durationMs,
        error: error instanceof Error ? error.message : 'unknown'
      },
      '[ROUTE2] Pipeline failed'
    );

    throw error;
  }
  function shouldDebugStop(ctx: Route2Context, stopAfter: string): boolean {
    return ctx.debug?.stopAfter === stopAfter;
  }

}
