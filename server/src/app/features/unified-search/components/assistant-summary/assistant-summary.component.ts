/**
 * Assistant Summary Component (REFACTORED)
 * Displays assistant cards with CANONICAL ROUTING
 * 
 * ROUTING:
 * - Shows ONLY: SUMMARY, CLARIFY, GATE_FAIL (card types)
 * - Never shows: PRESENCE, WS_STATUS, PROGRESS (those are line types)
 * 
 * STREAMING:
 * - Configurable streaming modes: instant, sentence, word
 * - Click-to-reveal full text
 * - Respects prefers-reduced-motion
 * - Cancels on new messages
 */

import { Component, input, computed, effect, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AssistantStatus } from '../../../../core/models/ws-protocol.types';
import type { AssistantMessage } from '../../../../facades/search-assistant.facade';
import type { AssistantCardMessage } from '../../../../facades/assistant-routing.types';
import { AssistantStreamingService, type StreamingState } from '../../services/assistant-streaming.service';

interface MessageStreamState {
  messageId: string;
  state: ReturnType<typeof signal<StreamingState>>;
  cancel: () => void;
}

@Component({
  selector: 'app-assistant-summary',
  standalone: true,
  imports: [CommonModule],
  providers: [AssistantStreamingService],
  templateUrl: './assistant-summary.component.html',
  styleUrl: './assistant-summary.component.scss'
})
export class AssistantSummaryComponent implements OnDestroy {
  // CANONICAL ROUTING: Card messages only (SUMMARY, CLARIFY, GATE_FAIL)
  readonly cardMessages = input<AssistantCardMessage[]>([]);

  // LEGACY: Old messages format (for backward compatibility)
  readonly messages = input<AssistantMessage[]>([]);

  // Legacy: Single text input (for backward compatibility)
  readonly text = input<string>('');
  readonly status = input.required<AssistantStatus>();
  readonly error = input<string | undefined>(undefined);

  // UI Language for RTL support
  readonly locale = input<string>('en');

  readonly isIdle = computed(() => this.status() === 'idle');
  readonly isPending = computed(() => this.status() === 'pending');
  readonly isStreaming = computed(() => this.status() === 'streaming');
  readonly isCompleted = computed(() => this.status() === 'completed');
  readonly isFailed = computed(() => this.status() === 'failed');

  // ROUTING: Prefer card messages (new routing system)
  readonly displayMessages = computed(() => {
    const cards = this.cardMessages();
    if (cards.length > 0) {
      return cards;
    }
    // Fallback to legacy messages if no card messages
    return this.messages();
  });

  // MULTI-MESSAGE: Determine display mode
  readonly useMultiMessage = computed(() => this.displayMessages().length > 0);

  readonly hasContent = computed(() => {
    if (this.useMultiMessage()) {
      return this.displayMessages().length > 0;
    }
    return !this.isIdle() && (this.text().length > 0 || this.isFailed());
  });

  // RTL support: Hebrew language
  readonly isRTL = computed(() => false); // V1: Always LTR (English only)

  // STREAMING: Track streaming state for each message
  private messageStreams = new Map<string, MessageStreamState>();

  constructor(private streamingService: AssistantStreamingService) {
    // Watch for message changes and start streaming
    effect(() => {
      const messages = this.displayMessages();
      this.handleMessagesChange(messages);
    });
  }

  /**
   * Handle changes to messages: start streaming for new messages
   */
  private handleMessagesChange(messages: (AssistantCardMessage | AssistantMessage)[]): void {
    // Cancel existing streams
    this.cancelAllStreams();

    // Start streaming for each message
    messages.forEach(msg => {
      const messageId = msg.id;
      const messageText = msg.message;

      if (!messageText) return;

      const { state, cancel } = this.streamingService.startStreaming(messageText);

      this.messageStreams.set(messageId, {
        messageId,
        state,
        cancel
      });
    });
  }

  /**
   * Cancel all active streams
   */
  private cancelAllStreams(): void {
    this.messageStreams.forEach(stream => stream.cancel());
    this.messageStreams.clear();
    this.streamingService.cancelAllStreams();
  }

  /**
   * Get visible text for a message
   */
  getMessageVisibleText(msg: AssistantCardMessage | AssistantMessage): string {
    const stream = this.messageStreams.get(msg.id);
    if (stream) {
      return stream.state().visibleText;
    }
    return msg.message;
  }

  /**
   * Check if a message is currently streaming
   */
  isMessageStreaming(msg: AssistantCardMessage | AssistantMessage): boolean {
    const stream = this.messageStreams.get(msg.id);
    if (stream) {
      return stream.state().isStreaming;
    }
    return false;
  }

  /**
   * Handle click on message: reveal full text immediately
   */
  onMessageClick(msg: AssistantCardMessage | AssistantMessage): void {
    const stream = this.messageStreams.get(msg.id);
    if (stream && stream.state().isStreaming) {
      this.streamingService.revealFull(stream.state);
    }
  }

  /**
   * Get icon for message type
   */
  getMessageIcon(type: string): string {
    switch (type) {
      case 'CLARIFY': return '❓';
      case 'SUMMARY': return '✨';
      case 'GATE_FAIL': return '⚠️';
      default: return '💬';
    }
  }

  /**
   * Get CSS class for message type
   */
  getMessageClass(type: string): string {
    return `message-type-${type.toLowerCase()}`;
  }

  /**
   * Get directionality for message based on language
   * V1: Always LTR (English only)
   */
  getMessageDir(msg: AssistantCardMessage): 'rtl' | 'ltr' {
    return 'ltr';
  }

  /**
   * Cleanup: Cancel all streams on destroy to prevent memory leaks
   */
  ngOnDestroy(): void {
    this.cancelAllStreams();
  }
}
