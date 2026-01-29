/**
 * Orchestrator Guards Module
 * Handles guard clauses and early stops (GATE STOP, ASK_CLARIFY, NEARBY location check)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from './types.js';
import type { RouteLLMMapping } from './stages/route-llm/schemas.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { generateAndPublishAssistant } from './assistant/assistant-integration.js';
import type { AssistantGateContext, AssistantClarifyContext, AssistantGenericQueryNarrationContext } from './assistant/assistant-llm.service.js';
import { resolveAssistantLanguage, resolveSessionId } from './orchestrator.helpers.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';

/**
 * Handle GATE2 STOP (not food related)
 * Returns SearchResponse if should stop, null if should continue
 */
export async function handleGateStop(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (gateResult.gate.route !== 'STOP') {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

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
  const assistantContext: AssistantGateContext = {
    type: 'GATE_FAIL',
    reason: 'NO_FOOD',
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, gateResult.gate.language)
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

/**
 * Handle GATE2 ASK_CLARIFY (uncertain query)
 * Returns SearchResponse if should stop, null if should continue
 */
export async function handleGateClarify(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (gateResult.gate.route !== 'ASK_CLARIFY') {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

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

  const assistantContext: AssistantClarifyContext = {
    type: 'CLARIFY',
    reason: 'MISSING_FOOD',
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, gateResult.gate.language)
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

/**
 * Handle NEARBY route guard (requires userLocation)
 * Returns SearchResponse if should stop, null if should continue
 */
export async function handleNearbyLocationGuard(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (mapping.providerMethod !== 'nearbySearch' || ctx.userLocation) {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

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

  const assistantContext: AssistantClarifyContext = {
    type: 'CLARIFY',
    reason: 'MISSING_LOCATION',
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, mapping.language)
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

/**
 * Check if query is generic (e.g., "what to eat")
 * Generic query: foodSignal=YES but no specific location in query (no cityText)
 */
function isGenericFoodQuery(
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult
): boolean {
  return (
    gateResult.gate.foodSignal === 'YES' &&
    !intentDecision.cityText &&
    intentDecision.route === 'NEARBY' // Generic queries typically route to NEARBY
  );
}

/**
 * Store generic query narration flag for later use in response builder
 * Returns null (always continues)
 */
export function checkGenericFoodQuery(
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context
): null {
  if (isGenericFoodQuery(gateResult, intentDecision)) {
    logger.info(
      {
        requestId: ctx.requestId,
        pipelineVersion: 'route2',
        event: 'generic_query_detected',
        reason: 'food_yes_no_location_text',
        hasUserLocation: !!ctx.userLocation
      },
      '[ROUTE2] Detected generic food query - will add narration after results'
    );

    // Store flag for response builder to add narration
    (ctx as any).isGenericQuery = true;
  }

  return null; // Always continue
}
