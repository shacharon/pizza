/**
 * WebSocket Client Service - SOLID Refactored Facade
 * 
 * PUBLIC API: Thin facade that delegates to SOLID modules
 * - Maintains 100% backward compatibility
 * - No public API changes (methods, signatures, observables, DI)
 * - Delegates to: WSConnection, WSRouter, WSSubscriptionManager
 * 
 * Architecture:
 * - ws-connection.ts: WebSocket lifecycle + reconnection
 * - ws-router.ts: Parse + route inbound messages
 * - ws-subscriptions.ts: Subscribe/unsubscribe management
 * - ws-types.ts: Shared types + type guards
 */

import { Injectable, signal, inject } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { throttleTime, asyncScheduler } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';
import { AuthService } from '../auth/auth.service';
import type {
  WSClientMessage,
  WSServerMessage,
  ConnectionStatus,
  WSChannel
} from '../models/ws-protocol.types';
import { WSConnection } from './ws/ws-connection';
import { WSRouter } from './ws/ws-router';
import { WSSubscriptionManager } from './ws/ws-subscriptions';
import type {
  WSConnectionConfig,
  WSConnectionCallbacks,
  WSTicketProvider,
  WSTicketResponse,
  WSSubscribeParams
} from './ws/ws-types';

@Injectable({ providedIn: 'root' })
export class WsClientService {
  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);

  // Connection status signal (PUBLIC API)
  readonly connectionStatus = signal<ConnectionStatus>('disconnected');

  // Polling fallback signal (PUBLIC API)
  // Emitted when ws-ticket returns 503 (Redis unavailable)
  // Triggers immediate switch to polling mode for active searches
  private ticketUnavailableSubject = new Subject<void>();
  readonly ticketUnavailable$ = this.ticketUnavailableSubject.asObservable();

  // Message stream (PUBLIC API)
  // P0-3: Apply backpressure throttling to prevent memory blowups on message bursts
  // - Throttles to max 10 messages/sec (100ms window)
  // - leading:true ensures first message is processed immediately
  // - trailing:true ensures last message in burst is not dropped
  // - Critical events (DONE_SUCCESS, RESULTS) are preserved due to trailing behavior
  private messagesSubject = new Subject<WSServerMessage>();
  readonly messages$ = this.messagesSubject.asObservable().pipe(
    throttleTime(100, asyncScheduler, { leading: true, trailing: true })
  );

  // SOLID Modules (internal)
  private readonly connection: WSConnection;
  private readonly router: WSRouter;
  private readonly subscriptionManager: WSSubscriptionManager;

  constructor() {
    // Ticket provider adapter (bridges Angular DI to plain TS modules)
    const ticketProvider: WSTicketProvider = {
      requestTicket: async (): Promise<WSTicketResponse> => {
        return await firstValueFrom(this.authApi.requestWSTicket());
      },
      ensureAuth: async (): Promise<void> => {
        await this.authService.getToken();
      }
    };

    // Connection config
    const config: WSConnectionConfig = {
      wsBaseUrl: environment.wsBaseUrl,
      baseReconnectDelay: 250,
      maxReconnectDelay: 5_000
    };

    // Connection callbacks
    const connectionCallbacks: WSConnectionCallbacks = {
      onOpen: () => this.handleConnectionOpen(),
      onMessage: (event) => this.router.handleMessage(event),
      onClose: (event) => { /* handled internally by connection */ },
      onError: (event) => { /* handled internally by connection */ },
      onStatusChange: (status) => this.connectionStatus.set(status),
      onTicketUnavailable: () => this.ticketUnavailableSubject.next()
    };

    // Router callbacks
    const routerCallbacks = {
      onMessage: (message: WSServerMessage) => this.messagesSubject.next(message)
    };

    // Instantiate modules
    this.connection = new WSConnection(config, ticketProvider, connectionCallbacks);
    this.router = new WSRouter(routerCallbacks);
    this.subscriptionManager = new WSSubscriptionManager(this.connection);
  }

  /**
   * Connect to WebSocket server (PUBLIC API)
   * Safe to call multiple times (idempotent)
   */
  async connect(): Promise<void> {
    await this.connection.connect();
  }

  /**
   * Disconnect from WebSocket server (PUBLIC API)
   */
  disconnect(): void {
    this.connection.disconnect();
  }

  /**
   * Subscribe to a request ID (PUBLIC API)
   * Stores lastRequestId for auto-resubscribe on reconnect
   * @param requestId - Request ID to subscribe to
   * @param channel - Channel to subscribe to ('search' or 'assistant')
   * @param sessionId - Optional session ID
   */
  subscribe(requestId: string, channel: 'search' | 'assistant' = 'search', sessionId?: string): void {
    const params: WSSubscribeParams = { requestId, channel, sessionId };
    this.subscriptionManager.subscribe(params);
  }

  /**
   * Unsubscribe from a request ID (PUBLIC API)
   */
  unsubscribe(requestId: string, channel: 'search' | 'assistant' = 'search', sessionId?: string): void {
    const params: WSSubscribeParams = { requestId, channel, sessionId };
    this.subscriptionManager.unsubscribe(params);
  }

  /**
   * Send a message to server (PUBLIC API)
   * Safe to call even if not connected (will log and store for retry)
   */
  send(message: WSClientMessage): void {
    if (!this.connection.isOpen()) {
      console.warn('[WS] Not connected, cannot send message');
      return;
    }

    try {
      const json = JSON.stringify(message);
      this.connection.send(json);
    } catch (error) {
      console.error('[WS] Failed to send message', error);
    }
  }

  /**
   * Handle connection open event
   * P0 Scale Safety: Auto-resubscribe to lastRequestId on reconnect (ECS task failover)
   * Ensures polling fallback continues if WS was primary delivery method
   */
  private handleConnectionOpen(): void {
    const lastRequestId = this.subscriptionManager.getLastRequestId();
    if (lastRequestId) {
      console.log('[WS] Reconnected - auto-resubscribing to last request', { requestId: lastRequestId });
      // Resubscribe to both search and assistant channels
      this.subscribe(lastRequestId, 'search');
      this.subscribe(lastRequestId, 'assistant');
    }
  }
}
