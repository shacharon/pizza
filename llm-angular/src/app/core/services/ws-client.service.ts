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

  // Message stream (PUBLIC API)
  private messagesSubject = new Subject<WSServerMessage>();
  readonly messages$ = this.messagesSubject.asObservable();

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
      onStatusChange: (status) => this.connectionStatus.set(status)
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
      console.warn('[WS] Not connected, cannot send message', message);
      return;
    }

    try {
      const json = JSON.stringify(message);
      this.connection.send(json);
    } catch (error) {
      console.error('[WS] Failed to send message', error, message);
    }
  }

  /**
   * Handle connection open event
   * Auto-resubscribe to last requestId if present
   */
  private handleConnectionOpen(): void {
    const lastRequestId = this.subscriptionManager.getLastRequestId();
    if (lastRequestId) {
      this.subscribe(lastRequestId);
    }
  }
}
