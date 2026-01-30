/**
 * WebSocket Status Finite State Machine Service
 * 
 * Responsibility:
 * - Manages WS connection status state machine (CONNECTING → CONNECTED → RECONNECTING → OFFLINE)
 * - Handles debouncing, throttling, and ACK timers
 * - Produces wsStatusMessage signal for UI consumption
 * 
 * States:
 * - CONNECTING: Initial connection attempt
 * - CONNECTED: Successfully connected
 * - RECONNECTING: Attempting to reconnect after disconnect
 * - OFFLINE: Disconnected, not attempting to connect
 */

import { Injectable, signal, effect } from '@angular/core';
import type { ConnectionStatus } from '../models/ws-protocol.types';

interface WSStatusMessage {
  type: 'ws_status';
  message: string;
  status: ConnectionStatus;
}

type WsAssistantState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

@Injectable({
  providedIn: 'root'
})
export class WsStatusFsmService {
  // Timing constants
  private readonly WS_DEBOUNCE_MS = 1000;
  private readonly RECONNECT_THROTTLE_MS = 5000;
  private readonly ACK_DISPLAY_MS = 2500;

  // FSM state
  private currentWsState: WsAssistantState | null = null;
  private ackShown = false;

  // Timers
  private ackTimer?: number;
  private wsDebounceTimer?: number;
  private reconnectThrottleTimer?: number;
  private lastReconnectUpdate: number = 0;

  // Public signal for UI consumption
  private readonly _wsStatusMessage = signal<WSStatusMessage | null>(null);
  readonly wsStatusMessage = this._wsStatusMessage.asReadonly();

  /**
   * Process WebSocket connection status change
   * Implements FSM with debouncing and distinctUntilChanged behavior
   */
  processStatusChange(status: ConnectionStatus): void {
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
    console.log('[WsStatusFsm] State transition:', from, '->', to);

    switch (to) {
      case 'CONNECTED':
        this.handleConnectedState(from);
        break;
      
      case 'CONNECTING':
        // NOTE: Currently disabled - no WS status messages in UI
        // If needed, uncomment to show "Connecting..." after debounce
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
        // NOTE: Currently disabled - no WS status messages in UI
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

    // NOTE: Currently disabled - no WS status messages in UI
    // If needed, uncomment to show one-time success ACK
  }

  /**
   * Handle RECONNECTING state with throttling (max 1 update per 5s)
   */
  private handleReconnectingState(): void {
    // NOTE: Currently disabled - no WS status messages in UI
    // If needed, implement throttled reconnecting message
  }

  /**
   * Clear status message (user action)
   */
  clearMessage(): void {
    this._wsStatusMessage.set(null);
  }

  /**
   * Reset service state (for testing or cleanup)
   */
  reset(): void {
    // Clear all timers
    if (this.ackTimer) clearTimeout(this.ackTimer);
    if (this.wsDebounceTimer) clearTimeout(this.wsDebounceTimer);
    if (this.reconnectThrottleTimer) clearTimeout(this.reconnectThrottleTimer);

    // Reset state
    this.currentWsState = null;
    this.ackShown = false;
    this.lastReconnectUpdate = 0;
    this._wsStatusMessage.set(null);
  }
}
