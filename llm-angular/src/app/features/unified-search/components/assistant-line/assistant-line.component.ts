/**
 * Assistant Line Component
 * Single-line status showing the latest assistant message OR WebSocket connection status
 * WebSocket status is shown as a fallback when no assistant messages are active
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { Subscription } from 'rxjs';
import type { ConnectionStatus } from '../../../../core/models/ws-protocol.types';

interface AssistantMessage {
  requestId: string;
  seq: number;
  message: string;
  type: 'assistant_progress' | 'assistant_suggestion';
}

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
export class AssistantLineComponent implements OnInit, OnDestroy {
  // Assistant message (higher priority)
  private readonly assistantMessage = signal<string | null>(null);

  // WebSocket status message (lower priority, fallback)
  private readonly wsStatusMessage = signal<WSStatusMessage | null>(null);

  // Final message to display (assistant takes priority)
  readonly finalMessage = computed(() => {
    return this.assistantMessage() || this.wsStatusMessage()?.message || null;
  });

  // Check if currently showing WS status message
  readonly isWsStatusMessage = computed(() => {
    return !this.assistantMessage() && !!this.wsStatusMessage();
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

  // Current requestId being tracked
  private currentRequestId: string | null = null;

  // Queue for staggered updates
  private messageQueue: AssistantMessage[] = [];
  private isProcessingQueue = false;

  // WebSocket subscriptions
  private wsSubscription?: Subscription;

  // Anti-flicker state tracking
  private wsStateSince: number = Date.now();
  private lastWsState: ConnectionStatus | null = null;
  private wsDebounceTimer?: number;
  private lastRenderedMessage: string | null = null;
  private lastMessageUpdateTime: number = 0;

  // Debounce threshold (don't show connecting unless it lasts > 1s)
  private readonly WS_DEBOUNCE_MS = 1000;
  // Minimum time between message updates (anti-flicker)
  private readonly MESSAGE_UPDATE_THROTTLE_MS = 2000;

  constructor(private wsClient: WsClientService) {
    // Track WebSocket connection status with debouncing
    effect(() => {
      const status = this.wsClient.connectionStatus();
      this.handleWsStatusChangeDebounced(status);
    });
  }

  ngOnInit(): void {
    this.subscribeToWebSocket();
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
    if (this.wsDebounceTimer) {
      clearTimeout(this.wsDebounceTimer);
    }
  }

  /**
   * Subscribe to WebSocket messages
   */
  private subscribeToWebSocket(): void {
    this.wsSubscription = this.wsClient.messages$.subscribe((message: any) => {
      // Only process assistant_progress and assistant_suggestion events
      if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
        this.handleAssistantMessage(message);
      }
    });
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
      this.wsStateSince = Date.now();
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
        this.updateWsMessage('מתחבר לעוזרת…', status);
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
   * Handle incoming assistant message
   */
  private handleAssistantMessage(msg: any): void {
    // Validate message structure
    if (!msg.requestId || typeof msg.seq !== 'number' || !msg.message) {
      return;
    }

    const { requestId, seq, message, type } = msg;

    // Check if this is a new requestId
    if (this.currentRequestId !== requestId) {
      // New search - clear queue and display
      this.messageQueue = [];
      this.currentRequestId = requestId;
      this.isProcessingQueue = false;
    }

    // Add to queue
    this.messageQueue.push({
      requestId,
      seq,
      message,
      type: type as 'assistant_progress' | 'assistant_suggestion'
    });

    // Sort queue by seq
    this.messageQueue.sort((a, b) => a.seq - b.seq);

    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Process message queue with staggered updates (250ms delay)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg && msg.requestId === this.currentRequestId) {
        // Update display
        this.assistantMessage.set(msg.message);

        // Wait 250ms before next update (stagger effect)
        if (this.messageQueue.length > 0) {
          await this.delay(250);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Delay helper for staggered updates
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear message (user action)
   */
  clearMessage(): void {
    // Only clear assistant messages, not WS status
    if (!this.isWsStatusMessage()) {
      this.assistantMessage.set(null);
      this.messageQueue = [];
    } else {
      // Clear WS status message
      this.wsStatusMessage.set(null);
    }
  }
}
