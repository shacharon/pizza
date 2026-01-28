/**
 * Route2 Narrator Integration
 * Handles assistant narrator generation and publishing
 */

import { logger } from '../../../lib/logger/structured-logger.js';
import { ASSISTANT_MODE_ENABLED, DEBUG_NARRATOR_ENABLED } from '../../../config/narrator.flags.js';
import { generateAssistantMessage } from './narrator/assistant-narrator.js';
import { publishAssistantMessage } from './narrator/assistant-publisher.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import type {
  NarratorGateContext,
  NarratorClarifyContext,
  NarratorSummaryContext
} from './narrator/narrator.types.js';
import type { Route2Context } from './types.js';
import type { NarratorBaseOpts } from './orchestrator.types.js';
import { generateFailureFallbackMessage } from './failure-messages.js';

/**
 * Maybe generate narrator message and publish to WebSocket
 * Returns fallback message if narrator is disabled or fails
 */
export async function maybeNarrateAndPublish(
  ctx: Route2Context,
  requestId: string,
  sessionId: string,
  narratorContext: NarratorGateContext | NarratorClarifyContext | NarratorSummaryContext,
  fallbackHttpMessage: string,
  preferQuestionForHttp: boolean,
  logEventOnFail: string,
  wsManager: WebSocketManager
): Promise<string> {
  // Log hook invocation (high-signal, always on)
  logger.info(
    {
      requestId,
      hookType: narratorContext.type,
      sessionIdPresent: !!sessionId,
      event: 'assistant_hook_called'
    },
    '[NARRATOR] Assistant hook invoked'
  );

  if (!ASSISTANT_MODE_ENABLED) {
    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        { requestId, event: 'narrator_skipped', reason: 'ASSISTANT_MODE_ENABLED=false' },
        '[NARRATOR] Skipped (feature disabled)'
      );
    }
    return fallbackHttpMessage;
  }

  try {
    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        {
          requestId,
          narratorType: narratorContext.type,
          sessionIdPresent: !!sessionId,
          event: 'narrator_invoked'
        },
        '[NARRATOR] Generating message'
      );
    }

    const opts: NarratorBaseOpts = {};
    if (ctx.traceId) opts.traceId = ctx.traceId;
    if (ctx.sessionId) opts.sessionId = ctx.sessionId;

    const narrator = await generateAssistantMessage(narratorContext, ctx.llmProvider, requestId, opts);

    if (DEBUG_NARRATOR_ENABLED) {
      logger.debug(
        {
          requestId,
          narratorGenerated: true,
          messageLength: narrator.message?.length || 0,
          event: 'narrator_generated'
        },
        '[NARRATOR] Message generated successfully'
      );
    }

    // WS publish is best-effort
    publishAssistantMessage(wsManager, requestId, sessionId, narrator);

    // HTTP assist text: for CLARIFY prefer question when exists
    if (preferQuestionForHttp && narrator.question) return narrator.question;
    return narrator.message || fallbackHttpMessage;
  } catch (error) {
    logger.warn(
      {
        requestId,
        event: logEventOnFail,
        error: error instanceof Error ? error.message : String(error)
      },
      '[ROUTE2] Narrator failed, using fallback'
    );
    return fallbackHttpMessage;
  }
}

/**
 * Publish assistant narrator message on pipeline failure (best-effort)
 * Used in catch block to generate and publish failure messages
 */
export async function publishFailureNarrator(
  ctx: Route2Context,
  requestId: string,
  wsManager: WebSocketManager,
  error: unknown,
  errorKind: string | undefined
): Promise<void> {
  try {
    if (ASSISTANT_MODE_ENABLED && wsManager) {
      let narrator: any;
      
      // Try to generate LLM narrator message
      try {
        const narratorContext: NarratorGateContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: '',
          language: 'he', // Default to Hebrew for pipeline failures
          locationKnown: !!ctx.userLocation
        };
        
        const opts: NarratorBaseOpts = {};
        if (ctx.traceId) opts.traceId = ctx.traceId;
        if (ctx.sessionId) opts.sessionId = ctx.sessionId;
        
        narrator = await generateAssistantMessage(narratorContext, ctx.llmProvider, requestId, opts);
        
        if (DEBUG_NARRATOR_ENABLED) {
          logger.debug({
            requestId,
            event: 'narrator_llm_success',
            errorKind
          }, '[NARRATOR] LLM narrator generated for pipeline failure');
        }
      } catch (narratorErr) {
        // LLM narrator failed - use deterministic fallback
        const fallbackMessage = generateFailureFallbackMessage(errorKind, error);
        narrator = {
          type: 'GATE_FAIL',
          message: fallbackMessage.message,
          question: null,
          suggestedAction: fallbackMessage.suggestedAction,
          blocksSearch: false
        };
        
        if (DEBUG_NARRATOR_ENABLED) {
          logger.debug({
            requestId,
            event: 'narrator_llm_failed_using_fallback',
            errorKind,
            narratorError: narratorErr instanceof Error ? narratorErr.message : 'unknown'
          }, '[NARRATOR] LLM failed, using deterministic fallback');
        }
      }
      
      // Publish to search channel (where frontend subscribes)
      publishAssistantMessage(wsManager, requestId, ctx.sessionId, narrator);
      
      if (DEBUG_NARRATOR_ENABLED) {
        logger.debug({
          requestId,
          event: 'pipeline_failure_narrator_done',
          errorKind
        }, '[NARRATOR] Pipeline failure narrator published');
      }
    }
  } catch (assistErr) {
    // Swallow assistant publish errors - don't mask original error
    logger.warn({
      requestId,
      error: assistErr instanceof Error ? assistErr.message : 'unknown'
    }, '[NARRATOR] Failed to publish assistant message on pipeline failure');
  }
}
