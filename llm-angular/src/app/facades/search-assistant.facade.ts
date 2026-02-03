/**
 * Search Assistant State Handler (REFACTORED)
 * Manages assistant narration and state with canonical routing
 * 
 * CANONICAL ROUTING (חד-חד-ערכית):
 * - Line channel: PRESENCE, WS_STATUS, PROGRESS only
 * - Card channel: SUMMARY, CLARIFY, GATE_FAIL only
 * 
 * DEDUPLICATION:
 * - Client-side messageId: ${requestId}:${type}:${seq/ts/hash}
 * - Keeps seen:Set<string> per requestId
 * 
 * ORDERING:
 * - Line: Latest only (keep most recent)
 * - Card: Latest per type (SUMMARY, CLARIFY, GATE_FAIL)
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import type { AssistantStatus, ActionDefinition, WSServerMessage } from '../core/models/ws-protocol.types';
import { AssistantDedupService } from './assistant-dedup.service';
import type {
  AssistantLineMessage,
  AssistantCardMessage,
  RoutingDecision,
  AssistantMessageType
} from './assistant-routing.types';
import { ASSISTANT_ROUTING, isTypeAllowedOnChannel } from './assistant-routing.types';

/**
 * Single assistant message with metadata (LEGACY - kept for backward compatibility)
 */
export interface AssistantMessage {
  id: string;               // Unique ID (requestId-type-timestamp)
  type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL';
  message: string;
  question: string | null;
  blocksSearch: boolean;
  requestId: string;
  timestamp: number;        // Epoch ms for ordering
}

@Injectable()
export class SearchAssistantHandler {
  private readonly dedupService = inject(AssistantDedupService);

  // ROUTING: Separate channels for line and card
  private readonly _lineMessages = signal<AssistantLineMessage[]>([]);
  private readonly _cardMessages = signal<AssistantCardMessage[]>([]);

  // MULTI-MESSAGE: Store array of messages ordered by timestamp (LEGACY)
  private readonly _messages = signal<AssistantMessage[]>([]);

  // Legacy: Single message state (for backward compatibility)
  private readonly assistantText = signal<string>('');
  private readonly assistantStatus = signal<AssistantStatus>('idle');
  private readonly wsRecommendations = signal<ActionDefinition[]>([]);
  private readonly wsError = signal<string | undefined>(undefined);

  // PLACEMENT FIX: Track requestId associated with assistant message
  private readonly messageRequestId = signal<string | undefined>(undefined);

  // BLOCKS SEARCH: Track if assistant message blocks further search submission
  private readonly _blocksSearch = signal<boolean>(false);

  // ROUTING: Expose line and card channels
  readonly lineMessages = computed(() => {
    // Keep only latest line message
    const msgs = this._lineMessages();
    return msgs.length > 0 ? [msgs[msgs.length - 1]] : [];
  });

  readonly cardMessages = computed(() => {
    // Keep only latest per type
    const msgs = this._cardMessages();
    const latestByType = new Map<string, AssistantCardMessage>();

    for (const msg of msgs) {
      const existing = latestByType.get(msg.type);
      if (!existing || msg.timestamp > existing.timestamp) {
        latestByType.set(msg.type, msg);
      }
    }

    return Array.from(latestByType.values()).sort((a, b) => a.timestamp - b.timestamp);
  });

  // Expose messages (ordered by timestamp) (LEGACY)
  readonly messages = computed(() => {
    return this._messages().sort((a, b) => a.timestamp - b.timestamp);
  });

  // Legacy: Expose as readonly (for backward compatibility)
  readonly narration = this.assistantText.asReadonly();
  readonly status = this.assistantStatus.asReadonly();
  readonly recommendations = this.wsRecommendations.asReadonly();
  readonly error = this.wsError.asReadonly();
  readonly requestId = this.messageRequestId.asReadonly();
  readonly blocksSearch = this._blocksSearch.asReadonly();

