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

import { Component, ChangeDetectionStrategy, signal, computed, effect, inject } from '@angular/core';
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

/**
 * Finite State Machine for WS Assistant Status
 */
type WsAssistantState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

interface WsStateTransition {
  from: WsAssistantState | null;
  to: WsAssistantState;
  timestamp: number;
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

  // Finite State Machine for WS status
  private currentWsState: WsAssistantState | null = null;
  private ackShown = false; // One-time ACK flag
  private ackTimer?: number;
  private reconnectThrottleTimer?: number;
  private lastReconnectUpdate: number = 0;

  // Debounce threshold (don't show connecting unless it lasts > 1s)
  private readonly WS_DEBOUNCE_MS = 1000;
  private wsDebounceTimer?: number;
  
  // Throttle reconnecting updates (max 1 per 5s)
  private readonly RECONNECT_THROTTLE_MS = 5000;
  
  // ACK display duration
  private readonly ACK_DISPLAY_MS = 2500;

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
   * Handle WebSocket connection status changes WITH STATE MACHINE
   * Implements finite state machine with distinctUntilChanged behavior
   */
  private handleWsStatusChangeDebounced(status: ConnectionStatus): void {
    // Map ConnectionStatus to WsAssistantState
    const newState = this.mapToWsState(status);
    
    // distinctUntilChanged: Skip if state hasn't changed
    if (this.currentWsState === newState) {
      return;
    }

    // Clear any pending debounce timer
    if (this.wsDebounceTimer) {
      clearTimeout(this.wsDebounceTimer);
      this.wsDebounceTimer = undefined;
    }

    const previousState = this.currentWsState;
    this.currentWsState = newState;

    // Handle state transition
    this.handleStateTransition(previousState, newState);
  }

  /**
   * Map ConnectionStatus to our finite state machine states
   */
  private mapToWsState(status: ConnectionStatus): WsAssistantState {
    switch (status) {
      case 'connected':
        return 'CONNECTED';
      case 'connecting':
        return this.currentWsState === 'CONNECTED' ? 'RECONNECTING' : 'CONNECTING';
      case 'reconnecting':
        return 'RECONNECTING';
      case 'disconnected':
        return 'OFFLINE';
      default:
        return 'OFFLINE';
    }
  }

  /**
   * Handle state transition with appropriate UI updates
   */
  private handleStateTransition(from: WsAssistantState | null, to: WsAssistantState): void {
    console.log('[AssistantLine] State transition:', from, '->', to);

    switch (to) {
      case 'CONNECTED':
        this.handleConnectedState(from);
        break;
      
      case 'CONNECTING':
        // DISABLED: No WS status messages in UI
        // this.wsDebounceTimer = window.setTimeout(() => {
        //   this.wsStatusMessage.set({
        //     type: 'ws_status',
        //     message: 'מתחבר לעוזרת...',
        //     status: 'connecting'
        //   });
        // }, this.WS_DEBOUNCE_MS);
        break;
      
      case 'RECONNECTING':
        this.handleReconnectingState();
        break;
      
      case 'OFFLINE':
        // Clear any ACK timer
        if (this.ackTimer) {
          clearTimeout(this.ackTimer);
          this.ackTimer = undefined;
        }
        // DISABLED: No WS status messages in UI
        // this.wsStatusMessage.set({
        //   type: 'ws_status',
        //   message: 'לא מחובר לעוזרת',
        //   status: 'disconnected'
        // });
        break;
    }
  }

  /**
   * Handle transition to CONNECTED state
   * Shows one-time ACK if transitioning from CONNECTING/RECONNECTING
   */
  private handleConnectedState(from: WsAssistantState | null): void {
    // Clear any existing ACK timer
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = undefined;
    }

    // DISABLED: No WS status messages in UI
    // Show one-time ACK if transitioning from connecting/reconnecting
    // const shouldShowAck = !this.ackShown && (from === 'CONNECTING' || from === 'RECONNECTING');
    
    // if (shouldShowAck) {
    //   // Show success ACK
    //   this.wsStatusMessage.set({
    //     type: 'ws_status',
    //     message: 'העוזרת מחוברת ✅',
    //     status: 'connected'
    //   });
    //   
    //   this.ackShown = true;
    //
    //   // Clear ACK after 2.5 seconds
    //   this.ackTimer = window.setTimeout(() => {
    //     this.wsStatusMessage.set(null);
    //     this.ackTimer = undefined;
    //   }, this.ACK_DISPLAY_MS);
    // } else {
    //   // Already shown ACK before, just clear message
    //   this.wsStatusMessage.set(null);
    // }
  }

  /**
   * Handle RECONNECTING state with throttling (max 1 update per 5s)
   * DISABLED: No WS status messages in UI
   */
  private handleReconnectingState(): void {
    // DISABLED: No WS status messages in UI
    // const now = Date.now();
    // 
    // // Throttle: only update if 5s have passed since last update
    // if (now - this.lastReconnectUpdate < this.RECONNECT_THROTTLE_MS) {
    //   console.log('[AssistantLine] Throttling RECONNECTING update');
    //   return;
    // }
    //
    // this.lastReconnectUpdate = now;
    // this.wsStatusMessage.set({
    //   type: 'ws_status',
    //   message: 'מתחבר מחדש לעוזרת...',
    //   status: 'reconnecting'
    // });
  }

  /**
   * Clear message (user action)
   */
  clearMessage(): void {
    // DISABLED: No WS status messages in UI
    // Only clear WS status messages
    // Line messages are managed by facade, not clearable here
    // if (this.isWsStatusMessage()) {
    //   this.wsStatusMessage.set(null);
    // }
  }
}
