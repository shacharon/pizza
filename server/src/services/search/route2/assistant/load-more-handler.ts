/**
 * Load More Handler
 * 
 * Handles "load_more" WebSocket events and triggers ranking suggestions.
 * Retrieves cached ranking signals and publishes suggestions if triggers active.
 */

import type { LLMProvider } from '../../../../llm/types.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { rankingSignalsCache } from '../ranking/ranking-signals-cache.redis.js';
import {
  generateRankingSuggestion,
  shouldShowRankingSuggestion
} from './ranking-suggestion.service.js';
import { hashSessionId } from '../../../../utils/security.utils.js';

const ASSISTANT_WS_CHANNEL = 'assistant';

/**
 * Handle "load_more" event from frontend
 * 
 * Flow:
 * 1. Frontend clicks "load more"
 * 2. Frontend appends next 5 results from local pool
 * 3. Frontend sends WS event "load_more"
 * 4. Backend retrieves cached ranking signals
 * 5. If triggers active, publish ranking suggestion to WS
 * 6. Frontend displays assistant panel message
 */
export async function handleLoadMoreEvent(
  requestId: string,
  sessionId: string | undefined,
  newOffset: number,
  totalShown: number,
  llmProvider: LLMProvider,
  wsManager: WebSocketManager,
  userId?: string
): Promise<void> {
  const startTime = Date.now();

  try {
    // Retrieve cached ranking signals with IDOR verification
    const cached = await rankingSignalsCache.get(requestId, sessionId, userId);

    if (!cached) {
      logger.warn({
        requestId,
        event: 'load_more_no_cache',
        reason: 'ranking_signals_not_found_or_idor_violation'
      }, '[LOAD_MORE] No cached ranking signals found (expired, missing, or IDOR violation)');
      return;
    }

    const { signals, query, uiLanguage } = cached;

    // Check if we should show ranking suggestion
    if (!shouldShowRankingSuggestion(signals)) {
      logger.info({
        requestId,
        event: 'load_more_skip_suggestion',
        reason: 'no_triggers_active',
        newOffset,
        totalShown
      }, '[LOAD_MORE] Skipping suggestion (no triggers active)');
      return;
    }

    logger.info({
      requestId,
      event: 'load_more_generating_suggestion',
      newOffset,
      totalShown,
      profile: signals.profile,
      triggers: signals.triggers
    }, '[LOAD_MORE] Generating ranking suggestion');

    // Generate suggestion via LLM
    const suggestion = await generateRankingSuggestion(
      uiLanguage,
      query,
      signals,
      llmProvider,
      requestId
    );

    // Publish to WebSocket
    publishRankingSuggestionMessage(
      wsManager,
      requestId,
      sessionId,
      suggestion
    );

    logger.info({
      requestId,
      event: 'load_more_suggestion_published',
      suggestedAction: suggestion.suggestedAction,
      durationMs: Date.now() - startTime
    }, '[LOAD_MORE] Published ranking suggestion');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'load_more_handler_failed',
      error: msg,
      durationMs: Date.now() - startTime
    }, '[LOAD_MORE] Failed to handle load more event');
  }
}

/**
 * Publish ranking suggestion message to WebSocket
 */
function publishRankingSuggestionMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  suggestion: {
    message: string;
    suggestion: string | null;
    suggestedAction: 'REFINE_LOCATION' | 'ADD_MIN_RATING' | 'REMOVE_OPEN_NOW' | 'REMOVE_PRICE' | 'NONE';
  }
): void {
  try {
    const sessionHash = hashSessionId(sessionId);

    logger.info({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      payloadType: 'ranking_suggestion',
      event: 'ranking_suggestion_ws_publish'
    }, '[LOAD_MORE] Publishing to WebSocket');

    const message = {
      type: 'ranking_suggestion' as const,
      requestId,
      payload: {
        message: suggestion.message,
        suggestion: suggestion.suggestion,
        suggestedAction: suggestion.suggestedAction
      }
    };

    wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, message);

    logger.info({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      payloadType: 'ranking_suggestion',
      event: 'ranking_suggestion_published',
      suggestedAction: suggestion.suggestedAction,
      hasSuggestion: !!suggestion.suggestion
    }, '[LOAD_MORE] Published to WebSocket');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'ranking_suggestion_publish_failed',
      error: errorMsg
    }, '[LOAD_MORE] Failed to publish');
  }
}
