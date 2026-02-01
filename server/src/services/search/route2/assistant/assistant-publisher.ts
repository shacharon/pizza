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
import { assertAssistantLanguage, verifyAssistantLanguageGraceful, type LangCtx } from '../language-enforcement.js';

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
  language?: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'; // Optional - will be injected from langCtx if missing
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
    // DEFENSIVE: Ensure langCtx is present, fallback to uiLanguage (NOT hardcoded 'en')
    if (!langCtx) {
      const hinted = (assistant as any)?.language;
      const fallbackLanguage = (hinted === 'he' || hinted === 'en')
        ? hinted
        : (uiLanguageFallback || 'en');

      logger.warn({
        requestId,
        event: 'assistant_publish_missing_langCtx',
        stage: 'publish',
        whereMissing: 'publishAssistantMessage',
        fallbackLanguage,
        uiLanguageFallback
      }, '[ASSISTANT] langCtx missing - using fallback from request context');

      langCtx = {
        assistantLanguage: fallbackLanguage,
        assistantLanguageConfidence: 0,
        uiLanguage: fallbackLanguage,
        providerLanguage: fallbackLanguage,
        region: 'IL'
      } as LangCtx;
    } else {
      // SUCCESS: langCtx is present
      logger.info({
        requestId,
        event: 'assistant_publish_langCtx_present',
        source: 'captured_snapshot',
        uiLanguage: langCtx.uiLanguage,
        assistantLanguage: langCtx.assistantLanguage,
        queryLanguage: (langCtx as any).queryLanguage || langCtx.assistantLanguage
      }, '[ASSISTANT] Publishing with valid langCtx');
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

    // LANGUAGE ENFORCEMENT WITH GRACEFUL DEGRADATION
    const verification = verifyAssistantLanguageGraceful(
      langCtx,
      normalizedPayload.language,
      requestId,
      `assistant_type:${normalizedPayload.type}`,
      {
        ...(uiLanguageFallback && { uiLanguage: uiLanguageFallback }),
        ...(langCtx?.assistantLanguage && { queryLanguage: langCtx.assistantLanguage })
        // storedLanguageContext could be passed from job metadata if available
      }
    );

    // Log verification result
    if (verification.warning) {
      logger.warn({
        requestId,
        event: 'assistant_language_graceful_degradation',
        expected: verification.expectedLanguage,
        actual: verification.actualLanguage,
        source: verification.source,
        wasEnforced: verification.wasEnforced,
        warning: verification.warning
      }, '[ASSISTANT] Publishing with graceful language degradation');
    }

    // Determine final language for WS payload
    // Use langCtx.assistantLanguage as-is (no mapping)
    const enforcedLanguage = langCtx.assistantLanguage as 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';

    // DEBUG LOG: Print payload keys + assistantLanguage before publish
    logger.info({
      requestId,
      channel: 'assistant',
      payloadKeys: Object.keys(normalizedPayload),
      assistantLanguage: enforcedLanguage,
      assistantType: normalizedPayload.type,
      wasEnforced: verification.wasEnforced,
      verificationSource: verification.source,
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
        language: enforcedLanguage // Already normalized to 'he' | 'en'
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
