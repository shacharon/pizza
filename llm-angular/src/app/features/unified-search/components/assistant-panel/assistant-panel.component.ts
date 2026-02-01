/**
 * Assistant Panel Component
 * Persistent panel showing assistant progress messages from WebSocket
 * UX-only narration (no chips/filters/state changes)
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { Subscription } from 'rxjs';
import { SearchFacade } from '../../../../facades/search.facade';
import { environment } from '../../../../../environments/environment';

/**
 * Assistant message interface
 */
interface AssistantMessage {
  requestId: string;
  seq: number;
  message: string;
  type: 'assistant_progress' | 'assistant_suggestion';
  timestamp: number;
  language?: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';  // Language from payload
}

@Component({
  selector: 'app-assistant-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-panel.component.html',
  styleUrl: './assistant-panel.component.scss'
})
export class AssistantPanelComponent implements OnInit, OnDestroy {
  // All messages for current requestId
  private allMessages = signal<AssistantMessage[]>([]);

  // Visible messages (last 3 only)
  readonly messages = computed(() => {
    const all = this.allMessages();
    return all.slice(-3); // Show only last 3
  });

  // Current requestId being tracked
  private currentRequestId = signal<string | null>(null);

  // Track seen messages to deduplicate
  private seenMessages = new Set<string>();

  // WebSocket subscription
  private wsSubscription?: Subscription;

  // Inject search facade for uiLanguage
  private searchFacade = inject(SearchFacade);

  // Dev mode check
  readonly isDev = computed(() => !environment.production);

  constructor(private wsClient: WsClientService) { }

  ngOnInit(): void {
    this.subscribeToWebSocket();
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
  }

