/**
 * Orchestrator Near-Me Module
 * Handles near-me detection and location requirement logic
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context, IntentResult } from './types.js';
import { isNearMeQuery, getNearMePattern } from './utils/near-me-detector.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { generateAndPublishAssistant } from './assistant/assistant-integration.js';
import type { AssistantClarifyContext } from './assistant/assistant-llm.service.js';
import { resolveAssistantLanguage, resolveSessionId } from './orchestrator.helpers.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';

/**
 * Check if query is "near me" and handle location requirements
 * Returns SearchResponse if should stop (no location), null if should continue
 */
export async function handleNearMeLocationCheck(
  request: SearchRequest,
  intentDecision: IntentResult,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);
  const isNearMe = isNearMeQuery(request.query);

  if (!isNearMe) {
    return null; // Not near-me, continue
  }

  if (!ctx.userLocation) {
    // Near-me without location - return CLARIFY
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
    const assistantContext: AssistantClarifyContext = {
      type: 'CLARIFY',
      reason: 'MISSING_LOCATION',
      query: request.query,
      language: resolveAssistantLanguage(ctx, request, intentDecision.language)
    };

    const assistMessage = await generateAndPublishAssistant(
      ctx,
      requestId,
      sessionId,
      assistantContext,
      fallbackHttpMessage,
      wsManager
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

  // Near-me with location - continue
  return null;
}

/**
 * Override intent route to NEARBY if near-me detected with location
 * Returns modified intentDecision if overridden, original otherwise
 */
export function applyNearMeRouteOverride(
  request: SearchRequest,
  intentDecision: IntentResult,
  ctx: Route2Context
): IntentResult {
  const isNearMe = isNearMeQuery(request.query);

  if (!isNearMe || !ctx.userLocation) {
    return intentDecision; // No override needed
  }

  const originalRoute = intentDecision.route;

  if (originalRoute !== 'NEARBY') {
    logger.info(
      {
        requestId: ctx.requestId,
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

    return {
      ...intentDecision,
      route: 'NEARBY',
      reason: 'near_me_keyword_override'
    };
  }

  return intentDecision;
}
