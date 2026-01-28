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
import type { PreGoogleBaseFilters } from './shared/shared-filters.types.js';
import { resolveFilters } from './shared/filters-resolver.js';
import { applyPostFilters } from './post-filters/post-results.filter.js';
import type { PostConstraints } from './shared/post-constraints.types.js';
import { isNearMeQuery, getNearMePattern } from './utils/near-me-detector.js';

import { logger } from '../../../lib/logger/structured-logger.js';
import { wsManager } from '../../../server.js';
import { startStage, endStage } from '../../../lib/telemetry/stage-timer.js';
import { sanitizeQuery } from '../../../lib/telemetry/query-sanitizer.js';

// Assistant Narrator imports
import { ASSISTANT_MODE_ENABLED, DEBUG_NARRATOR_ENABLED } from '../../../config/narrator.flags.js';
import { generateAssistantMessage } from './narrator/assistant-narrator.js';
import { publishAssistantMessage } from './narrator/assistant-publisher.js';
import type {
  NarratorGateContext,
  NarratorClarifyContext,
  NarratorSummaryContext
} from './narrator/narrator.types.js';
import type { FetchErrorKind } from '../../../utils/fetch-with-timeout.js';

/**
 * Generate fallback assistant message for pipeline failures
 */
function generateFailureFallbackMessage(errorKind: string | undefined, error: unknown): {
  message: string;
  suggestedAction: string | null;
} {
  const errorMsg = error instanceof Error ? error.message : 'unknown error';
  
  switch (errorKind) {
    case 'DNS_FAIL':
      return {
        message: 'אנחנו נתקלים בבעיה בחיבור לשרתים. אנא נסה שוב בעוד מספר דקות.',
        suggestedAction: 'retry'
      };
      
    case 'TIMEOUT':
      return {
        message: 'החיפוש לוקח יותר זמן מהרגיל. אנא נסה שוב עם חיפוש ספציפי יותר.',
        suggestedAction: 'refine_query'
      };
      
    case 'NETWORK_ERROR':
      return {
        message: 'יש לנו בעיה זמנית בחיבור לשירות. נסה שוב בעוד רגע.',
        suggestedAction: 'retry'
      };
      
    case 'HTTP_ERROR':
      if (errorMsg.includes('403') || errorMsg.includes('401')) {
        return {
          message: 'יש לנו בעיה זמנית בגישה לשירות החיפוש. אנחנו עובדים על זה.',
          suggestedAction: null
        };
      }
      return {
        message: 'החיפוש נתקל בבעיה. אנא נסה שוב.',
        suggestedAction: 'retry'
      };
      
    default:
      return {
        message: 'משהו השתבש בחיפוש. אנא נסה שוב או שנה את החיפוש.',
        suggestedAction: 'retry'
      };
  }
}

const DEFAULT_POST_CONSTRAINTS: PostConstraints = {
  openState: null,
  openAt: null,
  openBetween: null,
  priceLevel: null,
  isKosher: null,
  requirements: { accessible: null, parking: null }
};

const DEFAULT_BASE_FILTERS: PreGoogleBaseFilters = {
  language: 'he',
  openState: null,
  openAt: null,
  openBetween: null,
  regionHint: null
};

function shouldDebugStop(ctx: Route2Context, stopAfter: string): boolean {
  return ctx.debug?.stopAfter === stopAfter;
}

function toNarratorLanguage(lang: unknown): 'he' | 'en' | 'other' {
  // HARD-CODED: All assistant messages must be English only
  return 'en';
}

function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return request.sessionId || ctx.sessionId || 'route2-session';
}

type NarratorBaseOpts = { traceId?: string; sessionId?: string };

async function maybeNarrateAndPublish(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  narratorContext: NarratorGateContext | NarratorClarifyContext | NarratorSummaryContext,
  fallbackHttpMessage: string,
  preferQuestionForHttp: boolean,
  logEventOnFail: string
): Promise<string> {
  // Log hook invocation (high-signal, always on)
  logger.info(
    {
      requestId,
      hookType: narratorContext.type,
      sessionIdPresent: !!sessionId,
      event: 'assistant_hook_called'
    },
    '[NARRATOR] Assistant hook invoked'
  );

  if (!ASSISTANT_MODE_ENABLED) {
    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        { requestId, event: 'narrator_skipped', reason: 'ASSISTANT_MODE_ENABLED=false' },
        '[NARRATOR] Skipped (feature disabled)'
      );
    }
    return fallbackHttpMessage;
  }

  try {
    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        {
          requestId,
          narratorType: narratorContext.type,
          sessionIdPresent: !!sessionId,
          event: 'narrator_invoked'
        },
        '[NARRATOR] Generating message'
      );
    }

    const opts: NarratorBaseOpts = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;

    const narrator = await generateAssistantMessage(narratorContext, ctx.llmProvider, requestId, opts);

    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        {
          requestId,
          narratorGenerated: true,
          messageLength: narrator.message?.length || 0,
          event: 'narrator_generated'
        },
        '[NARRATOR] Message generated successfully'
      );
    }

    // WS publish is best-effort
    publishAssistantMessage(wsManager, requestId, sessionId, narrator);

    // HTTP assist text: for CLARIFY prefer question when exists
    if (preferQuestionForHttp && narrator.question) return narrator.question;
    return narrator.message || fallbackHttpMessage;
  } catch (error) {
    logger.warn(
      {
        requestId,
        event: logEventOnFail,
        error: error instanceof Error ? error.message : String(error)
      },
      '[ROUTE2] Narrator failed, using fallback'
    );
    return fallbackHttpMessage;
  }
}

