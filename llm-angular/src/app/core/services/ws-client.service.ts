/**
 * WebSocket Client Service - Phase 6 + Secure Ticket Auth
 * Manages WebSocket connection, reconnection, and message streaming
 * 
 * Security:
 * - Uses one-time tickets from /api/v1/ws-ticket (no JWT in URL)
 * - Ticket stored in memory only (never localStorage)
 * - Obtains new ticket for each connection attempt
 */

import { Injectable, signal, inject } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';
import { AuthService } from '../auth/auth.service';
import type {
  WSClientMessage,
  WSServerMessage,
  ConnectionStatus,
  WSChannel
} from '../models/ws-protocol.types';
import { isWSServerMessage } from '../models/ws-protocol.types';

@Injectable({ providedIn: 'root' })
export class WsClientService {
  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);
  private ws?: WebSocket;
  private readonly wsBaseUrl = environment.wsBaseUrl;


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
   * 
   * Security: Obtains one-time ticket before connecting (no JWT in localStorage)
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[WS] Connection in progress');
      return;
    }

    this.connectionStatus.set('connecting');

    try {
      // Get JWT token from AuthService (cached or fetch)
      console.log('[WS] Getting JWT token...');
      const authToken = await this.authService.getToken();
      
      if (!authToken) {
        console.error('[WS] No auth token available');
        this.connectionStatus.set('disconnected');
        this.scheduleReconnect();
        return;
      }

      // Request one-time ticket from server (secure HTTP with Authorization header)
      console.log('[WS] Requesting ticket...');
      const ticketResponse = await firstValueFrom(this.authApi.requestWSTicket(authToken));
      
      console.log('[WS] Ticket obtained, connecting...');

      // Connect with ticket (NOT JWT)
      const wsUrl = `${this.wsBaseUrl}/ws?ticket=${encodeURIComponent(ticketResponse.ticket)}`;
      this.ws = new WebSocket(wsUrl);


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
      console.error('[WS] Failed to connect', error);
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
   * Subscribe to a request ID (using canonical envelope)
   * Stores lastRequestId for auto-resubscribe on reconnect
   * @param requestId - Request ID to subscribe to
   * @param channel - Channel to subscribe to ('search' or 'assistant')
   * @param sessionId - Optional session ID
   */
  subscribe(requestId: string, channel: 'search' | 'assistant' = 'search', sessionId?: string): void {
    this.lastRequestId = requestId;

    // Build canonical message (only include sessionId if provided)
    const message: any = {
      v: 1,
      type: 'subscribe',
      channel,
      requestId
    };

    if (sessionId) {
      message.sessionId = sessionId;
    }

    this.send(message as WSClientMessage);
    console.log('[WS] Subscribed to', { requestId, channel, sessionId });
  }

  /**
   * Unsubscribe from a request ID
   */
  unsubscribe(requestId: string, channel: 'search' | 'assistant' = 'search', sessionId?: string): void {
    // Build canonical message (only include sessionId if provided)
    const message: any = {
      v: 1,
      type: 'unsubscribe',
      channel,
      requestId
    };

    if (sessionId) {
      message.sessionId = sessionId;
    }

    this.send(message as WSClientMessage);
    console.log('[WS] Unsubscribed from', { requestId, channel, sessionId });
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
