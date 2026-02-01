/**
 * Orchestrator Parallel Tasks Module
 * Handles firing and managing parallel LLM tasks (base_filters, post_constraints)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from './types.js';
import type { PreGoogleBaseFilters } from './shared/shared-filters.types.js';
import type { PostConstraints } from './shared/post-constraints.types.js';
import { resolveBaseFiltersLLM } from './shared/base-filters-llm.js';
import { executePostConstraintsStage } from './stages/post-constraints/post-constraints.stage.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { DEFAULT_POST_CONSTRAINTS, DEFAULT_BASE_FILTERS } from './failure-messages.js';

/**
 * ==================================================================================
 * REMOVED (P0 FIX - 2026-01-31): FILTER_KEYWORDS and containsFilterKeywords()
 * 
 * Previously used Hebrew/English keyword lists to decide whether to skip base_filters LLM.
 * This was language-specific and brittle (missed many variations, false positives).
 * 
 * Replaced with structural, language-agnostic gating based on route + location context.
 * See: shouldSkipBaseFiltersLLM() for new logic.
 * ==================================================================================
 */

/**
 * Check if query is generic food query (for optimization decisions)
 */
function isGenericFoodQueryWithLocation(
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context
): boolean {
  return (
    gateResult.gate.foodSignal === 'YES' &&
    !intentDecision.cityText &&
    (intentDecision.route === 'NEARBY' || intentDecision.route === 'TEXTSEARCH') &&
    !!ctx.userLocation // Has location
  );
}

/**
 * Deterministic guard: Check if any constraints are active in base filters
 * Returns true if post_constraints should run, false if it can be skipped
 */
function canRunPostConstraints(baseFilters: PreGoogleBaseFilters): boolean {
  // Check if ANY constraint is active
  return (
    baseFilters.openState !== null ||
    baseFilters.priceIntent !== null ||
    baseFilters.minRatingBucket !== null ||
    baseFilters.minReviewCountBucket !== null
  );
}

/**
 * Determine if base_filters LLM should be skipped (P0 FIX - Language-Agnostic)
 * 
 * NEW RULE (Structural, no query text parsing):
 * Skip base_filters LLM ONLY when:
 * 1. Route is NEARBY (location-focused, not text-focused)
 * 2. User location is available (no need to infer location from query)
 * 3. No explicit city text (means query is purely location-based, not text-based)
 * 
 * Rationale:
 * - NEARBY + userLocation = GPS-based search, minimal query parsing needed
 * - TEXTSEARCH = Text-driven search, always parse for filters/constraints
 * - cityText present = User specified location in text, parse for additional context
 * - No language/keyword dependencies (works for Hebrew, English, any language)
 * 
 * @returns true if base_filters LLM can be safely skipped
 */
function shouldSkipBaseFiltersLLM(
  intentDecision: IntentResult,
  ctx: Route2Context
): boolean {
  return (
    intentDecision.route === 'NEARBY' &&
    !!ctx.userLocation &&
    !intentDecision.cityText
  );
}

/**
 * Fire parallel tasks after intent stage
 * Optimizes LLM calls for generic queries with location
 * 
 * Returns promises that can be awaited later in the pipeline
 * 
 * NOTE: Should only be called when intentDecision.route is a MappingRoute (not CLARIFY)
 */
export function fireParallelTasks(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context
): {
  baseFiltersPromise: Promise<PreGoogleBaseFilters>;
  postConstraintsPromise: Promise<PostConstraints>;
} {
  const { requestId } = ctx;

  // Safety check: CLARIFY route should have been handled by guard before calling this
  if (intentDecision.route === 'CLARIFY') {
    throw new Error('[ROUTE2] fireParallelTasks called with CLARIFY route - should have been handled by guard');
  }

  // TypeScript now knows intentDecision.route is MappingRoute
  const mappingRoute: import('./types.js').MappingRoute = intentDecision.route;

  const isGenericWithLocation = isGenericFoodQueryWithLocation(gateResult, intentDecision, ctx);
  const skipBaseFilters = shouldSkipBaseFiltersLLM(intentDecision, ctx);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'parallel_started',
      route: mappingRoute,
      isGenericWithLocation,
      skipBaseFilters,
      hasUserLocation: !!ctx.userLocation,
      hasCityText: !!intentDecision.cityText
    },
    '[ROUTE2] Starting parallel tasks (base_filters + post_constraints)'
  );

  // STEP 1: Start base_filters (define it first so post_constraints can reference it)
  // OPTIMIZATION (P0 FIX): Skip base_filters using STRUCTURAL rule (language-agnostic)
  // Skip ONLY when: route=NEARBY + hasUserLocation + no cityText
  // Rationale: NEARBY with GPS = minimal parsing needed, defaults are safe
  // Always run LLM for TEXTSEARCH or when cityText present (text-driven queries need parsing)
  const baseFiltersPromise = skipBaseFilters
    ? Promise.resolve(DEFAULT_BASE_FILTERS).then((defaults) => {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'base_filters_skipped',
        reason: 'nearby_with_gps_location',
        route: mappingRoute,
        hasUserLocation: true,
        hasCityText: false,
        msg: '[ROUTE2] Skipping base_filters LLM for NEARBY route with GPS location (language-agnostic rule)'
      });
      return defaults;
    })
    : resolveBaseFiltersLLM({
      query: request.query,
      route: mappingRoute, // ✅ Use MappingRoute (guaranteed not CLARIFY)
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

  // STEP 2: Start post_constraints (smart execution based on base_filters result)
  // OPTIMIZATION: Smart post_constraints execution based on base_filters result
  // Strategy:
  // 1. If generic query with location → skip immediately (no parsing needed)
  // 2. Otherwise, await base_filters first, then check if any constraints are active
  // 3. If no active constraints → skip post_constraints (no filtering needed)
  // 4. If constraints exist → run post_constraints LLM
  const postConstraintsPromise = isGenericWithLocation
    ? Promise.resolve(DEFAULT_POST_CONSTRAINTS).then((defaults) => {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'post_constraints_skipped',
        reason: 'generic_query_with_location',
        msg: '[ROUTE2] Skipping post_constraints LLM for generic query with location (deterministic defaults)'
      });
      return defaults;
    })
    : baseFiltersPromise.then(async (baseFilters) => {
      // Deterministic guard: Skip post_constraints if no active constraints
      if (!canRunPostConstraints(baseFilters)) {
        logger.info({
          requestId,
          pipelineVersion: 'route2',
          event: 'post_constraints_skipped',
          reason: 'no_constraints',
          baseFilters: {
            openState: baseFilters.openState,
            priceIntent: baseFilters.priceIntent,
            minRatingBucket: baseFilters.minRatingBucket,
            minReviewCountBucket: baseFilters.minReviewCountBucket
          },
          msg: '[ROUTE2] Skipping post_constraints LLM - no active constraints detected in base_filters'
        });
        return DEFAULT_POST_CONSTRAINTS;
      }

      // Active constraints detected, run post_constraints LLM
      try {
        return await executePostConstraintsStage(request, ctx);
      } catch (err) {
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
      }
    });

  return { baseFiltersPromise, postConstraintsPromise };
}
