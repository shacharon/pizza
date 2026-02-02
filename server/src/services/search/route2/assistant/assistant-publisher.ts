/**
 * Assistant Publisher Service
 * Publishes assistant messages via WebSocket
 */

import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import type { AssistantOutput } from './assistant-llm.service.js';
import { hashSessionId } from '../../../../infra/websocket/websocket.types.js';

const ASSISTANT_WS_CHANNEL = 'assistant';

// Debug flag for assistant language logging
const ASSISTANT_LANG_DEBUG = process.env.ASSISTANT_LANG_DEBUG === '1';

/**
 * Detect message language based on script (simple heuristic)
 */
function detectMessageLanguage(text: string): string {
  if (!text) return 'unknown';
  const hebrew = /[\u0590-\u05FF]/.test(text);
  const arabic = /[\u0600-\u06FF]/.test(text);
  const cyrillic = /[\u0400-\u04FF]/.test(text);
  if (hebrew) return 'he';
  if (arabic) return 'ar';
  if (cyrillic) return 'ru';
  return 'en-or-other';
}

/**
 * Get message preview (first N chars)
 */
function getMessagePreview(text: string, maxChars: number = 80): string {
  if (!text) return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
}

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
    // SESSIONHASH FIX: Use shared utility for consistent hashing
    const sessionHash = hashSessionId(sessionId);

    logger.info({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      payloadType: 'assistant',
      event: 'assistant_ws_publish'
    }, '[ASSISTANT] Publishing to WebSocket');

    const message = {
      type: 'assistant' as const,
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

    // Debug log for WS publish (behind env flag)
    if (ASSISTANT_LANG_DEBUG) {
      logger.info({
        requestId,
        event: 'assistant_ws_publish_debug',
        messagePreview: getMessagePreview(assistant.message),
        messageDetectedLang: detectMessageLanguage(assistant.message),
        type: assistant.type
      }, '[ASSISTANT_DEBUG] Message published to WebSocket');
    }
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

/**
 * Publish assistant error event to WebSocket
 * NO user-facing message - just error code
 */
export function publishAssistantError(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  errorCode: 'LLM_TIMEOUT' | 'LLM_FAILED' | 'SCHEMA_INVALID'
): void {
  try {
    // SESSIONHASH FIX: Use shared utility for consistent hashing
    const sessionHash = hashSessionId(sessionId);

    logger.warn({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      errorCode,
      event: 'assistant_error_publish'
    }, '[ASSISTANT] Publishing error event');

    const message = {
      type: 'assistant_error' as const,
      requestId,
      payload: {
        errorCode
      }
    };

    wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, message);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'assistant_error_publish_failed',
      error: errorMsg
    }, '[ASSISTANT] Failed to publish error event');
  }
}
