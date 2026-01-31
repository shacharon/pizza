/**
 * Orchestrator Response Builder Module
 * Handles response construction and assistant summary
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { FailureReason } from '../types/domain.types.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from './types.js';
import type { RouteLLMMapping } from './stages/route-llm/schemas.js';
import type { RankingSignals } from './ranking/ranking-signals.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { startStage, endStage } from '../../../lib/telemetry/stage-timer.js';
import { generateAndPublishAssistant, generateAndPublishAssistantDeferred } from './assistant/assistant-integration.js';
import type { AssistantSummaryContext, AssistantGenericQueryNarrationContext } from './assistant/assistant-llm.service.js';
import { resolveAssistantLanguage, resolveSessionId } from './orchestrator.helpers.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import { buildAppliedFiltersArray } from './orchestrator.filters.js';
import { publishRankingSuggestionDeferred } from './assistant/ranking-suggestion-publisher.js';
import { rankingSignalsCache } from './ranking/ranking-signals-cache.redis.js';

/**
 * DEFENSIVE INVARIANT: Validate response for CLARIFY/STOPPED states
 * Ensures CLARIFY responses NEVER contain results or pagination
 */
function validateClarifyResponse(response: SearchResponse): SearchResponse {
  const isClarify = response.assist.type === 'clarify';
  const isDoneStopped = response.meta.failureReason !== 'NONE';

  if (isClarify || isDoneStopped) {
    // INVARIANT VIOLATION: CLARIFY/STOPPED must have empty results
    if (response.results.length > 0) {
      logger.error({
        requestId: response.requestId,
        assistType: response.assist.type,
        failureReason: response.meta.failureReason,
        resultCount: response.results.length,
        event: 'clarify_invariant_violated',
        msg: '[ROUTE2] CLARIFY response had results - sanitizing (BUG)'
      });
      // FAIL-SAFE: Force empty results
      response.results = [];
      delete response.groups;
    }

    // INVARIANT VIOLATION: CLARIFY/STOPPED must have no pagination
    if (response.meta.pagination) {
      logger.error({
        requestId: response.requestId,
        assistType: response.assist.type,
        failureReason: response.meta.failureReason,
        hasPagination: true,
        event: 'clarify_pagination_invariant_violated',
        msg: '[ROUTE2] CLARIFY response had pagination - sanitizing (BUG)'
      });
      // FAIL-SAFE: Remove pagination
      delete response.meta.pagination;
    }
  }

  return response;
}

/**
 * Build early exit response (gate stop, clarify, location required, etc.)
 * Shared builder to reduce duplication across guard clauses
 * 
 * INVARIANT: Always returns empty results[] and no pagination
 */
export function buildEarlyExitResponse(params: {
  requestId: string;
  sessionId: string;
  query: string;
  language: 'he' | 'en';
  confidence: number;
  assistType: 'guide' | 'clarify';
  assistMessage: string;
  source: string;
  failureReason: FailureReason;
  startTime: number;
}): SearchResponse {
  const response: SearchResponse = {
    requestId: params.requestId,
    sessionId: params.sessionId,
    query: {
      original: params.query,
      parsed: {
        query: params.query,
        searchMode: 'textsearch' as const,
        filters: {},
        languageContext: {
          uiLanguage: 'he' as const,
          requestLanguage: 'he' as const,
          googleLanguage: 'he' as const
        },
        originalQuery: params.query
      },
      language: params.language
    },
    results: [], // INVARIANT: Always empty for CLARIFY/STOPPED
    chips: [],
    assist: { type: params.assistType, message: params.assistMessage },
    meta: {
      tookMs: Date.now() - params.startTime,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence: params.confidence,
      source: params.source,
      failureReason: params.failureReason
      // INVARIANT: No pagination field for CLARIFY/STOPPED
    }
  };

  // DEFENSIVE: Validate invariants before returning
  return validateClarifyResponse(response);
}

/**
 * Build final search response with assistant summary
 */
