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
 * Filter keywords that indicate explicit filter intent
 * If present, run base_filters LLM even for generic queries
 */
const FILTER_KEYWORDS = [
  // Open/Hours (Hebrew + English)
  'פתוח', 'פתוחות', 'סגור', 'סגורות', 'עכשיו',
  'open', 'closed', 'now', 'hours',

  // Price (Hebrew + English)
  'זול', 'זולות', 'יקר', 'יקרות', 'יוקרתי', 'בינוני', 'מחיר',
  'cheap', 'expensive', 'price', 'budget', 'luxury', 'affordable',

  // Rating (Hebrew + English)
  'דירוג', 'כוכב', 'כוכבים', 'מדורג',
  'rating', 'star', 'stars', 'rated', 'top',

  // Distance (Hebrew + English)
  'קרוב', 'רחוק', 'ק"מ', 'מטר',
  'near', 'close', 'far', 'distance', 'km', 'meter',

  // Reviews (Hebrew + English)
  'ביקורת', 'ביקורות', 'המלצה', 'המלצות', 'מומלץ',
  'review', 'reviews', 'recommended', 'popular',

  // Cuisine Types (Hebrew + English) - Deterministic heuristic
  // Italian
  'איטלקי', 'איטלקית', 'איטלקיות', 'italian', 'italiano', 'פיצה', 'pizza', 'פסטה', 'pasta',
  // Asian
  'סושי', 'sushi', 'סיני', 'סינית', 'chinese', 'יפני', 'יפנית', 'japanese', 'תאילנדי', 'תאילנדית', 'thai',
  'אסייתי', 'אסייתית', 'asian', 'ראמן', 'ramen', 'נודלס', 'noodles',
  // Indian
  'הודי', 'הודית', 'indian', 'קארי', 'curry',
  // Mexican
  'מקסיקני', 'מקסיקנית', 'mexican', 'טאקו', 'taco', 'בוריטו', 'burrito',
  // Mediterranean & Middle Eastern
  'יווני', 'יוונית', 'greek', 'ים תיכוני', 'mediterranean', 'ערבי', 'ערבית', 'arabic',
  'מזרח תיכוני', 'middle eastern', 'חומוס', 'hummus', 'פלאפל', 'falafel', 'שווארמה', 'shawarma',
  // French
  'צרפתי', 'צרפתית', 'french',
  // American
  'אמריקאי', 'אמריקאית', 'american', 'המבורגר', 'burger', 'סטייק', 'steak',
  // Seafood
  'פירות ים', 'seafood', 'דגים', 'fish',
  // Dietary
  'טבעוני', 'טבעונית', 'vegan', 'צמחוני', 'צמחונית', 'vegetarian',
  'כשר', 'כשרה', 'kosher', 'חלבי', 'dairy', 'בשרי', 'meat',
  // Other common cuisines
  'בר', 'bar', 'פאב', 'pub', 'קפה', 'cafe', 'coffee', 'קפה', 'מאפה', 'bakery', 'מאפיה',
  'ברגר', 'בורגר', 'גריל', 'grill', 'bbq', 'ברביקיו'
];

/**
 * Check if query contains explicit filter keywords (including cuisine types)
 * DETERMINISTIC HEURISTIC - No LLM used
 * Ensures base_filters is NOT skipped for queries with cuisine keywords
 */
function containsFilterKeywords(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return FILTER_KEYWORDS.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
}

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
 * Fire parallel tasks after intent stage
 * Optimizes LLM calls for generic queries with location
 * 
 * Returns promises that can be awaited later in the pipeline
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
  const isGenericWithLocation = isGenericFoodQueryWithLocation(gateResult, intentDecision, ctx);
  const hasFilterKeywords = containsFilterKeywords(request.query);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'parallel_started',
      route: intentDecision.route,
      isGenericWithLocation,
      hasFilterKeywords
    },
    '[ROUTE2] Starting parallel tasks (base_filters + post_constraints)'
  );

  // OPTIMIZATION: Skip post_constraints for generic queries with location
  // User has location, query is generic ("what to eat") → no complex constraints needed
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
    : executePostConstraintsStage(request, ctx).catch((err) => {
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

  // OPTIMIZATION: Skip base_filters for generic queries UNLESS filter keywords present
  // If generic + location + no filter keywords → use defaults (no LLM call)
  const baseFiltersPromise = (isGenericWithLocation && !hasFilterKeywords)
    ? Promise.resolve(DEFAULT_BASE_FILTERS).then((defaults) => {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'base_filters_skipped',
        reason: 'generic_query_no_filter_keywords',
        msg: '[ROUTE2] Skipping base_filters LLM for generic query without filter keywords (deterministic defaults)'
      });
      return defaults;
    })
    : resolveBaseFiltersLLM({
      query: request.query,
      route: intentDecision.route, // ✅ Use actual route from intent (not hardcoded)
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

  return { baseFiltersPromise, postConstraintsPromise };
}
