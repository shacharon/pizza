/**
 * Assistant Line Component (REFACTORED)
 * Single-line status showing ONLY line-channel messages
 * 
 * CANONICAL ROUTING:
 * - Shows ONLY: PRESENCE, WS_STATUS, PROGRESS
 * - Never shows: SUMMARY, CLARIFY, GATE_FAIL (those are cards)
 * 
 * NO DIRECT WS SUBSCRIPTION:
 * - Gets messages from SearchFacade.assistantLineMessages only
 * - SearchFacade is the single source of truth
 */

import { Component, ChangeDetectionStrategy, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { SearchFacade } from '../../../../facades/search.facade';
import type { ConnectionStatus } from '../../../../core/models/ws-protocol.types';
import type { AssistantLineMessage } from '../../../../facades/assistant-routing.types';

interface WSStatusMessage {
  type: 'ws_status';
  message: string;
  status: ConnectionStatus;
}

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
  private readonly searchFacade = inject(SearchFacade);

  // WebSocket status message (lower priority, fallback)
  private readonly wsStatusMessage = signal<WSStatusMessage | null>(null);

  // Anti-flicker state tracking
  private wsDebounceTimer?: number;
  private lastWsState: ConnectionStatus | null = null;
  private lastRenderedMessage: string | null = null;
  private lastMessageUpdateTime: number = 0;

  // Debounce threshold (don't show connecting unless it lasts > 1s)
  private readonly WS_DEBOUNCE_MS = 1000;
  // Minimum time between message updates (anti-flicker)
  private readonly MESSAGE_UPDATE_THROTTLE_MS = 2000;

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
    return lineMsg?.message || this.wsStatusMessage()?.message || null;
  });

  // Check if currently showing WS status message
  readonly isWsStatusMessage = computed(() => {
    return !this.latestLineMessage() && !!this.wsStatusMessage();
  });

  // Check if WS is disconnected
  readonly isWsDisconnected = computed(() => {
    const status = this.wsStatusMessage()?.status;
    return status === 'disconnected' || status === 'reconnecting';
  });

  // Check if should show warning color
  readonly isWsWarning = computed(() => {
    return this.isWsStatusMessage() && this.isWsDisconnected();
  });

  constructor() {
    // Track WebSocket connection status with debouncing
    effect(() => {
      const status = this.wsClient.connectionStatus();
      this.handleWsStatusChangeDebounced(status);
    }, { allowSignalWrites: true });
  }

  /**
   * Handle WebSocket connection status changes WITH DEBOUNCING
   * Prevents flickering by requiring state to be stable for 1 second
   */
  private handleWsStatusChangeDebounced(status: ConnectionStatus): void {
    // Clear any pending debounce timer
    if (this.wsDebounceTimer) {
      clearTimeout(this.wsDebounceTimer);
      this.wsDebounceTimer = undefined;
    }

    // Track state change timestamp
    if (this.lastWsState !== status) {
      this.lastWsState = status;
    }

    // CONNECTED: Silently remove message immediately (no success flash)
    if (status === 'connected') {
      this.wsStatusMessage.set(null);
      this.lastRenderedMessage = null;
      return;
    }

    // CONNECTING/RECONNECTING: Debounce to prevent flicker
    // Collapse both states into single "connecting" message
    if (status === 'connecting' || status === 'reconnecting') {
      // Wait 1 second before showing "connecting" message
      this.wsDebounceTimer = window.setTimeout(() => {
        this.updateWsMessage('Connecting to assistant...', status);
      }, this.WS_DEBOUNCE_MS);
      return;
    }

    // DISCONNECTED: Show immediately (hard failure)
    if (status === 'disconnected') {
      this.updateWsMessage('Connecting to assistant...', status);
    }
  }

  /**
   * Update WS message with throttling to prevent rapid text changes
   */
  private updateWsMessage(message: string, status: ConnectionStatus): void {
    const now = Date.now();

    // Skip only if SAME message
    if (this.lastRenderedMessage === message) return;

    // Throttle ONLY if message would change too frequently,
    // but ALWAYS allow disconnected to show immediately
    const isHardFailure = status === 'disconnected';
    if (!isHardFailure && now - this.lastMessageUpdateTime < this.MESSAGE_UPDATE_THROTTLE_MS) {
      return;
    }

    this.wsStatusMessage.set({ type: 'ws_status', message, status });
    this.lastRenderedMessage = message;
    this.lastMessageUpdateTime = now;
  }

  /**
   * Clear message (user action)
   */
  clearMessage(): void {
    // Only clear WS status messages
    // Line messages are managed by facade, not clearable here
    if (this.isWsStatusMessage()) {
      this.wsStatusMessage.set(null);
    }
  }
}