  /**
   * Reset assistant state (full reset)
   * ROUTING: Clears both line and card channels
   * DEDUPLICATION: Clears dedupe service
   */
  reset(): void {
    this._lineMessages.set([]);
    this._cardMessages.set([]);
    this._messages.set([]);
    this.dedupService.clearAll();
    this.assistantText.set('');
    this.assistantStatus.set('pending');
    this.wsRecommendations.set([]);
    this.wsError.set(undefined);
    this.messageRequestId.set(undefined);
    this._blocksSearch.set(false);
  }

  /**
   * Reset only global/system assistant messages
   * ROUTING: Clears line messages but preserves card messages with requestId
   */
  resetIfGlobal(): void {
    // Clear line messages (always global)
    this._lineMessages.set([]);

    // Filter card messages: keep only those with requestId (card-bound)
    const cardBoundMessages = this._cardMessages().filter(msg => !!msg.requestId);

    if (cardBoundMessages.length < this._cardMessages().length) {
      console.log('[SearchAssistantHandler] Clearing global card messages', {
        before: this._cardMessages().length,
        after: cardBoundMessages.length
      });
      this._cardMessages.set(cardBoundMessages);
    }

    // Legacy: Filter messages array
    const legacyCardBound = this._messages().filter(msg => !!msg.requestId);
    if (legacyCardBound.length < this._messages().length) {
      this._messages.set(legacyCardBound);
    }

    // Legacy: Only reset if message is NOT bound to a requestId (global/system message)
    if (!this.messageRequestId()) {
      console.log('[SearchAssistantHandler] Clearing legacy global/system assistant message');
      this.assistantText.set('');
      this.assistantStatus.set('pending');
      this.wsRecommendations.set([]);
      this.wsError.set(undefined);
      this._blocksSearch.set(false);
    } else {
      console.log('[SearchAssistantHandler] Preserving legacy card-bound assistant message', {
        requestId: this.messageRequestId()
      });
    }
  }

  /**
   * Route incoming assistant message with deduplication and instrumentation
   * CANONICAL ROUTING: Routes to line or card channel based on type
   */
  routeMessage(
    type: AssistantMessageType,
    message: string,
    requestId: string,
    payload: {
      seq?: number;
      ts?: number;
      question?: string | null;
      blocksSearch?: boolean;
      language?: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it';
    } = {}
  ): RoutingDecision {
    // Generate stable messageId for deduplication
    const messageId = this.dedupService.generateMessageId(requestId, type, {
      seq: payload.seq,
      ts: payload.ts,
      message
    });

    // Check for duplicates
    const isDuplicate = this.dedupService.checkAndMarkSeen(requestId, messageId);

    // Determine routing channel
    const channel = ASSISTANT_ROUTING[type];

    // Build routing decision
    const decision: RoutingDecision = {
      messageId,
      type,
      channel,
      requestId,
      dedupDropped: isDuplicate,
      routedTo: isDuplicate ? 'dropped' : channel
    };

    // INSTRUMENTATION: Log routing decision (always log for debugging)
    console.log('[AssistantHandler][ROUTING]', {
      requestId,
      type,
      messageId,
      dedupDropped: isDuplicate,
      routedTo: decision.routedTo,
      timestamp: new Date().toISOString()
    });

    // Verbose logging if enabled
    if ((window as any).__ASSISTANT_DEBUG__) {
      console.log('[AssistantHandler][VERBOSE]', {
        decision,
        payload,
        message: message.substring(0, 100) // Truncate long messages
      });
    }

    // Drop duplicates early
    if (isDuplicate) {
      return decision;
    }

    const timestamp = Date.now();

    // Route to appropriate channel
    if (channel === 'line') {
      // Line channel: PRESENCE, WS_STATUS, PROGRESS
      const lineMsg: AssistantLineMessage = {
        id: messageId,
        type: type as 'PRESENCE' | 'WS_STATUS' | 'PROGRESS',
        message,
        requestId,
        timestamp
      };

      this._lineMessages.update(msgs => [...msgs, lineMsg]);
      console.log('[AssistantHandler][LINE]', { messageId, type, message });

    } else if (channel === 'card') {
      // Card channel: SUMMARY, CLARIFY, GATE_FAIL
      const cardMsg: AssistantCardMessage = {
        id: messageId,
        type: type as 'SUMMARY' | 'CLARIFY' | 'GATE_FAIL',
        message,
        question: payload.question || null,
        blocksSearch: payload.blocksSearch || false,
        language: payload.language, // Pass language for directionality
        requestId,
        timestamp
      };

      this._cardMessages.update(msgs => [...msgs, cardMsg]);
      console.log('[AssistantHandler][CARD]', {
        messageId,
        type,
        message: message.substring(0, 100),
        totalCardMessages: this._cardMessages().length + 1,
        blocksSearch: payload.blocksSearch,
        language: payload.language
      });

      // Update legacy state for backward compatibility
      this.setMessage(message, requestId, payload.blocksSearch);
    }

    return decision;
  }