  /**
   * Subscribe to WebSocket messages
   */
  private subscribeToWebSocket(): void {
    this.wsSubscription = this.wsClient.messages$.subscribe((message: any) => {
      // Handle both old format (assistant_progress/suggestion) and new format (assistant)
      if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
        this.handleAssistantMessage(message);
      } else if (message.type === 'assistant' && message.payload) {
        this.handleNarratorMessage(message);
      }
    });
  }

  /**
   * Handle incoming assistant message (old format)
   */
  private handleAssistantMessage(msg: any): void {
    // Validate message structure
    if (!msg.requestId || typeof msg.seq !== 'number' || !msg.message) {
      console.warn('[AssistantPanel] Invalid message structure:', msg);
      return;
    }

    const { requestId, seq, message, type } = msg;

    // Check if this is a new requestId
    if (this.currentRequestId() !== requestId) {
      // New search started - clear old messages
      this.clearMessages();
      this.currentRequestId.set(requestId);
    }

    // Deduplicate: check if we've already seen this (requestId, seq)
    const messageKey = `${requestId}-${seq}`;
    if (this.seenMessages.has(messageKey)) {
      return; // Duplicate - ignore
    }

    // Add message
    this.seenMessages.add(messageKey);

    const assistantMsg: AssistantMessage = {
      requestId,
      seq,
      message,
      type: type as 'assistant_progress' | 'assistant_suggestion',
      timestamp: Date.now()
    };

    // Insert message in correct position (sorted by seq)
    const currentMessages = this.allMessages();
    const newMessages = [...currentMessages, assistantMsg].sort((a, b) => a.seq - b.seq);
    this.allMessages.set(newMessages);
  }

  /**
   * Handle narrator message (new format from backend)
   * Server sends: { type: 'assistant', requestId, payload: { type, message, question, blocksSearch } }
   */
  private handleNarratorMessage(msg: any): void {
    try {
      // Validate message structure
      if (!msg.requestId || !msg.payload || !msg.payload.message) {
        console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
        return;
      }

      const { requestId, payload } = msg;
      const narrator = payload; // payload contains the narrator data

      // DEDUP FIX: Strict type validation - only LLM assistant messages
      // System notifications MUST NOT render as assistant messages
      const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL', 'SEARCH_FAILED'];
      if (!narrator.type || !validTypes.includes(narrator.type)) {
        console.log('[AssistantPanel] Ignoring non-LLM message:', narrator.type || 'unknown');
        return;
      }

      // DEBUG LOG: Enhanced with language and result context
      const debugInfo = {
        type: narrator.type,
        language: narrator.language || 'unknown',
        requestId: requestId.substring(0, 8),
        message: narrator.message.substring(0, 60) + '...',
        blocksSearch: narrator.blocksSearch,
        timestamp: new Date().toISOString()
      };

      console.log(`[AssistantPanel][DEBUG] assistant: {type: ${debugInfo.type}, lang: ${debugInfo.language}, req: ${debugInfo.requestId}, blocksSearch: ${debugInfo.blocksSearch}}`, debugInfo);

      // Check if this is a new requestId
      if (this.currentRequestId() !== requestId) {
        // New search started - clear old messages
        console.log('[AssistantPanel] NEW requestId detected - clearing old messages', {
          oldRequestId: this.currentRequestId(),
          newRequestId: requestId
        });
        this.clearMessages();
        this.currentRequestId.set(requestId);
      }

      // Generate seq based on narrator type (GATE_FAIL=1, CLARIFY=2, SUMMARY=3, SEARCH_FAILED=4)
      const seq = narrator.type === 'GATE_FAIL' ? 1 : narrator.type === 'CLARIFY' ? 2 : narrator.type === 'SEARCH_FAILED' ? 4 : 3;

      // Deduplicate: check if we've already seen this (requestId, seq)
      const messageKey = `${requestId}-${seq}`;
      if (this.seenMessages.has(messageKey)) {
        console.log('[AssistantPanel] DUPLICATE message ignored', { messageKey });
        return; // Duplicate - ignore
      }

      // Add message
      this.seenMessages.add(messageKey);

      // Determine type: SUMMARY -> suggestion, SEARCH_FAILED -> progress, others -> progress
      const type = narrator.type === 'SUMMARY' ? 'assistant_suggestion' : 'assistant_progress';

      // Prefer question over message for CLARIFY
      const displayMessage = narrator.question || narrator.message;

      const assistantMsg: AssistantMessage = {
        requestId,
        seq,
        message: displayMessage,
        type: type as 'assistant_progress' | 'assistant_suggestion',
        timestamp: Date.now(),
        language: narrator.language  // Capture language from payload
      };

      console.log('[AssistantPanel] Narrator message added:', narrator.type, displayMessage.substring(0, 50));

      // Insert message in correct position (sorted by seq)
      const currentMessages = this.allMessages();
      const newMessages = [...currentMessages, assistantMsg].sort((a, b) => a.seq - b.seq);
      this.allMessages.set(newMessages);

      // DEBUG LOG: Confirm UI will render (signal updated)
      console.log('[AssistantPanel][RENDER] Signal updated - UI will render', {
        requestId: requestId.substring(0, 8),
        narratorType: narrator.type,
        language: narrator.language || 'unknown',
        messageCount: newMessages.length,
        visibleCount: Math.min(3, newMessages.length),
        displayMessage: displayMessage.substring(0, 60) + '...'
      });
    } catch (error) {
      console.error('[AssistantPanel] Failed to parse narrator message', error, msg);
    }
  }

  /**
   * Clear all messages (user action)
   */
  clearMessages(): void {
    this.allMessages.set([]);
    this.seenMessages.clear();
  }

  /**
   * Get icon for message type
   */
  getIcon(type: string): string {
    switch (type) {
      case 'assistant_progress':
        return '🔄';
      case 'assistant_suggestion':
        return '💡';
      default:
        return '📝';
    }
  }

  /**
   * Check if language is RTL (Hebrew or Arabic)
   */
  isRTL(msg: AssistantMessage): boolean {
    const lang = msg.language || this.getFallbackLanguage();
    return lang === 'he' || lang === 'ar';
  }

  /**
   * Get effective language (with fallback)
   */
  getEffectiveLanguage(msg: AssistantMessage): string {
    return msg.language || this.getFallbackLanguage();
  }

  /**
   * Get fallback language (uiLanguage or 'en')
   */
  private getFallbackLanguage(): string {
    const request = this.searchFacade.searchRequest();
    return request?.uiLanguage || 'en';
  }

  /**
   * Get uiLanguage for debug display
   */
  getUILanguage(): string {
    const request = this.searchFacade.searchRequest();
    return request?.uiLanguage || 'n/a';
  }
}