export async function buildFinalResponse(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  finalResults: any[],
  filtersForPostFilter: any,
  rankingSignals: RankingSignals | null,
  ctx: Route2Context,
  wsManager: WebSocketManager,
  rankingApplied: boolean,
  cuisineEnforcementFailed: boolean = false,
  orderExplain?: {
    profile: string;
    weights: { rating: number; reviews: number; distance: number; openBoost: number };
    distanceOrigin: 'CITY_CENTER' | 'USER_LOCATION' | 'NONE';
    distanceRef: { lat: number; lng: number } | null;
    reordered: boolean;
  },
  finalFilters?: any  // NEW: For language context transparency
): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  // Start response build stage
  const responseBuildStart = startStage(ctx, 'response_build', { resultCount: finalResults.length });
  const totalDurationMs = Date.now() - startTime;

  const detectedLanguage = gateResult.gate.language;
  const uiLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';
  const googleLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';

  // Prepare assistant summary context
  const top3Names = finalResults.slice(0, 3).map((r: any) => r.name || 'Unknown');

  // DIETARY NOTE: Check if gluten-free soft hint should be included
  const isGlutenFree = (filtersForPostFilter as any).isGlutenFree;
  const resultsCount = finalResults.length;
  const shouldIncludeDietaryNote = isGlutenFree === true && resultsCount > 0;

  // INSIGHT METADATA: Calculate metadata for intelligent narration
  const openNowCount = finalResults.filter((r: any) => r.openNow === true).length;
  const closedCount = finalResults.filter((r: any) => r.openNow === false).length;
  const openNowUnknownCount = finalResults.filter((r: any) =>
    r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
  ).length;
  const currentHour = new Date().getHours();
  const radiusKm = (mapping as any).radiusMeters ? Math.round((mapping as any).radiusMeters / 1000) : undefined;
  const appliedFilters = buildAppliedFiltersArray(filtersForPostFilter);

  const assistantContext: AssistantSummaryContext = {
    type: 'SUMMARY',
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, detectedLanguage, intentDecision.languageConfidence),
    resultCount: finalResults.length,
    top3Names,
    // INSIGHT METADATA: Provide data for intelligent narration
    // IMPORTANT: Only include openNow data if ALL results have known status (no unknowns)
    metadata: {
      ...(openNowUnknownCount === 0 ? { openNowCount, currentHour } : {}),
      ...(radiusKm !== undefined ? { radiusKm } : {}),
      ...(appliedFilters.length > 0 ? { filtersApplied: appliedFilters } : {})
    },
    // MERGED DIETARY NOTE: Include soft gluten-free hint in SUMMARY (not separate message)
    ...(shouldIncludeDietaryNote ? {
      dietaryNote: {
        type: 'gluten-free',
        shouldInclude: true
      }
    } : {})
  };

  // NON-BLOCKING: Fire assistant generation asynchronously (deferred)
  // Don't await - results can be published immediately
  generateAndPublishAssistantDeferred(
    ctx,
    requestId,
    sessionId,
    assistantContext,
    wsManager
  );

  // HTTP response message: empty (WebSocket clients get real assistant message when ready)
  const assistMessage = '';

  // Generic query narration (if flagged) - also non-blocking
  if ((ctx as any).isGenericQuery && ctx.userLocation) {
    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'generic_query_narration',
        resultCount: finalResults.length
      },
      '[ROUTE2] Sending generic query narration (used current location)'
    );

    const narrationContext: AssistantGenericQueryNarrationContext = {
      type: 'GENERIC_QUERY_NARRATION',
      query: request.query,
      language: resolveAssistantLanguage(ctx, request, detectedLanguage, intentDecision.languageConfidence),
      resultCount: finalResults.length,
      usedCurrentLocation: true
    };

    // Fire deferred (non-blocking)
    generateAndPublishAssistantDeferred(
      ctx,
      requestId,
      sessionId,
      narrationContext,
      wsManager
    );
  }

  // Build final response
  // Pagination metadata: Return ALL results (up to 40) in first response
  // Frontend will handle local pagination (no new search on "load more")
  const totalPool = finalResults.length;
  const shownNow = totalPool;  // All results returned initially (up to 40)
  const hasMore = false;  // No server-side pagination

  // Log paging metadata (proof of pagination behavior)
  logger.info({
    requestId,
    event: 'pagination_meta',
    fetchedCount: totalPool,           // Total fetched from Google (up to 40)
    returnedCount: shownNow,           // Total returned to client (all 40)
    clientVisibleCount: 12,            // Frontend shows 12 initially (updated from 10)
    clientNextIncrement: 5,            // Frontend loads +5 on "Load More"
    serverPagination: false            // All results returned, client handles pagination
  }, '[ROUTE2] Pagination metadata (client-side)');

  // Log final response order with clear order source
  const finalOrder = finalResults.slice(0, 10).map((r, idx) => ({
    idx,
    placeId: r.placeId || r.id,
    name: r.name || 'Unknown'
  }));

  const orderSource = rankingApplied ? 'ranking' : 'google';
  const orderMessage = rankingApplied
    ? '[ROUTE2] Final response order (ranked deterministically)'
    : '[ROUTE2] Final response order (original Google order)';

  logger.info({
    requestId,
    event: 'final_response_order',
    count: finalResults.length,
    first10: finalOrder,
    orderSource,
    reordered: rankingApplied
  }, orderMessage);

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
    results: finalResults,  // Return ALL results (frontend handles pagination)
    chips: [],
    assist: { type: 'guide', message: assistMessage },
    meta: {
      tookMs: totalDurationMs,
      mode: mapping.providerMethod === 'textSearch' ? ('textsearch' as const) : ('nearbysearch' as const),
      appliedFilters,
      confidence: intentDecision.confidence,
      source: 'route2',
      failureReason: 'NONE',
      // Pagination metadata (for frontend to know pool size)
      ...(totalPool > 0 && {
        pagination: {
          shownNow,      // ALL results returned
          totalPool,     // Total pool size
          offset: 0,     // Always 0 (no server-side pagination)
          hasMore        // Always false (frontend paginates)
        }
      }),
      // Ranking signals (when available)
      ...(rankingSignals && { rankingSignals }),
      // Cuisine enforcement flag (when failed)
      ...(cuisineEnforcementFailed && { cuisineEnforcementFailed: true }),
      // Order explanation (for frontend transparency)
      ...(orderExplain && { order_explain: orderExplain }),
      // Language context (for language separation transparency)
      ...(finalFilters.languageContext && { languageContext: finalFilters.languageContext })
    }
  };

  endStage(ctx, 'response_build', responseBuildStart);

  // Publish completion status to search channel
  wsManager.publishToChannel('search', requestId, sessionId, {
    type: 'status',
    requestId,
    status: 'completed'
  });

  // DIETARY NOTE: Merged into SUMMARY (no separate message)
  // Dietary hint is now included in the SUMMARY message via assistantContext.dietaryNote

  // RANKING SIGNALS CACHE: Store for "load more" events (Redis with IDOR protection)
  // Ranking suggestion will fire when user clicks "load more", not on initial search
  if (rankingSignals) {
    // Store in Redis with session ownership for IDOR protection
    await rankingSignalsCache.set(
      requestId,
      rankingSignals,
      request.query,
      uiLanguage,
      sessionId,
      undefined // userId not currently tracked
    );

    logger.debug({
      requestId,
      profile: rankingSignals.profile,
      hasTriggers: Object.values(rankingSignals.triggers).some(Boolean),
      hasSessionId: !!sessionId,
      event: 'ranking_signals_stored_redis'
    }, '[RANKING] Stored signals in Redis for load_more events');
  }

  // DEFENSIVE: Validate invariants before returning (should never trigger for success case)
  return validateClarifyResponse(response);
}
