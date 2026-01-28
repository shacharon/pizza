/**
 * Route2 Assistant Integration
 * Handles assistant message generation and publishing
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import { ASSISTANT_MODE_ENABLED } from '../../../../config/narrator.flags.js';
import { generateAssistantMessage, type AssistantContext, type AssistantOutput } from './assistant-llm.service.js';
import { publishAssistantMessage } from './assistant-publisher.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import type { Route2Context } from '../types.js';

/**
 * Generate assistant message and publish to WebSocket
 * Returns message text for HTTP response
 */
export async function generateAndPublishAssistant(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  context: AssistantContext,
  fallbackHttpMessage: string,
  wsManager: WebSocketManager
): Promise<string> {
  logger.info({
    requestId,
    assistantType: context.type,
    sessionIdPresent: !!sessionId,
    event: 'assistant_called'
  }, '[ASSISTANT] Hook invoked');

  if (!ASSISTANT_MODE_ENABLED) {
    logger.debug({
      requestId,
      event: 'assistant_skipped',
      reason: 'ASSISTANT_MODE_ENABLED=false'
    }, '[ASSISTANT] Skipped (feature disabled)');
    return fallbackHttpMessage;
  }

  try {
    const opts: any = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;

    const assistant = await generateAssistantMessage(context, ctx.llmProvider, requestId, opts);

    // Publish to WebSocket (best-effort)
    publishAssistantMessage(wsManager, requestId, sessionId, assistant);

    // Return message for HTTP response
    return assistant.message || fallbackHttpMessage;
  } catch (error) {
    logger.warn({
      requestId,
      event: 'assistant_failed',
      error: error instanceof Error ? error.message : String(error)
    }, '[ASSISTANT] Failed, using fallback');
    return fallbackHttpMessage;
  }
}

/**
 * Publish assistant message on pipeline failure (SEARCH_FAILED)
 */
export async function publishSearchFailedAssistant(
  ctx: Route2Context,
  requestId: string,
  wsManager: WebSocketManager,
  error: unknown,
  errorKind: string | undefined
): Promise<void> {
  if (!ASSISTANT_MODE_ENABLED || !wsManager) {
    return;
  }

  try {
    // Determine reason from error kind
    let reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR' = 'PROVIDER_ERROR';
    if (errorKind?.includes('TIMEOUT') || errorKind?.includes('timeout')) {
      reason = 'GOOGLE_TIMEOUT';
    } else if (errorKind?.includes('NETWORK') || errorKind?.includes('network')) {
      reason = 'NETWORK_ERROR';
    }

    const context: AssistantContext = {
      type: 'SEARCH_FAILED',
      reason,
      query: '', // Pipeline failures may not have query available
      language: 'en' // Default to English
    };

    const opts: any = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;

    const assistant = await generateAssistantMessage(context, ctx.llmProvider, requestId, opts);

    logger.info({
      requestId,
      event: 'search_failed_assistant_generated',
      errorKind,
      reason
    }, '[ASSISTANT] Generated SEARCH_FAILED message');

    publishAssistantMessage(wsManager, requestId, ctx.sessionId, assistant);
  } catch (assistErr) {
    // Swallow errors - don't mask original pipeline error
    logger.warn({
      requestId,
      error: assistErr instanceof Error ? assistErr.message : 'unknown'
    }, '[ASSISTANT] Failed to publish SEARCH_FAILED message');
  }
}
