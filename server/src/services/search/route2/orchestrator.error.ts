/**
 * Orchestrator Error Handler Module
 * Handles pipeline errors and SEARCH_FAILED assistant messages
 * PROD Hardening: Uses standardized error taxonomy
 */

import type { Route2Context } from './types.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { publishSearchFailedAssistant } from './assistant/assistant-integration.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import { classifyPipelineError, PipelineErrorKind } from './pipeline-error-kinds.js';

/**
 * Handle pipeline error
 * Logs error and publishes failure narrator message
 * PROD Hardening: Standardized error classification
 */
export async function handlePipelineError(
  error: unknown,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<never> {
  const { requestId, startTime } = ctx;
  const durationMs = Date.now() - startTime;

  // Extract stage from error or context
  const errorStage = (error && typeof error === 'object' && 'stage' in error)
    ? (error as any).stage
    : 'unknown';

  // PROD Hardening: Classify error using taxonomy
  const { kind, code, message } = classifyPipelineError(error, errorStage);

  logger.error(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_failed',
      durationMs,
      errorKind: kind,
      errorCode: code,
      errorStage,
      errorMessage: message,
      originalError: error instanceof Error ? error.message : 'unknown'
    },
    '[ROUTE2] Pipeline failed'
  );

  // Publish SEARCH_FAILED assistant message (best-effort)
  await publishSearchFailedAssistant(ctx, requestId, wsManager, error, kind);

  throw error;
}

// Re-export for convenience
export { PipelineErrorKind, classifyPipelineError };
