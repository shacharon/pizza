/**
 * Orchestrator Response Builder Module
 * Handles response construction and assistant summary
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from './types.js';
import type { RouteLLMMapping } from './stages/route-llm/schemas.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { startStage, endStage } from '../../../lib/telemetry/stage-timer.js';
import { generateAndPublishAssistant, generateAndPublishAssistantDeferred } from './assistant/assistant-integration.js';
import type { AssistantSummaryContext, AssistantGenericQueryNarrationContext } from './assistant/assistant-llm.service.js';
import { resolveAssistantLanguage, resolveSessionId } from './orchestrator.helpers.js';
import { toRequestLanguage } from './orchestrator.early-context.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import { buildAppliedFiltersArray } from './orchestrator.filters.js';

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
  ctx: Route2Context,
  wsManager: WebSocketManager,
  servedFrom?: 'cache' | 'google_api'
): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  // Start response build stage
  const responseBuildStart = startStage(ctx, 'response_build', { resultCount: finalResults.length });
  const totalDurationMs = Date.now() - startTime;

  // Use intentDecision.language (not gateResult) - Intent stage has the actual detected language
  const detectedLanguageRaw = intentDecision.language;
  // Normalize to RequestLanguage (handles 'other' by mapping to 'en')
  const detectedLanguage = toRequestLanguage(detectedLanguageRaw);
  const uiLanguage = detectedLanguage;
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
    language: resolveAssistantLanguage(ctx, request, detectedLanguage),
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
      language: resolveAssistantLanguage(ctx, request, detectedLanguage),
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
      appliedFilters,
      confidence: intentDecision.confidence,
      source: 'route2',
      failureReason: 'NONE'
    }
  };

  endStage(ctx, 'response_build', responseBuildStart);

  // Publish completion status to search channel
  wsManager.publishToChannel('search', requestId, sessionId, {
    type: 'status',
    requestId,
    status: 'completed'
  });

  // Publish final search results to WebSocket channel
  const subscriberCount = (wsManager as any).subscriptionManager?.getSubscribers(`search:${requestId}`)?.size || 0;

  logger.info({
    requestId,
    event: 'search_ws_publish_attempt',
    channel: 'search',
    payloadType: 'SEARCH_RESULTS',
    resultCount: finalResults.length,
    servedFrom: servedFrom || 'unknown',
    subscriberCount
  }, '[ROUTE2] Publishing search results to WebSocket');

  wsManager.publishToChannel('search', requestId, sessionId, {
    type: 'SEARCH_RESULTS',
    requestId,
    resultCount: finalResults.length,
    results: finalResults,
    servedFrom: servedFrom || 'google_api'
  });

  logger.info({
    requestId,
    event: 'search_ws_published',
    channel: 'search',
    payloadType: 'SEARCH_RESULTS',
    resultCount: finalResults.length,
    servedFrom: servedFrom || 'unknown',
    subscriberCount
  }, '[ROUTE2] Search results published to WebSocket');

  // DIETARY NOTE: Merged into SUMMARY (no separate message)
  // Dietary hint is now included in the SUMMARY message via assistantContext.dietaryNote

  return response;
}
