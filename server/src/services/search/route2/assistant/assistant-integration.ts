/**
 * Route2 Assistant Integration
 * Handles assistant message generation and publishing
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import { withTimeout, isTimeoutError } from '../../../../lib/reliability/timeout-guard.js';
import { generateAssistantMessage, generateMessageOnlyText, type AssistantContext, type AssistantOutput } from './assistant-llm.service.js';
import { publishAssistantMessage, publishAssistantError } from './assistant-publisher.js';
import { getShortSummaryFallback } from './fallback-messages.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import type { Route2Context } from '../types.js';
import { shouldAbort } from '../types.js';
import { route2Config } from '../route2.config.js';

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
  // SSE GUARD: Skip WS assistant if SSE endpoint is enabled
  const sseAssistantEnabled = process.env.FEATURE_SSE_ASSISTANT === 'true';
  
  if (sseAssistantEnabled) {
    logger.info({
      requestId,
      assistantType: context.type,
      event: 'assistant_ws_skipped_due_to_sse',
      reason: 'sse_enabled'
    }, '[ASSISTANT] Skipping WS assistant (SSE endpoint is source of truth)');
    
    // Return fallback for HTTP response only
    return fallbackHttpMessage;
  }

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

    if (!shouldAbort(ctx)) {
      publishAssistantMessage(wsManager, requestId, sessionId, assistant, context.language);
    }
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

    if (!shouldAbort(ctx)) {
      publishAssistantError(wsManager, requestId, sessionId, errorCode);
    }

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
 */