  /**
   * Add assistant message to collection (LEGACY - kept for backward compatibility)
   * MULTI-MESSAGE: Appends to array, does not overwrite
   * DEDUPLICATION FIX: Hard guard prevents duplicate messages from WS/HTTP race
   */
  addMessage(
    type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL',
    message: string,
    requestId: string,
    question: string | null = null,
    blocksSearch: boolean = false
  ): void {
    // Use new routing logic
    this.routeMessage(type, message, requestId, {
      question,
      blocksSearch
    });

    // Legacy: Also update old messages array for backward compatibility
    const timestamp = Date.now();
    const id = `${requestId}-${type}-${timestamp}`;

    const newMessage: AssistantMessage = {
      id,
      type,
      message,
      question,
      blocksSearch,
      requestId,
      timestamp
    };

    this._messages.update(msgs => [...msgs, newMessage]);
  }

  /**
   * Set assistant message text (for DONE_CLARIFY)
   * PLACEMENT FIX: Also accepts optional requestId to track message context
   * BLOCKS SEARCH: Also accepts optional blocksSearch flag
   * LEGACY: For backward compatibility
   */
  setMessage(message: string, requestId?: string, blocksSearch?: boolean): void {
    this.assistantText.set(message);
    if (requestId) {
      this.messageRequestId.set(requestId);
    }
    if (blocksSearch !== undefined) {
      this._blocksSearch.set(blocksSearch);
    }
  }

  /**
   * Set assistant status
   */
  setStatus(status: AssistantStatus): void {
    this.assistantStatus.set(status);
  }

  /**
   * Set assistant error
   */
  setError(error: string): void {
    this.wsError.set(error);
    this.assistantStatus.set('failed');
  }

  /**
   * Handle legacy assistant message
   * PLACEMENT FIX: Capture requestId from all message types
   */
  handleLegacyMessage(msg: WSServerMessage): void {
    // PLACEMENT FIX: Extract and store requestId if present (for contextual binding)
    const msgWithRequestId = msg as any;
    if (msgWithRequestId.requestId) {
      this.messageRequestId.set(msgWithRequestId.requestId);
    }

    switch (msg.type) {
      case 'status':
        this.assistantStatus.set(msg.status);
        console.log('[SearchAssistantHandler] Assistant status:', msg.status);
        break;

      case 'stream.delta':
        // Append chunk
        this.assistantText.update(text => text + msg.text);
        this.assistantStatus.set('streaming');
        break;

      case 'stream.done':
        // Finalize text
        this.assistantText.set(msg.fullText);
        console.log('[SearchAssistantHandler] Assistant stream complete');
        break;

      case 'recommendation':
        this.wsRecommendations.set(msg.actions);
        console.log('[SearchAssistantHandler] Recommendations received:', msg.actions.length);
        break;

      case 'error':
        console.error('[SearchAssistantHandler] Assistant error', msg);
        this.wsError.set(msg.message);
        this.assistantStatus.set('failed');
        break;
    }
  }
}
