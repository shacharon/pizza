/**
 * Assistant Publisher Service
 * Publishes assistant messages via WebSocket
 * 
 * LANGUAGE ENFORCEMENT: All assistant messages MUST include assistantLanguage
 * Single source of truth for assistant WS publishing
 */

import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import type { AssistantOutput } from './assistant-llm.service.js';
import { hashSessionId } from '../../../../utils/security.utils.js';
import type { LangCtx } from '../language-enforcement.js';

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
  language?: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';
}

/**
 * Resolve assistantLanguage from context hierarchy (UNIFIED FUNCTION)
 * Priority: langCtx.assistantLanguage > payload.language > uiLanguageFallback > 'en'
 * LOGS WARNING if assistantLanguage is missing from expected source
 */
function resolveAssistantLanguage(
  requestId: string,
  langCtx: LangCtx | undefined,
  payload: AssistantOutput | AssistantPayload,
  uiLanguageFallback?: 'he' | 'en',
  stage?: string
): 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' {
  // Priority 1: langCtx.assistantLanguage (authoritative)
  if (langCtx?.assistantLanguage) {
    // Guard: Filter out 'other' - fallback to 'en' if invalid
    const validLanguages: Array<'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'> = ['he', 'en', 'ar', 'ru', 'fr', 'es'];
    if (validLanguages.includes(langCtx.assistantLanguage as any)) {
      return langCtx.assistantLanguage as 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';
    }
    // Invalid language code (e.g., 'other') - log and fallback
    logger.warn({
      requestId,
      event: 'assistant_language_invalid',
      invalidLanguage: langCtx.assistantLanguage,
      fallbackLanguage: 'en',
      stage: stage || 'unknown'
    }, '[ASSISTANT] Invalid assistantLanguage in langCtx, falling back to en');
  }

  // Priority 2: payload.language (legacy path)
  if (payload.language) {
    logger.warn({
      requestId,
      event: 'assistant_language_from_payload',
      stage: stage || 'unknown',
      payloadLanguage: payload.language,
      reason: 'langCtx_missing'
    }, '[ASSISTANT] Using payload.language (langCtx missing)');
    return payload.language;
  }

  // Priority 3: uiLanguageFallback (request context)
  if (uiLanguageFallback) {
    logger.warn({
      requestId,
      event: 'assistant_language_from_ui_fallback',
      stage: stage || 'unknown',
      fallbackLanguage: uiLanguageFallback,
      reason: 'langCtx_and_payload_missing'
    }, '[ASSISTANT] Using uiLanguageFallback (langCtx and payload.language missing)');
    return uiLanguageFallback;
  }

  // Priority 4: Hard fallback to 'en'
  logger.warn({
    requestId,
    event: 'assistant_language_hard_fallback',
    stage: stage || 'unknown',
    fallbackLanguage: 'en',
    reason: 'all_sources_missing'
  }, '[ASSISTANT] WARN - assistantLanguage missing at publish time, using hard fallback to en');

  return 'en';
}

/**
 * Publish assistant message to WebSocket (UNIFIED FUNCTION)
 * ENFORCES: assistantLanguage field is present on all messages
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
  langCtx: LangCtx | undefined,
  uiLanguageFallback?: 'he' | 'en'
): void {
  try {
    // Resolve assistantLanguage from context hierarchy
    const assistantLanguage = resolveAssistantLanguage(
      requestId,
      langCtx,
      assistant,
      uiLanguageFallback,
      `assistant_type:${assistant.type}`
    );

    // NORMALIZE PAYLOAD: Ensure all required fields present with defaults
    const normalizedPayload = {
      type: assistant.type,
      message: assistant.message || '',
      question: assistant.question ?? null,
      blocksSearch: assistant.blocksSearch ?? false,
      suggestedAction: ('suggestedAction' in assistant) ? assistant.suggestedAction : 'NONE'
    };

    // SESSIONHASH: Use shared utility for consistent hashing
    const sessionHash = hashSessionId(sessionId);

    // UILANGUAGE FIX: Resolve uiLanguage from context (for debugging + backward compat)
    // Filter out 'other' - fallback to 'en' if invalid for WS protocol
    const rawUiLanguage = langCtx?.uiLanguage ?? uiLanguageFallback ?? 'en';
    const uiLanguage: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' = 
      rawUiLanguage === 'other' ? 'en' : (rawUiLanguage as 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es');

    logger.info({
      channel: ASSISTANT_WS_CHANNEL,
      requestId,
      sessionHash,
      payloadType: 'assistant',
      assistantLanguage,
      uiLanguage,
      assistantType: normalizedPayload.type,
      event: 'assistant_ws_publish'
    }, '[ASSISTANT] Publishing to WebSocket with assistantLanguage');

    const message = {
      type: 'assistant' as const,
      requestId,
      assistantLanguage,
      uiLanguage, // Include uiLanguage for debugging + backward compat
      payload: {
        type: normalizedPayload.type,
        message: normalizedPayload.message,
        question: normalizedPayload.question,
        blocksSearch: normalizedPayload.blocksSearch,
        language: assistantLanguage, // LANGUAGE CONTRACT: Always set payload.language = assistantLanguage
        ...(normalizedPayload.suggestedAction === 'REFINE' && { suggestedAction: 'REFINE_QUERY' as const })
      }
    };

    wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, message);

    logger.info({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'assistant_published',
      assistantLanguage,
      assistantType: normalizedPayload.type,
      blocksSearch: normalizedPayload.blocksSearch
    }, '[ASSISTANT] Published to WebSocket');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      channel: ASSISTANT_WS_CHANNEL,
      event: 'assistant_publish_failed',
      error: errorMsg
    }, '[ASSISTANT] Failed to publish');

    throw error;
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