export function generateAndPublishAssistantDeferred(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  context: AssistantContext,
  wsManager: WebSocketManager
): void {
  // SSE GUARD: Skip WS assistant if SSE endpoint is enabled
  const sseAssistantEnabled = process.env.FEATURE_SSE_ASSISTANT === 'true';
  
  if (sseAssistantEnabled) {
    logger.info({
      requestId,
      assistantType: context.type,
      event: 'assistant_ws_skipped_due_to_sse',
      reason: 'sse_enabled'
    }, '[ASSISTANT] Skipping deferred WS assistant (SSE endpoint is source of truth)');
    return;
  }

  // Fire and forget - don't await
  (async () => {
    if (shouldAbort(ctx)) return;
    const startTime = Date.now();

    logger.info({
      requestId,
      assistantType: context.type,
      sessionIdPresent: !!sessionId,
      event: 'assistant_deferred_start'
    }, '[ASSISTANT] Deferred generation started (non-blocking)');

    try {
      const opts: any = {};
      if (ctx.traceId) opts.traceId = ctx.traceId;
      if (ctx.sessionId) opts.sessionId = ctx.sessionId;

      const assistant = await generateAssistantMessage(context, ctx.llmProvider, requestId, opts);

      const durationMs = Date.now() - startTime;
      logger.info({
        requestId,
        assistantType: context.type,
        durationMs,
        event: 'assistant_deferred_done'
      }, '[ASSISTANT] Deferred generation completed');

      if (!shouldAbort(ctx)) {
        publishAssistantMessage(wsManager, requestId, sessionId, assistant, context.language);
      }
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

      if (!shouldAbort(ctx)) {
        publishAssistantError(wsManager, requestId, sessionId, errorCode);
      }
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
 * Generate final user message via MESSAGE_ONLY LLM (e.g. SATURATED) and publish.
 * Per-call timeout: MESSAGE_ONLY_TIMEOUT_MS. On timeout: fallback to short default in requestedLanguage.
 * Logs message_started, message_done with llm_latency_ms, llm_timeout, stage.
 */
export async function generateAndPublishMessageOnly(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  context: AssistantContext,
  wsManager: WebSocketManager
): Promise<{ durationMs: number }> {
  const startTime = Date.now();
  const stage = 'message_only';
  logger.info(
    { requestId, pipelineVersion: 'route2', event: 'message_started' },
    '[ROUTE2] MESSAGE_ONLY LLM started'
  );

  try {
    const opts: any = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;
    const text = await withTimeout(
      generateMessageOnlyText(context, ctx.llmProvider, requestId, opts),
      route2Config.MESSAGE_ONLY_TIMEOUT_MS,
      stage
    );
    const durationMs = Date.now() - startTime;
    logger.info(
      { requestId, pipelineVersion: 'route2', event: 'message_done', durationMs, llm_latency_ms: durationMs, llm_timeout: false, stage },
      '[ROUTE2] MESSAGE_ONLY LLM done'
    );
    const assistant: AssistantOutput = {
      type: context.type,
      message: text || '',
      question: null,
      suggestedAction: 'NONE',
      blocksSearch: false
    };
    if (!shouldAbort(ctx)) {
      publishAssistantMessage(wsManager, requestId, sessionId, assistant, context.language);
    }
    return { durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const timedOut = isTimeoutError(error);
    if (!shouldAbort(ctx)) {
      if (timedOut) {
        const fallbackMessage = getShortSummaryFallback(context.language);
        const assistant: AssistantOutput = {
          type: context.type,
          message: fallbackMessage,
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        };
        publishAssistantMessage(wsManager, requestId, sessionId, assistant, context.language);
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorCode = errorMsg.toLowerCase().includes('abort') ? 'LLM_TIMEOUT' : 'LLM_FAILED';
        publishAssistantError(wsManager, requestId, sessionId, errorCode);
      }
    }
    logger.info(
      { requestId, pipelineVersion: 'route2', event: 'message_done', durationMs, llm_latency_ms: durationMs, llm_timeout: timedOut, stage },
      '[ROUTE2] MESSAGE_ONLY LLM settled (failed or timeout)'
    );
    return { durationMs };
  }
}

/**
 * Generate and publish assistant message; returns a Promise for logging/await.
 * Same semantics as deferred path but caller can attach .then() for summary_done etc.
 */
export async function generateAndPublishAssistantPromise(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  context: AssistantContext,
  wsManager: WebSocketManager
): Promise<void> {
  const sseAssistantEnabled = process.env.FEATURE_SSE_ASSISTANT === 'true';
  if (sseAssistantEnabled) {
    logger.info({
      requestId,
      assistantType: context.type,
      event: 'assistant_ws_skipped_due_to_sse',
      reason: 'sse_enabled'
    }, '[ASSISTANT] Skipping WS assistant (SSE endpoint is source of truth)');
    return;
  }

  const opts: any = {};
  if (ctx.traceId) opts.traceId = ctx.traceId;
  if (ctx.sessionId) opts.sessionId = ctx.sessionId;

  try {
    const assistant = await generateAssistantMessage(context, ctx.llmProvider, requestId, opts);
    if (!shouldAbort(ctx)) {
      publishAssistantMessage(wsManager, requestId, sessionId, assistant, context.language);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');
    const isSchemaError = errorMsg.toLowerCase().includes('schema') || errorMsg.toLowerCase().includes('validation');
    const errorCode = isTimeout ? 'LLM_TIMEOUT' : (isSchemaError ? 'SCHEMA_INVALID' : 'LLM_FAILED');
    if (!shouldAbort(ctx)) {
      publishAssistantError(wsManager, requestId, sessionId, errorCode);
    }
    throw error;
  }
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
  if (!wsManager || shouldAbort(ctx)) {
    return;
  }

  // SSE GUARD: Skip WS assistant if SSE endpoint is enabled
  const sseAssistantEnabled = process.env.FEATURE_SSE_ASSISTANT === 'true';
  
  if (sseAssistantEnabled) {
    logger.info({
      requestId,
      event: 'assistant_ws_skipped_due_to_sse',
      reason: 'sse_enabled',
      type: 'SEARCH_FAILED'
    }, '[ASSISTANT] Skipping WS SEARCH_FAILED assistant (SSE endpoint is source of truth)');
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

    // Resolve language with deterministic fallback chain
    const resolvedLanguage = await import('../orchestrator.helpers.js')
      .then(m => m.resolveAssistantLanguage(ctx, undefined, undefined));

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

    if (!shouldAbort(ctx)) {
      publishAssistantMessage(wsManager, requestId, ctx.sessionId, assistant, resolvedLanguage);
    }
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

    if (!shouldAbort(ctx)) {
      publishAssistantError(wsManager, requestId, ctx.sessionId, errorCode);
    }
  }
}
