/**
 * SSE Error Handler
 * Centralizes error handling logic for Assistant SSE flow
 */

import type { Logger } from 'pino';
import type { SseWriter } from './sse-writer.js';

/**
 * Error classification result
 */
interface ErrorClassification {
  code: 'LLM_TIMEOUT' | 'ABORTED' | 'LLM_FAILED' | 'UNAUTHORIZED';
  message: string;
  isTimeout: boolean;
  isAborted: boolean;
}

/**
 * Classify error for appropriate response
 */
function classifyError(error: unknown): ErrorClassification {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const isTimeout = errorMsg.toLowerCase().includes('timeout');
  const isAborted = errorMsg.toLowerCase().includes('abort');

  const code = isTimeout ? 'LLM_TIMEOUT' : (isAborted ? 'ABORTED' : 'LLM_FAILED');
  const message = 'Failed to generate assistant message';

  return { code, message, isTimeout, isAborted };
}

/**
 * Handle SSE flow error
 * 
 * @param error - Error that occurred
 * @param requestId - Request ID for logging
 * @param startTime - Flow start time
 * @param clientDisconnected - Whether client is disconnected
 * @param aborted - Whether request was aborted
 * @param writer - SSE writer
 * @param logger - Logger instance
 */
export function handleSseError(
  error: unknown,
  requestId: string,
  startTime: number,
  clientDisconnected: boolean,
  aborted: boolean,
  writer: SseWriter,
  logger: Logger
): void {
  const durationMs = Date.now() - startTime;
  const classification = classifyError(error);

  // Don't send error if client already disconnected
  if (clientDisconnected || aborted) {
    logger.debug(
      { requestId, durationMs },
      '[AssistantSSE] Client disconnected during error handling'
    );
    writer.end();
    return;
  }

  writer.sendError({
    code: classification.code,
    message: classification.message
  });

  logger.error(
    {
      requestId,
      durationMs,
      errorCode: classification.code,
      error: error instanceof Error ? error.message : String(error),
      event: 'assistant_sse_error'
    },
    '[AssistantSSE] SSE stream failed'
  );

  writer.end();
}
