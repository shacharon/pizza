/**
 * WebSocket Client Service - Phase 6
 * Manages WebSocket connection, reconnection, and message streaming
 */

import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  WSClientMessage,
  WSServerMessage,
  ConnectionStatus
} from '../models/ws-protocol.types';
import { isWSServerMessage } from '../models/ws-protocol.types';

@Injectable({ providedIn: 'root' })
export class WsClientService {
  private ws?: WebSocket;
  private readonly wsUrl = `${environment.wsBaseUrl}/ws`;

  // Connection status signal
  readonly connectionStatus = signal<ConnectionStatus>('disconnected');

  // Message stream
  private messagesSubject = new Subject<WSServerMessage>();
  readonly messages$ = this.messagesSubject.asObservable();

  // Reconnection state
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 30_000; // 30 seconds
  private reconnectTimer?: number;
  private lastRequestId?: string;

  /**
   * Connect to WebSocket server
   * Safe to call multiple times (idempotent)
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[WS] Connection in progress');
      return;
    }

    console.log('[WS] Connecting to', this.wsUrl);
    this.connectionStatus.set('connecting');

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected successfully');
        this.connectionStatus.set('connected');
        this.reconnectAttempts = 0;

        // Resubscribe to last requestId if we had one
        if (this.lastRequestId) {
          console.log('[WS] Resubscribing to', this.lastRequestId);
          this.subscribe(this.lastRequestId);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error', error);
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Disconnected', { code: event.code, reason: event.reason });
        this.connectionStatus.set('disconnected');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket', error);
      this.connectionStatus.set('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    console.log('[WS] Disconnecting');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.connectionStatus.set('disconnected');
  }

  /**
   * Subscribe to a request ID
   * Stores lastRequestId for auto-resubscribe on reconnect
   */
  subscribe(requestId: string): void {
    this.lastRequestId = requestId;

    const message: WSClientMessage = {
      type: 'subscribe',
      requestId
    };

    this.send(message);
    console.log('[WS] Subscribed to', requestId);
  }

  /**
   * Send a message to server
   * Safe to call even if not connected (will log and store for retry)
   */
  send(message: WSClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send message', message);
      return;
    }

    try {
      const json = JSON.stringify(message);
      this.ws.send(json);
    } catch (error) {
      console.error('[WS] Failed to send message', error, message);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      // Validate message format
      if (!isWSServerMessage(data)) {
        console.warn('[WS] Invalid message format', data);
        return;
      }

      // Emit validated message
      this.messagesSubject.next(data);
    } catch (error) {
      console.error('[WS] Failed to parse message', error, event.data);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    this.connectionStatus.set('reconnecting');

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}
