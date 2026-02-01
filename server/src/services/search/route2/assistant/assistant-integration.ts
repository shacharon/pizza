/**
 * Route2 Assistant Integration
 * Handles assistant message generation and publishing
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import { generateAssistantMessage, type AssistantContext, type AssistantOutput } from './assistant-llm.service.js';
import { publishAssistantMessage, publishAssistantError } from './assistant-publisher.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import type { Route2Context } from '../types.js';

/**
 * Generate assistant message and publish to WebSocket
 * Returns message text for HTTP response, or null if failed
 * On failure: publishes assistant_error event (no deterministic fallback)
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

  try {
    const opts: any = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;

    const assistant = await generateAssistantMessage(context, ctx.llmProvider, requestId, opts);

    // Note: Invariants (blocksSearch, suggestedAction) are now enforced in generateAssistantMessage()
    // No need for duplicate enforcement here

    // Publish to WebSocket (best-effort)
    publishAssistantMessage(wsManager, requestId, sessionId, assistant, ctx.langCtx, ctx.uiLanguage);

    // Return message for HTTP response
    return assistant.message || fallbackHttpMessage;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');
    const isSchemaError = errorMsg.toLowerCase().includes('schema') || errorMsg.toLowerCase().includes('validation');

    const errorCode = isTimeout ? 'LLM_TIMEOUT' : (isSchemaError ? 'SCHEMA_INVALID' : 'LLM_FAILED');

    logger.warn({
      requestId,
      event: 'assistant_failed',
      errorCode,
      error: errorMsg
    }, '[ASSISTANT] Failed - publishing error event');

    // Publish assistant_error event (no user-facing message in code)
    publishAssistantError(wsManager, requestId, sessionId, errorCode);

    // Return fallback for HTTP only (WS clients get error event)
    return fallbackHttpMessage;
  }
}

/**
 * Generate and publish assistant SUMMARY message asynchronously (deferred)
 * 
 * Non-blocking: Returns immediately, assistant generation happens in background
 * Publishes to WebSocket when ready, or logs error if failed
 * 
 * Use this for SUMMARY messages to avoid blocking pipeline completion
 * 
 * CRITICAL: Captures langCtx snapshot to ensure language context is preserved
 * through async execution (fixes missing langCtx bug in deferred flow)
 */
export function generateAndPublishAssistantDeferred(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  context: AssistantContext,
  wsManager: WebSocketManager
): void {
  // CRITICAL FIX: Capture langCtx and uiLanguage NOW (before async closure)
  // This ensures language context is preserved even if ctx mutates later
  const langCtxSnapshot = ctx.langCtx;
  const uiLanguageSnapshot = ctx.uiLanguage;
  const traceId = ctx.traceId;
  const sessionIdFromCtx = ctx.sessionId;
  const llmProvider = ctx.llmProvider;

  // Fire and forget - don't await
  (async () => {
    const startTime = Date.now();
    
    logger.info({
      requestId,
      assistantType: context.type,
      sessionIdPresent: !!sessionId,
      langCtxPresent: !!langCtxSnapshot,
      event: 'assistant_deferred_start'
    }, '[ASSISTANT] Deferred generation started (non-blocking)');

    try {
      const opts: any = {};
      if (traceId) opts.traceId = traceId;
      if (sessionIdFromCtx) opts.sessionId = sessionIdFromCtx;

      const assistant = await generateAssistantMessage(context, llmProvider, requestId, opts);

      const durationMs = Date.now() - startTime;
      logger.info({
        requestId,
        assistantType: context.type,
        durationMs,
        event: 'assistant_deferred_done'
      }, '[ASSISTANT] Deferred generation completed');

      // Publish to WebSocket with captured langCtx snapshot
      publishAssistantMessage(wsManager, requestId, sessionId, assistant, langCtxSnapshot, uiLanguageSnapshot);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');
      const isSchemaError = errorMsg.toLowerCase().includes('schema') || errorMsg.toLowerCase().includes('validation');
      
      const errorCode = isTimeout ? 'LLM_TIMEOUT' : (isSchemaError ? 'SCHEMA_INVALID' : 'LLM_FAILED');
      
      logger.warn({
        requestId,
        event: 'assistant_deferred_error',
        errorCode,
        error: errorMsg,
        durationMs
      }, '[ASSISTANT] Deferred generation failed - publishing error event');
      
      // Publish assistant_error event (no user-facing message)
      publishAssistantError(wsManager, requestId, sessionId, errorCode);
    }
  })().catch(err => {
    // Safety net for unhandled promise rejections
    logger.error({
      requestId,
      event: 'assistant_deferred_unhandled_error',
      error: err instanceof Error ? err.message : String(err)
    }, '[ASSISTANT] Unhandled error in deferred generation');
  });
}

/**
 * Publish assistant message on pipeline failure (SEARCH_FAILED)
 * 
 * Triggers LLM-generated assistant message for provider timeouts and pipeline failures
 * NO deterministic fallback - LLM-only UX
 * 
 * @param ctx Pipeline context (contains query, language, sharedFilters)
 * @param requestId Request ID
 * @param wsManager WebSocket manager
 * @param error Original error
 * @param errorKind Classified error kind (e.g., GOOGLE_TIMEOUT, NETWORK_ERROR)
 */
export async function publishSearchFailedAssistant(
  ctx: Route2Context,
  requestId: string,
  wsManager: WebSocketManager,
  error: unknown,
  errorKind: string | undefined
): Promise<void> {
  if (!wsManager) {
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

    // Extract query from context (best-effort)
    const query = ctx.query || '';

    // Resolve language with LLM-based detection
    const resolvedLanguage = await import('../orchestrator.helpers.js')
      .then(m => m.resolveAssistantLanguage(ctx, undefined, undefined, undefined));

    const context: AssistantContext = {
      type: 'SEARCH_FAILED',
      reason,
      query,
      language: resolvedLanguage
    };

    logger.info({
      requestId,
      event: 'assistant_search_failed_hook',
      errorKind,
      reason,
      language: resolvedLanguage,
      hasQuery: query.length > 0
    }, '[ASSISTANT] Calling LLM for SEARCH_FAILED');

    const opts: any = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;

    const assistant = await generateAssistantMessage(context, ctx.llmProvider, requestId, opts);

    logger.info({
      requestId,
      event: 'search_failed_assistant_generated',
      errorKind,
      reason,
      language: resolvedLanguage
    }, '[ASSISTANT] Generated SEARCH_FAILED message via LLM');

    publishAssistantMessage(wsManager, requestId, ctx.sessionId, assistant, ctx.langCtx, ctx.uiLanguage);
  } catch (assistErr) {
    // If LLM fails, publish assistant_error event (no deterministic fallback)
    const errorMsg = assistErr instanceof Error ? assistErr.message : String(assistErr);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');
    const errorCode = isTimeout ? 'LLM_TIMEOUT' : 'LLM_FAILED';

    logger.warn({
      requestId,
      event: 'search_failed_assistant_error',
      errorCode,
      error: errorMsg
    }, '[ASSISTANT] Failed to generate SEARCH_FAILED message - publishing error event');

    publishAssistantError(wsManager, requestId, ctx.sessionId, errorCode);
  }
}