export async function searchRoute2(request: SearchRequest, ctx: Route2Context): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);
  const { queryLen, queryHash } = sanitizeQuery(request.query);

  logger.info(
    { requestId, pipelineVersion: 'route2', event: 'pipeline_selected', queryLen, queryHash },
    '[ROUTE2] Pipeline selected'
  );

  let baseFiltersPromise: Promise<PreGoogleBaseFilters> | null = null;
  let postConstraintsPromise: Promise<PostConstraints> | null = null;

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

      const fallbackHttpMessage = "זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: 'פיצה בתל אביב'.";
      const narratorContext: NarratorGateContext = {
        type: 'GATE_FAIL',
        // IMPORTANT: align these values to narrator.types.ts enums
        reason: 'NO_FOOD',
        query: request.query,
        language: toNarratorLanguage(gateResult.gate.language),
        locationKnown: !!ctx.userLocation
      };

      const assistMessage = await maybeNarrateAndPublish(
        ctx,
        requestId,
        sessionId,
        narratorContext,
        fallbackHttpMessage,
        false,
        'narrator_gate_fail_error'
      );

      return {
        requestId,
        sessionId,
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
        assist: { type: 'guide' as const, message: assistMessage },
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

      const fallbackHttpMessage =
        "כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה. לדוגמה: 'סושי באשקלון' או 'פיצה ליד הבית'.";

      const narratorContext: NarratorClarifyContext = {
        type: 'CLARIFY',
        // IMPORTANT: align these values to narrator.types.ts enums
        reason: 'AMBIGUOUS',
        query: request.query,
        language: toNarratorLanguage(gateResult.gate.language),
        locationKnown: !!ctx.userLocation
      };

      const assistMessage = await maybeNarrateAndPublish(
        ctx,
        requestId,
        sessionId,
        narratorContext,
        fallbackHttpMessage,
        true,
        'narrator_clarify_error'
      );

      return {
        requestId,
        sessionId,
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
        assist: { type: 'clarify' as const, message: assistMessage },
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

    // --- A: FIRE PARALLEL TASKS IMMEDIATELY AFTER GATE2 ---
    logger.info(
      { requestId, pipelineVersion: 'route2', event: 'parallel_started' },
      '[ROUTE2] Starting parallel tasks (base_filters + post_constraints + intent chain)'
    );

    baseFiltersPromise = resolveBaseFiltersLLM({
      query: request.query,
      route: 'TEXTSEARCH' as any,
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

    postConstraintsPromise = executePostConstraintsStage(request, ctx).catch((err) => {
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
      return DEFAULT_POST_CONSTRAINTS;
    });

    // INTENT + ROUTE_LLM chain
    let intentDecision = await executeIntentStage(request, ctx);

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
        region: intentDecision.region,
        language: intentDecision.language,
        confidence: intentDecision.confidence,
        reason: intentDecision.reason
      },
      '[ROUTE2] Intent routing decided'
    );

    // HOTFIX: Deterministic "near me" location requirement
    const isNearMe = isNearMeQuery(request.query);

    if (isNearMe && !ctx.userLocation) {
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

      const fallbackHttpMessage = 'כדי לחפש מסעדות לידי אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.';
      const narratorContext: NarratorClarifyContext = {
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        query: request.query,
        language: toNarratorLanguage(intentDecision.language),
        locationKnown: false
      };

      const assistMessage = await maybeNarrateAndPublish(
        ctx,
        requestId,
        sessionId,
        narratorContext,
        fallbackHttpMessage,
        true,
        'narrator_nearme_clarify_error'
      );

      return {
        requestId,
        sessionId,
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
        assist: { type: 'clarify' as const, message: assistMessage },
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

    // Guard: NEARBY requires userLocation
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

      const fallbackHttpMessage =
        "כדי לחפש 'לידי' אני צריך את המיקום שלך. אפשר לאשר מיקום או לכתוב עיר/אזור (למשל: 'פיצה בגדרה').";

      const narratorContext: NarratorClarifyContext = {
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        query: request.query,
        language: toNarratorLanguage(mapping.language),
        locationKnown: false
      };

      const assistMessage = await maybeNarrateAndPublish(
        ctx,
        requestId,
        sessionId,
        narratorContext,
        fallbackHttpMessage,
        true,
        'narrator_nearby_clarify_error'
      );

      return {
        requestId,
        sessionId,
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
        assist: { type: 'clarify' as const, message: assistMessage },
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

    // STAGE 5: GOOGLE_MAPS
    const googleResult = await executeGoogleMapsStage(mapping, request, ctx);
    ctx.timings.googleMapsMs = googleResult.durationMs;

    // Await post constraints as late as possible
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

    // RESPONSE BUILD
    const responseBuildStart = startStage(ctx, 'response_build', { resultCount: finalResults.length });
    const totalDurationMs = Date.now() - startTime;

    const detectedLanguage = gateResult.gate.language;
    const uiLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';
    const googleLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';

    // NARRATOR: SUMMARY (end of pipeline)
    const fallbackHttpMessage = finalResults.length === 0 ? 'לא מצאתי תוצאות. נסה לשנות עיר/אזור או להסיר סינון.' : '';
    const top3Names = finalResults.slice(0, 3).map((r: any) => r.name || 'Unknown');
    const openNowCount = finalResults.filter((r: any) => r.opening_hours?.open_now === true).length;
    const ratings = finalResults.map((r: any) => r.rating).filter((r): r is number => typeof r === 'number');
    const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;

    const appliedFiltersArray: string[] = [];
    if ((filtersForPostFilter as any).openState) appliedFiltersArray.push((filtersForPostFilter as any).openState);
    if ((filtersForPostFilter as any).priceLevel) appliedFiltersArray.push(`price:${(filtersForPostFilter as any).priceLevel}`);
    if ((filtersForPostFilter as any).isKosher) appliedFiltersArray.push('kosher');

    const narratorContext: NarratorSummaryContext = {
      type: 'SUMMARY',
      query: request.query,
      language: toNarratorLanguage(detectedLanguage),
      resultCount: finalResults.length,
      top3Names,
      openNowCount,
      avgRating,
      appliedFilters: appliedFiltersArray
    };

    const assistMessage = await maybeNarrateAndPublish(
      ctx,
      requestId,
      sessionId,
      narratorContext,
      fallbackHttpMessage,
      false,
      'narrator_summary_error'
    );

    const response: SearchResponse = {
      requestId,
      sessionId,
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
      assist: { type: 'guide', message: assistMessage },
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

    wsManager.publishToChannel('search', requestId, sessionId, {
      type: 'status',
      requestId,
      status: 'completed'
    });

    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    // Extract errorKind if available from TimeoutError
    const errorKind = (error && typeof error === 'object' && 'errorKind' in error) 
      ? (error as any).errorKind 
      : 'UNKNOWN';
    
    const errorStage = (error && typeof error === 'object' && 'stage' in error)
      ? (error as any).stage
      : 'unknown';

    logger.error(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'pipeline_failed',
        durationMs,
        errorKind,
        errorStage,
        error: error instanceof Error ? error.message : 'unknown'
      },
      '[ROUTE2] Pipeline failed'
    );
    
    // Publish assistant narrator message on failure (best-effort)
    try {
      if (ASSISTANT_MODE_ENABLED && wsManager) {
        let narrator: any;
        
        // Try to generate LLM narrator message
        try {
          const narratorContext: NarratorGateContext = {
            type: 'GATE_FAIL',
            reason: 'NO_FOOD',
            query: request.query || '',
            language: 'he', // Default to Hebrew for pipeline failures
            locationKnown: !!ctx.userLocation
          };
          
          const opts: NarratorBaseOpts = {};
          if (ctx.traceId) opts.traceId = ctx.traceId;
          if (ctx.sessionId) opts.sessionId = ctx.sessionId;
          
          narrator = await generateAssistantMessage(narratorContext, ctx.llmProvider, requestId, opts);
          
          if (DEBUG_NARRATOR_ENABLED) {
            logger.debug({
              requestId,
              event: 'narrator_llm_success',
              errorKind
            }, '[NARRATOR] LLM narrator generated for pipeline failure');
          }
        } catch (narratorErr) {
          // LLM narrator failed - use deterministic fallback
          const fallbackMessage = generateFailureFallbackMessage(errorKind, error);
          narrator = {
            type: 'GATE_FAIL',
            message: fallbackMessage.message,
            question: null,
            suggestedAction: fallbackMessage.suggestedAction,
            blocksSearch: false
          };
          
          if (DEBUG_NARRATOR_ENABLED) {
            logger.debug({
              requestId,
              event: 'narrator_llm_failed_using_fallback',
              errorKind,
              narratorError: narratorErr instanceof Error ? narratorErr.message : 'unknown'
            }, '[NARRATOR] LLM failed, using deterministic fallback');
          }
        }
        
        // Publish to search channel (where frontend subscribes)
        publishAssistantMessage(wsManager, requestId, ctx.sessionId, narrator);
        
        if (DEBUG_NARRATOR_ENABLED) {
          logger.debug({
            requestId,
            event: 'pipeline_failure_narrator_done',
            errorKind
          }, '[NARRATOR] Pipeline failure narrator published');
        }
      }
    } catch (assistErr) {
      // Swallow assistant publish errors - don't mask original error
      logger.warn({
        requestId,
        error: assistErr instanceof Error ? assistErr.message : 'unknown'
      }, '[NARRATOR] Failed to publish assistant message on pipeline failure');
    }

    throw error;
  } finally {
    // CRITICAL: Always drain parallel promises to prevent unhandled rejections
    // These promises may still be running if we hit an early return or exception
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
