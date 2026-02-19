/**
 * Gate Clarify Guard
 * Handles GATE2 ASK_CLARIFY (uncertain query)
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { SearchResponse } from '../../types/search-response.dto.js';
import type { Route2Context, Gate2StageOutput } from '../types.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildGuardResponse } from './shared/response-builder.js';
import { buildClarifyContext, invokeAssistant } from './shared/assistant-helper.js';

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

  const { requestId } = ctx;

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

  const assistantContext = buildClarifyContext(
    request,
    ctx,
    'MISSING_FOOD',
    gateResult.gate.language
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
    sourceLanguage: ctx.queryLanguage as any,
    confidence: gateResult.gate.confidence,
    source: 'route2_gate_clarify',
    failureReason: 'LOW_CONFIDENCE'
  });
}
