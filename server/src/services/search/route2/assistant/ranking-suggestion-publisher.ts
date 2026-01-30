/**
 * Ranking Suggestion Publisher
 * 
 * Publishes ranking suggestions via WebSocket (non-blocking).
 * Only fires when triggers are active or user requests "load more".
 */

import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import type { LLMProvider } from '../../../../llm/types.js';
import type { RankingSignals } from '../ranking/ranking-signals.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { hashSessionId } from '../../../../utils/security.utils.js';
import {
  generateRankingSuggestion,
  shouldShowRankingSuggestion,
  type RankingSuggestion
} from './ranking-suggestion.service.js';

const ASSISTANT_WS_CHANNEL = 'assistant';

/**
 * Publish ranking suggestion to WebSocket (deferred, non-blocking)
 * 
 * Called after response is sent. Fires asynchronously, doesn't block HTTP response.
 * Only generates suggestion if triggers are active.
 */
export function publishRankingSuggestionDeferred(
  uiLanguage: 'he' | 'en',
  query: string,
  rankingSignals: RankingSignals,
  llmProvider: LLMProvider,
  requestId: string,
  sessionId: string | undefined,
  wsManager: WebSocketManager
): void {
  // Check if we should show suggestion
  if (!shouldShowRankingSuggestion(rankingSignals)) {
    logger.info({
      requestId,
      event: 'ranking_suggestion_skipped',
      reason: 'no_triggers_active'
    }, '[RANKING_SUGGESTION] Skipping (no active triggers)');
    return;
  }

  // Fire asynchronously (don't await, don't block)
  generateAndPublishRankingSuggestion(
    uiLanguage,
    query,
    rankingSignals,
    llmProvider,
    requestId,
    sessionId,
    wsManager
  ).catch(error => {
    // Already logged in generateRankingSuggestion, just prevent unhandled rejection
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({
      requestId,
      event: 'ranking_suggestion_deferred_error',
      error: msg
    }, '[RANKING_SUGGESTION] Deferred call failed');
  });
}

/**
 * Generate and publish ranking suggestion (async)
 * Internal helper - called by deferred publisher
 */
async function generateAndPublishRankingSuggestion(
  uiLanguage: 'he' | 'en',
  query: string,
  rankingSignals: RankingSignals,
  llmProvider: LLMProvider,
  requestId: string,
  sessionId: string | undefined,
  wsManager: WebSocketManager
): Promise<void> {
  try {
    // Generate suggestion via LLM
    const suggestion = await generateRankingSuggestion(
      uiLanguage,
      query,
      rankingSignals,
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'ranking_suggestion_generate_failed',
      error: msg
    }, '[RANKING_SUGGESTION] Failed to generate/publish suggestion');

    // Don't publish error - this is a non-critical enhancement
  }
}

/**
 * Publish ranking suggestion message to WebSocket
 */
function publishRankingSuggestionMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  suggestion: RankingSuggestion
): void {
  try {
    const sessionHash = hashSessionId(sessionId);

    logger.info({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      payloadType: 'ranking_suggestion',
      event: 'ranking_suggestion_ws_publish'
    }, '[RANKING_SUGGESTION] Publishing to WebSocket');

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
    }, '[RANKING_SUGGESTION] Published to WebSocket');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'ranking_suggestion_publish_failed',
      error: errorMsg
    }, '[RANKING_SUGGESTION] Failed to publish');
  }
}
