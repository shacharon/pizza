/**
 * Assistant WebSocket Publisher
 * Handles assistant narration messages with seq numbering and deduplication
 * Now with LLM rewriting for better UX
 * 
 * TO_MAYBE: Full assistant flow (disabled for MVP via ASSISTANT_MODE flag)
 */

import { wsManager } from '../../server.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { rewriteAssistantMessage, logRewriteSummary } from '../../services/assistant/assistant-llm-rewriter.service.js';
import { ASSISTANT_MODE } from '../../config/assistant.flags.js';

/**
 * Assistant session state
 */
interface AssistantSession {
  seq: number;
  sent: Set<string>;
  expiresAt: number;
  language: 'he' | 'en' | 'ru' | 'auto';
  tone: 'neutral' | 'friendly';
  pendingQueue: Array<{
    type: 'assistant_progress' | 'assistant_suggestion';
    rawMessage: string;
    stage?: string;
  }>;
  processing: boolean;
}

/**
 * In-memory session store
 * TTL: 10 minutes
 */
const sessions = new Map<string, AssistantSession>();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get or create session for requestId
 */
function getSession(
  requestId: string,
  language: 'he' | 'en' | 'ru' | 'auto' = 'auto',
  tone: 'neutral' | 'friendly' = 'friendly'
): AssistantSession {
  // Cleanup expired sessions (cheap operation)
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(id);
      // Log summary on session cleanup
      logRewriteSummary(id);
    }
  }

  // Get or create session
  let session = sessions.get(requestId);
  if (!session) {
    session = {
      seq: 0,
      sent: new Set<string>(),
      expiresAt: now + SESSION_TTL_MS,
      language,
      tone,
      pendingQueue: [],
      processing: false
    };
    sessions.set(requestId, session);
  } else {
    // Update language/tone if provided (allows dynamic updates)
    session.language = language;
    session.tone = tone;
  }

  return session;
}

/**
 * Process pending queue for a session (maintains seq order)
 */
async function processQueue(requestId: string, session: AssistantSession): Promise<void> {
  if (session.processing || session.pendingQueue.length === 0) {
    return;
  }

  session.processing = true;

  while (session.pendingQueue.length > 0) {
    const item = session.pendingQueue.shift()!;
    
    try {
      // Rewrite message via LLM
      const result = await rewriteAssistantMessage({
        requestId,
        rawMessage: item.rawMessage,
        targetLanguage: session.language,
        tone: session.tone,
        ...(item.stage !== undefined && { stage: item.stage })
      });

      // Build dedup key (use final message for dedup)
      const dedupKey = `${item.type}|${result.finalMessage}`;

      // Check if already sent
      if (session.sent.has(dedupKey)) {
        logger.debug({
          requestId,
          type: item.type,
          message: result.finalMessage,
          event: 'assistant_deduplicated_after_rewrite'
        }, '[Assistant] Message already sent (deduplicated after rewrite)');
        continue;
      }

      // Increment seq
      session.seq++;

      // Mark as sent
      session.sent.add(dedupKey);

      // Publish to WS
      wsManager.publishToChannel('search', requestId, undefined, {
        type: item.type,
        requestId,
        seq: session.seq,
        message: result.finalMessage
      });

      logger.info({
        requestId,
        seq: session.seq,
        type: item.type,
        message: result.finalMessage,
        rawMessage: item.rawMessage,
        rewritten: result.meta.usedLLM,
        cacheHit: result.meta.cacheHit,
        event: 'assistant_message_sent'
      }, '[Assistant] Message sent');
    } catch (err: any) {
      logger.error({
        requestId,
        type: item.type,
        error: err.message || String(err),
        event: 'assistant_queue_processing_error'
      }, '[Assistant] Queue processing error');
    }
  }

  session.processing = false;
}

/**
 * Set language and tone for a session
 * Should be called early in the request lifecycle (before publishing messages)
 * 
 * TO_MAYBE: assistant flow (disabled for MVP)
 */
export function setAssistantLanguage(
  requestId: string,
  language: 'he' | 'en' | 'ru' | 'auto' = 'auto',
  tone: 'neutral' | 'friendly' = 'friendly'
): void {
  if (ASSISTANT_MODE === 'OFF') return; // TO_MAYBE: skip when disabled
  getSession(requestId, language, tone);
}

/**
 * Publish assistant progress message
 * Now async with LLM rewriting
 * @param requestId - Search request ID
 * @param message - Progress message (will be rewritten)
 * @param stage - Optional stage identifier for logging
 * 
 * TO_MAYBE: assistant flow (disabled for MVP)
 */
export function publishAssistantProgress(
  requestId: string,
  message: string,
  stage?: string
): void {
  if (ASSISTANT_MODE === 'OFF') return; // TO_MAYBE: skip when disabled
  
  const session = getSession(requestId);
  
  // Add to queue
  session.pendingQueue.push({
    type: 'assistant_progress',
    rawMessage: message,
    ...(stage !== undefined && { stage })
  });
  
  // Process queue asynchronously (fire and forget, maintains order)
  processQueue(requestId, session).catch(err => {
    logger.error({
      requestId,
      error: err.message || String(err),
      event: 'assistant_queue_error'
    }, '[Assistant] Queue processing error');
  });
}

/**
 * Publish assistant suggestion message
 * Now async with LLM rewriting
 * @param requestId - Search request ID
 * @param message - Suggestion message (will be rewritten)
 * @param stage - Optional stage identifier for logging
 * 
 * TO_MAYBE: assistant flow (disabled for MVP)
 */
export function publishAssistantSuggestion(
  requestId: string,
  message: string,
  stage?: string
): void {
  if (ASSISTANT_MODE === 'OFF') return; // TO_MAYBE: skip when disabled
  
  const session = getSession(requestId);
  
  // Add to queue
  session.pendingQueue.push({
    type: 'assistant_suggestion',
    rawMessage: message,
    ...(stage !== undefined && { stage })
  });
  
  // Process queue asynchronously (fire and forget, maintains order)
  processQueue(requestId, session).catch(err => {
    logger.error({
      requestId,
      error: err.message || String(err),
      event: 'assistant_queue_error'
    }, '[Assistant] Queue processing error');
  });
}

/**
 * Finalize assistant session and log summary
 * Should be called at the end of a search request
 * 
 * TO_MAYBE: assistant flow (disabled for MVP)
 */
export function finalizeAssistantSession(requestId: string): void {
  if (ASSISTANT_MODE === 'OFF') return; // TO_MAYBE: skip when disabled
  logRewriteSummary(requestId);
}
