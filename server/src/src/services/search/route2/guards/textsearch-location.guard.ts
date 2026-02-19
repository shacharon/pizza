/**
 * Text Search Location Guards
 * Handles early INTENT guard and textSearch missing location guard
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
 * Early INTENT guard: Check if TEXTSEARCH route has location anchors
 * Returns SearchResponse if should stop (no location), null if should continue
 * 
 * Triggers CLARIFY when ALL conditions are true:
 * - route === 'TEXTSEARCH' (from intent decision)
 * - No userLocation
 * - No cityText from intent
 * - Blocks Google search to avoid wasted API calls
 */
export async function handleEarlyTextSearchLocationGuard(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  // Only apply to TEXTSEARCH route
  if (intentDecision.route !== 'TEXTSEARCH') {
    return null;
  }

  // Check if we have any location anchor from intent stage
  const hasUserLocation = !!ctx.userLocation;
  const hasCityText = !!intentDecision.cityText;

  // If we have any location anchor, continue
  if (hasUserLocation || hasCityText) {
    return null;
  }

  // No location anchor - return CLARIFY and block search
  const { requestId } = ctx;

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_clarify',
      reason: 'early_textsearch_no_location',
      blocksSearch: true,
      route: intentDecision.route,
      hasUserLocation,
      hasCityText
    },
    '[ROUTE2] Early INTENT guard: TEXTSEARCH without location - blocking search'
  );

  const fallbackHttpMessage = 'כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.';
  const assistantContext = buildClarifyContext(
    request,
    ctx,
    'MISSING_LOCATION',
    intentDecision.language
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
    source: 'route2_early_textsearch_guard',
    failureReason: 'LOCATION_REQUIRED'
  });
}

/**
 * Handle text search missing location guard
 * Returns SearchResponse if should stop (no location anchor), null if should continue
 * 
 * Triggers CLARIFY when ALL conditions are true:
 * - providerMethod === 'textSearch'
 * - No userLocation
 * - No cityText
 * - No bias already prepared
 * - Not a near-me pattern (handled by separate guard)
 */
export async function handleTextSearchMissingLocationGuard(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  // Only apply to textSearch method
  if (mapping.providerMethod !== 'textSearch') {
    return null;
  }

  // Check if we have any location anchor
  const hasUserLocation = !!ctx.userLocation;
  const hasCityText = !!(mapping as any).cityText || !!intentDecision.cityText;
  const hasBias = !!(mapping as any).bias;

  // Import near-me detector to check if this is a near-me query
  const { isNearMeQuery } = await import('../utils/near-me-detector.js');
  const isNearMe = isNearMeQuery(request.query);

  // If we have any location anchor OR it's a near-me query, continue
  if (hasUserLocation || hasCityText || hasBias || isNearMe) {
    return null;
  }

  // No location anchor - return CLARIFY
  const { requestId } = ctx;

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_clarify',
      reason: 'missing_location_for_textsearch',
      providerMethod: mapping.providerMethod,
      hasUserLocation,
      hasCityText,
      hasBias
    },
    '[ROUTE2] Text search without location anchor - asking for clarification'
  );

  const fallbackHttpMessage = 'כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.';
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
    source: 'route2_textsearch_location_clarify',
    failureReason: 'LOCATION_REQUIRED'
  });
}
