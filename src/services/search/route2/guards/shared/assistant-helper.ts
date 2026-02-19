/**
 * Assistant Helper Module
 * Eliminates duplicated assistant context construction and invocation
 */

import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context } from '../../types.js';
import type { AssistantGateContext, AssistantClarifyContext } from '../../assistant/assistant-llm.service.js';
import type { WebSocketManager } from '../../../../../infra/websocket/websocket-manager.js';
import { generateAndPublishAssistant } from '../../assistant/assistant-integration.js';
import { resolveAssistantLanguage, resolveSessionId } from '../../orchestrator.helpers.js';

export interface AssistantInvocationParams {
  ctx: Route2Context;
  request: SearchRequest;
  wsManager: WebSocketManager;
  assistantContext: AssistantGateContext | AssistantClarifyContext;
  fallbackHttpMessage: string;
}

/**
 * Generate and publish assistant message
 * Centralizes the pattern: resolveSessionId → generateAndPublishAssistant
 */
export async function invokeAssistant(
  params: AssistantInvocationParams
): Promise<{ sessionId: string; message: string }> {
  const { ctx, request, wsManager, assistantContext, fallbackHttpMessage } = params;

  const sessionId = resolveSessionId(request, ctx);

  const message = await generateAndPublishAssistant(
    ctx,
    ctx.requestId,
    sessionId,
    assistantContext,
    fallbackHttpMessage,
    wsManager
  );

  return { sessionId, message };
}

/**
 * Build GATE_FAIL assistant context (NO_FOOD)
 */
export function buildGateFailContext(
  request: SearchRequest,
  ctx: Route2Context,
  gateLanguage: string
): AssistantGateContext {
  return {
    type: 'GATE_FAIL',
    reason: 'NO_FOOD',
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, gateLanguage)
  };
}

/**
 * Build CLARIFY assistant context (MISSING_FOOD or MISSING_LOCATION)
 */
export function buildClarifyContext(
  request: SearchRequest,
  ctx: Route2Context,
  reason: 'MISSING_FOOD' | 'MISSING_LOCATION',
  sourceLanguage: string
): AssistantClarifyContext {
  return {
    type: 'CLARIFY',
    reason,
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, sourceLanguage)
  };
}
