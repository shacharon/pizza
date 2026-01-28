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
import { generateAndPublishAssistant } from './assistant/assistant-integration.js';
import type { AssistantSummaryContext } from './assistant/assistant-llm.service.js';
import { toNarratorLanguage, resolveSessionId } from './orchestrator.helpers.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';

/**
 * Build final search response with narrator summary
 */
export async function buildFinalResponse(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  finalResults: any[],
  filtersForPostFilter: any,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  // Start response build stage
  const responseBuildStart = startStage(ctx, 'response_build', { resultCount: finalResults.length });
  const totalDurationMs = Date.now() - startTime;

  const detectedLanguage = gateResult.gate.language;
  const uiLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';
  const googleLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';

  // Prepare assistant summary
  const fallbackHttpMessage = finalResults.length === 0 ? 'לא מצאתי תוצאות. נסה לשנות עיר/אזור או להסיר סינון.' : '';
  const top3Names = finalResults.slice(0, 3).map((r: any) => r.name || 'Unknown');

  const assistantContext: AssistantSummaryContext = {
    type: 'SUMMARY',
    query: request.query,
    language: toNarratorLanguage(detectedLanguage),
    resultCount: finalResults.length,
    top3Names
  };

  const assistMessage = await generateAndPublishAssistant(
    ctx,
    requestId,
    sessionId,
    assistantContext,
    fallbackHttpMessage,
    wsManager
  );

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
      appliedFilters: [],
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

  return response;
}
