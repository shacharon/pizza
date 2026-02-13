/**
 * Gate Stop Guard
 * Handles GATE2 STOP (not food related)
 */

import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { SearchResponse } from '../../../types/search-response.dto.js';
import type { Route2Context, Gate2StageOutput } from '../types.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildGuardResponse } from './shared/response-builder.js';
import { buildGateFailContext, invokeAssistant } from './shared/assistant-helper.js';

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

  const { requestId } = ctx;

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
  const assistantContext = buildGateFailContext(request, ctx, gateResult.gate.language);

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
    assistType: 'guide',
    gateLanguage: gateResult.gate.language,
    sourceLanguage: ctx.queryLanguage,
    confidence: gateResult.gate.confidence,
    source: 'route2_gate_stop',
    failureReason: 'LOW_CONFIDENCE'
  });
}
