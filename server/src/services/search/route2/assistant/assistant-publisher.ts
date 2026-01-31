/**
 * Assistant Publisher Service
 * Publishes assistant messages via WebSocket
 * 
 * LANGUAGE ENFORCEMENT: All assistant messages MUST use ctx.langCtx.assistantLanguage
 */

import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import type { AssistantOutput } from './assistant-llm.service.js';
import { hashSessionId } from '../../../../utils/security.utils.js';
import { assertAssistantLanguage, type LangCtx } from '../language-enforcement.js';

const ASSISTANT_WS_CHANNEL = 'assistant';

/**
 * Simplified payload for direct assistant publishing
 * Used by guards and other locations that need to publish without full AssistantOutput
 */
export interface AssistantPayload {
  type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY' | 'SEARCH_FAILED' | 'GENERIC_QUERY_NARRATION' | 'NUDGE_REFINE';
  message: string;
  question?: string | null;
  blocksSearch?: boolean;
  suggestedAction?: 'NONE' | 'ASK_LOCATION' | 'ASK_FOOD' | 'RETRY' | 'EXPAND_RADIUS' | 'REFINE';
  language?: 'he' | 'en'; // Optional - will be injected from langCtx if missing
}

/**
 * Publish assistant message to WebSocket (UNIFIED FUNCTION)
 * ENFORCES: payload.language === langCtx.assistantLanguage
 * 
 * Accepts either:
 * 1. AssistantOutput (from LLM generation)
 * 2. AssistantPayload (simplified for direct calls)
 */
export function publishAssistantMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  assistant: AssistantOutput | AssistantPayload,
  langCtx: LangCtx | undefined, // REQUIRED: Language context for enforcement
  uiLanguageFallback?: 'he' | 'en' // Fallback if langCtx missing
): void {
  try {
    // DEFENSIVE: Ensure langCtx is present, fallback to uiLanguage or 'en'
    if (!langCtx) {
      const fallbackLanguage = uiLanguageFallback || 'en';
      logger.warn({
        requestId,
        event: 'assistant_publish_missing_langCtx',
        fallbackLanguage
      }, '[ASSISTANT] langCtx missing - using fallback');
      
      langCtx = {
        assistantLanguage: fallbackLanguage,
        assistantLanguageConfidence: 0,
        uiLanguage: fallbackLanguage,
        providerLanguage: fallbackLanguage,
        region: 'IL'
      } as LangCtx;
    }

    // NORMALIZE PAYLOAD: Ensure all required fields present with defaults
    const normalizedPayload = {
      type: assistant.type,
      message: assistant.message || '',
      question: assistant.question ?? null,
      blocksSearch: assistant.blocksSearch ?? false,
      suggestedAction: ('suggestedAction' in assistant) ? assistant.suggestedAction : 'NONE',
      language: assistant.language || langCtx.assistantLanguage
    };

    // LANGUAGE ENFORCEMENT: Assert assistant message uses correct language
    assertAssistantLanguage(
      langCtx,
      normalizedPayload.language,
      requestId,
      `assistant_type:${normalizedPayload.type}`
    );

    // Force language to langCtx.assistantLanguage (defensive - should already match)
    // Cast to 'he' | 'en' for WS protocol (other languages map to 'en')
    const enforcedLanguage = langCtx.assistantLanguage === 'he' ? 'he' : 'en';
    
    // DEBUG LOG: Print payload keys + assistantLanguage before publish
    logger.info({
      requestId,
      channel: 'assistant',
      payloadKeys: Object.keys(normalizedPayload),
      assistantLanguage: enforcedLanguage,
      assistantType: normalizedPayload.type,
      event: 'assistant_publish_debug'
    }, '[ASSISTANT] Publishing message - debug payload');

    // SESSIONHASH FIX: Use shared utility for consistent hashing
    const sessionHash = hashSessionId(sessionId);

    logger.info({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      payloadType: 'assistant',
      assistantLanguage: enforcedLanguage,
      languageConfidence: langCtx.assistantLanguageConfidence,
      event: 'assistant_ws_publish'
    }, '[ASSISTANT] Publishing to WebSocket with enforced language');

    const message = {
      type: 'assistant' as const,
      requestId,
      payload: {
        type: normalizedPayload.type,
        message: normalizedPayload.message,
        question: normalizedPayload.question,
        blocksSearch: normalizedPayload.blocksSearch,
        ...(normalizedPayload.suggestedAction !== 'NONE' && normalizedPayload.suggestedAction === 'REFINE' && { suggestedAction: 'REFINE_QUERY' as const }),
        language: enforcedLanguage // ENFORCED: Always use langCtx.assistantLanguage
      }
    };

    wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, message);

    logger.info({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      payloadType: 'assistant',
      event: 'assistant_published',
      assistantType: normalizedPayload.type,
      blocksSearch: normalizedPayload.blocksSearch,
      suggestedAction: normalizedPayload.suggestedAction,
      enforcedLanguage
    }, '[ASSISTANT] Published to WebSocket');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'assistant_publish_failed',
      error: errorMsg
    }, '[ASSISTANT] Failed to publish');

    // Re-throw language enforcement violations
    if (errorMsg.includes('LANG_ENFORCEMENT_VIOLATION')) {
      throw error;
    }
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
