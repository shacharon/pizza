/**
 * Search channel terminal WS publish
 * Ensures exactly one terminal payload per requestId on the search channel.
 * Never skipped when SSE is enabled (search channel is still used).
 */

import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/** Terminal CLARIFY payload for search channel */
export interface TerminalClarifyPayload {
  type: 'CLARIFY';
  reason: string;
  message: string;
  question: string | null;
  suggestedAction: string | null;
}

/** Terminal SEARCH_FAILED payload for search channel */
export interface TerminalFailedPayload {
  type: 'SEARCH_FAILED';
  code: string;
  message: string;
  stage: string;
}

function publishAndLog(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  type: 'SUCCESS' | 'CLARIFY' | 'GATE_STOP' | 'SEARCH_FAILED',
  payload: Record<string, unknown>
): void {
  try {
    wsManager.publishToChannel('search', requestId, sessionId, payload);
    logger.info(
      { event: 'ws_terminal_published', type, requestId },
      '[ROUTE2] Search channel terminal published'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { requestId, type, event: 'ws_terminal_publish_failed', error: msg },
      '[ROUTE2] Failed to publish terminal to search channel'
    );
  }
}

/**
 * Publish terminal CLARIFY to search channel (only for actual clarify, not gate stop).
 */
export function publishTerminalClarify(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  assist: { type: string; message: string; question?: string | null; suggestedAction?: string | null; reason?: string }
): void {
  const payload: TerminalClarifyPayload = {
    type: 'CLARIFY',
    reason: (assist as { reason?: string }).reason ?? 'CLARIFY',
    message: assist.message,
    question: assist.question ?? null,
    suggestedAction: assist.suggestedAction ?? null
  };
  publishAndLog(wsManager, requestId, sessionId, 'CLARIFY', payload);
}

/**
 * Publish terminal GATE_STOP to search channel (not food / guide response).
 */
export function publishTerminalGateStop(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  assist: { message: string }
): void {
  const payload = {
    type: 'GATE_STOP' as const,
    message: assist.message
  };
  publishAndLog(wsManager, requestId, sessionId, 'GATE_STOP', payload);
}

/**
 * Publish terminal SEARCH_FAILED to search channel (always, even when SSE enabled).
 * Call from handlePipelineError so WS gets exactly one terminal payload.
 */
export function publishTerminalFailed(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  payload: { code: string; message: string; stage: string }
): void {
  const terminal: TerminalFailedPayload = {
    type: 'SEARCH_FAILED',
    code: payload.code,
    message: payload.message,
    stage: payload.stage
  };
  publishAndLog(wsManager, requestId, sessionId, 'SEARCH_FAILED', terminal);
}
