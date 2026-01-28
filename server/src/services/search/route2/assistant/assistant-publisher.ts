/**
 * Assistant Publisher Service
 * Publishes assistant messages via WebSocket
 */

import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import type { AssistantOutput } from './assistant-llm.service.js';
import crypto from 'crypto';

const ASSISTANT_WS_CHANNEL = 'assistant';

/**
 * Publish assistant message to WebSocket
 */
export function publishAssistantMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  assistant: AssistantOutput
): void {
  try {
    const sessionHash = sessionId
      ? crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12)
      : 'none';

    logger.info({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      payloadType: 'assistant',
      event: 'assistant_ws_publish'
    }, '[ASSISTANT] Publishing to WebSocket');

    const message = {
      type: 'assistant',
      requestId,
      payload: {
        type: assistant.type,
        message: assistant.message,
        question: assistant.question,
        blocksSearch: assistant.blocksSearch
      }
    };

    wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, message);

    logger.info({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      payloadType: 'assistant',
      event: 'assistant_published',
      assistantType: assistant.type,
      blocksSearch: assistant.blocksSearch,
      suggestedAction: assistant.suggestedAction
    }, '[ASSISTANT] Published to WebSocket');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'assistant_publish_failed',
      error: errorMsg
    }, '[ASSISTANT] Failed to publish');
  }
}
