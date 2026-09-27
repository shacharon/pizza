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

/**
 * Early INTENT guard: TEXTSEARCH with no location continues.
 * The location question is attached later on the response that has places.
 * Returns null so the pipeline does not stop here.
 */
export async function handleEarlyTextSearchLocationGuard(
  request: SearchRequest,
  _gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context,
  _wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (intentDecision.route !== 'TEXTSEARCH') {
    return null;
  }

  const hasUserLocation = !!ctx.userLocation;
  const hasCityText = !!intentDecision.cityText;

  if (hasUserLocation || hasCityText) {
    return null;
  }

  logger.info(
    {
      requestId: ctx.requestId,
      pipelineVersion: 'route2',
      event: 'early_textsearch_no_location_continue',
      query: request.query,
      route: intentDecision.route,
      hasUserLocation,
      hasCityText
    },
    '[ROUTE2] TEXTSEARCH without location continues'
  );

  return null;
}

/**
 * Text search with no location anchor continues.
 * Near-me, city, GPS, and bias stay on their own paths.
 * Returns null so this guard does not replace the search with an empty clarify.
 */
export async function handleTextSearchMissingLocationGuard(
  request: SearchRequest,
  _gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  ctx: Route2Context,
  _wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (mapping.providerMethod !== 'textSearch') {
    return null;
  }

  const hasUserLocation = !!ctx.userLocation;
  const hasCityText = !!(mapping as any).cityText || !!intentDecision.cityText;
  const hasBias = !!(mapping as any).bias;

  const { isNearMeQuery } = await import('../utils/near-me-detector.js');
  const isNearMe = isNearMeQuery(request.query);

  if (hasUserLocation || hasCityText || hasBias || isNearMe) {
    return null;
  }

  logger.info(
    {
      requestId: ctx.requestId,
      pipelineVersion: 'route2',
      event: 'textsearch_missing_location_continue',
      providerMethod: mapping.providerMethod,
      hasUserLocation,
      hasCityText,
      hasBias
    },
    '[ROUTE2] Text search without location anchor continues'
  );

  return null;
}
