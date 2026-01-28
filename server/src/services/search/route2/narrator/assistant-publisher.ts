/**
 * Assistant Publisher Service
 * 
 * Publishes assistant narrator messages via WebSocket
 */

import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import type { NarratorOutput } from './narrator.types.js';
import { ASSISTANT_WS_CHANNEL } from './constants.js';
import { DEBUG_NARRATOR_ENABLED } from '../../../../config/narrator.flags.js';
import crypto from 'crypto';

/**
 * Type-safe wrapper for WS publishing (any to allow custom message types)
 */
type WSPublishPayload = any;

/**
 * Publish assistant narrator message to WebSocket
 * 
 * @param wsManager - WebSocket manager instance
 * @param requestId - Request ID for routing
 * @param sessionId - Session ID for routing
 * @param narrator - Narrator output to publish
 */
export function publishAssistantMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  narrator: NarratorOutput
): void {
  try {
    // Debug logging (guarded by env var)
    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        {
          requestId,
          sessionIdPresent: !!sessionId,
          narratorType: narrator.type,
          event: 'narrator_publish_attempt'
        },
        '[NARRATOR] Attempting to publish to WS'
      );
    }

    // Hash sessionId for logging
    const sessionHash = sessionId 
      ? crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12)
      : 'none';

    // Structured log before publish (required by spec)
    logger.info(
      {
        channel: ASSISTANT_WS_CHANNEL,
        requestId,
        sessionHash,
        payloadType: 'assistant',
        event: 'assistant_ws_publish_attempt'
      },
      '[NARRATOR] Publishing assistant message to WebSocket'
    );

    // New message structure with flat payload
    const message: WSPublishPayload = {
      type: 'assistant',
      requestId,
      payload: {
        type: narrator.type,
        message: narrator.message,
        question: narrator.question,
        blocksSearch: narrator.blocksSearch
      }
    };

    // Publish to assistant channel (single source of truth constant)
    wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, message);

    logger.info(
      {
        requestId,
        channel: ASSISTANT_WS_CHANNEL,
        payloadType: 'assistant',
        event: 'assistant_message_published',
        narratorType: narrator.type,
        blocksSearch: narrator.blocksSearch,
        suggestedAction: narrator.suggestedAction
      },
      '[NARRATOR] Published assistant message to WebSocket'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        requestId,
        channel: ASSISTANT_WS_CHANNEL,
        payloadType: 'assistant',
        event: 'assistant_message_publish_failed',
        error: errorMsg
      },
      '[NARRATOR] Failed to publish assistant message to WebSocket'
    );
  }
}

/**
 * Helper: Publish GATE_FAIL message
 */
export function publishGateFailMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  narrator: NarratorOutput
): void {
  if (narrator.type !== 'GATE_FAIL') {
    logger.warn(
      { requestId, event: 'publish_type_mismatch', expected: 'GATE_FAIL', actual: narrator.type },
      '[NARRATOR] Type mismatch in publishGateFailMessage'
    );
  }
  publishAssistantMessage(wsManager, requestId, sessionId, narrator);
}

/**
 * Helper: Publish CLARIFY message
 */
export function publishClarifyMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  narrator: NarratorOutput
): void {
  if (narrator.type !== 'CLARIFY') {
    logger.warn(
      { requestId, event: 'publish_type_mismatch', expected: 'CLARIFY', actual: narrator.type },
      '[NARRATOR] Type mismatch in publishClarifyMessage'
    );
  }
  publishAssistantMessage(wsManager, requestId, sessionId, narrator);
}

/**
 * Helper: Publish SUMMARY message
 */
export function publishSummaryMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  narrator: NarratorOutput
): void {
  if (narrator.type !== 'SUMMARY') {
    logger.warn(
      { requestId, event: 'publish_type_mismatch', expected: 'SUMMARY', actual: narrator.type },
      '[NARRATOR] Type mismatch in publishSummaryMessage'
    );
  }
  publishAssistantMessage(wsManager, requestId, sessionId, narrator);
}
