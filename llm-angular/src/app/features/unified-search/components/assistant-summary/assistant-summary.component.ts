/**
 * Assistant Summary Component (REFACTORED)
 * Displays assistant cards with CANONICAL ROUTING
 * 
 * ROUTING:
 * - Shows ONLY: SUMMARY, CLARIFY, GATE_FAIL (card types)
 * - Never shows: PRESENCE, WS_STATUS, PROGRESS (those are line types)
 */

import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AssistantStatus } from '../../../../core/models/ws-protocol.types';
import type { AssistantMessage } from '../../../../facades/search-assistant.facade';
import type { AssistantCardMessage } from '../../../../facades/assistant-routing.types';

@Component({
  selector: 'app-assistant-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './assistant-summary.component.html',
  styleUrl: './assistant-summary.component.scss'
})
export class AssistantSummaryComponent {
  // CANONICAL ROUTING: Card messages only (SUMMARY, CLARIFY, GATE_FAIL)
  readonly cardMessages = input<AssistantCardMessage[]>([]);
  
  // LEGACY: Old messages format (for backward compatibility)
  readonly messages = input<AssistantMessage[]>([]);
  
  // Legacy: Single text input (for backward compatibility)
  readonly text = input<string>('');
  readonly status = input.required<AssistantStatus>();
  readonly error = input<string | undefined>(undefined);
  
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
}
