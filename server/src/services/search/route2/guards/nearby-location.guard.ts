/**
 * Nearby Location Guard
 * Handles NEARBY route guard (requires userLocation)
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { SearchResponse } from '../../types/search-response.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult } from '../types.js';
import type { RouteLLMMapping } from '../stages/route-llm/schemas.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildGuardResponse } from './shared/response-builder.js';
import { buildClarifyContext, invokeAssistant } from './shared/assistant-helper.js';

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

  const { requestId } = ctx;

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

  const assistantContext = buildClarifyContext(
    request,
    ctx,
    'MISSING_LOCATION',
    mapping.language
  );

  const { sessionId, message } = await invokeAssistant({
    ctx,
    request,
    wsManager,
    assistantContext,
    fallbackHttpMessage
  });

  return buildGuardResponse({
    request,
    ctx,
    sessionId,
    assistMessage: message,
    assistType: 'clarify',
    gateLanguage: gateResult.gate.language,
    sourceLanguage: intentDecision.language as any,
    confidence: intentDecision.confidence,
    source: 'route2_guard_clarify',
    failureReason: 'LOW_CONFIDENCE'
  });
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
