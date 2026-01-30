/**
 * Assistant Line Component (PRESENTATIONAL)
 * Single-line status showing ONLY line-channel messages
 * 
 * CANONICAL ROUTING:
 * - Shows ONLY: PRESENCE, WS_STATUS, PROGRESS
 * - Never shows: SUMMARY, CLARIFY, GATE_FAIL (those are cards)
 * 
 * Architecture:
 * - Presentational component (no business logic)
 * - Gets messages from SearchFacade.assistantLineMessages
 * - WS status FSM handled by WsStatusFsmService
 */

import { Component, ChangeDetectionStrategy, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { WsStatusFsmService } from '../../../../core/services/ws-status-fsm.service';
import { SearchFacade } from '../../../../facades/search.facade';
import type { ConnectionStatus } from '../../../../core/models/ws-protocol.types';

@Component({
  selector: 'app-assistant-line',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (finalMessage()) {
    <div class="assistant-line" [class.ws-status]="isWsStatusMessage()">
      <span class="assistant-text" [class.ws-warning]="isWsWarning()">{{ finalMessage() }}</span>
      @if (!isWsStatusMessage() || isWsDisconnected()) {
        <button class="clear-btn" (click)="clearMessage()" type="button" aria-label="Clear">✕</button>
      }
    </div>
    }
  `,
  styles: [`
    .assistant-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 0;
    }

    .assistant-text {
      flex: 1;
      color: #9ca3af;
      font-size: 0.8125rem;
      line-height: 1.3;
      font-style: normal;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &.ws-warning {
        color: #f59e0b;
      }
    }

    .clear-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 3px;
      transition: all 0.15s ease;

      &:hover {
        color: #6b7280;
        background: #e5e7eb;
      }

      &:active {
        background: #d1d5db;
      }
    }

    @media (max-width: 767px) {
      .assistant-text {
        font-size: 0.75rem;
      }

      .clear-btn {
        font-size: 0.9375rem;
      }
    }
  `]
})
export class AssistantLineComponent {
  private readonly wsClient = inject(WsClientService);
  private readonly wsStatusFsm = inject(WsStatusFsmService);
  private readonly searchFacade = inject(SearchFacade);

  // CANONICAL ROUTING: Get line messages from facade (PRESENCE, WS_STATUS, PROGRESS only)
  private readonly lineMessages = computed(() => {
    const msgs = this.searchFacade.assistantLineMessages();
    const activeRequestId = this.searchFacade.requestId();
    
    // Filter by active requestId if present
    if (activeRequestId) {
      return msgs.filter(msg => msg.requestId === activeRequestId);
    }
    
    return msgs;
  });

  // Latest line message (if any)
  private readonly latestLineMessage = computed(() => {
    const msgs = this.lineMessages();
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  });

  // Final message to display (line message takes priority over WS status)
  readonly finalMessage = computed(() => {
    const lineMsg = this.latestLineMessage();
    return lineMsg?.message || this.wsStatusFsm.wsStatusMessage()?.message || null;
  });

  // Check if currently showing WS status message
  readonly isWsStatusMessage = computed(() => {
    return !this.latestLineMessage() && !!this.wsStatusFsm.wsStatusMessage();
  });

  // Check if WS is disconnected
  readonly isWsDisconnected = computed(() => {
    const status = this.wsStatusFsm.wsStatusMessage()?.status;
    return status === 'disconnected' || status === 'reconnecting';
  });

  // Check if should show warning color
  readonly isWsWarning = computed(() => {
    return this.isWsStatusMessage() && this.isWsDisconnected();
  });

  constructor() {
    // Track WebSocket connection status - delegate to FSM service
    effect(() => {
      const status = this.wsClient.connectionStatus();
      this.wsStatusFsm.processStatusChange(status);
    });
  }

  /**
   * Clear message (user action)
   */
  clearMessage(): void {
    // Delegate to FSM service
    this.wsStatusFsm.clearMessage();
  }
}
