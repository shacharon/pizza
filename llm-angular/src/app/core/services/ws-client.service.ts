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

  // Auth tracking (internal)
  private connectionPromise: Promise<void> | null = null;
  private isAuthenticated = false;

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
      onClose: (event) => this.handleConnectionClose(),
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
    // Return existing promise if connection is in progress
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Create new connection promise
    this.connectionPromise = this.connection.connect()
      .then(() => {
        this.isAuthenticated = true;
        console.log('[WsClient] Connection authenticated');
      })
      .catch((error) => {
        console.error('[WsClient] Connection failed', error);
        this.connectionPromise = null;
        this.isAuthenticated = false;
        throw error;
      });

    return this.connectionPromise;
  }

  /**
   * Ensure WebSocket is connected and authenticated (PUBLIC API)
   * Blocks until connection is ready for subscriptions
   * @returns Promise that resolves when WS is ready
   */
  async ensureWsAuthed(): Promise<void> {
    // If already authenticated and connected, return immediately
    if (this.isAuthenticated && this.connection.isOpen()) {
      return;
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      await this.connectionPromise;
      return;
    }

    // Otherwise, initiate connection
    await this.connect();
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
   * Clear all active subscriptions (PUBLIC API)
   * Used when starting a new search to prevent stale messages
   */
  clearAllSubscriptions(): void {
    this.subscriptionManager.clearAllSubscriptions();
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
   * Auto-resubscribe to last requestId if present (with sessionId)
   */
  private handleConnectionOpen(): void {
    this.isAuthenticated = true;
    console.log('[WsClient] Connection open and authenticated');
    
    const lastRequestId = this.subscriptionManager.getLastRequestId();
    if (lastRequestId) {
      // CRITICAL: Get sessionId before auto-resubscribe (prevent anonymous subscribe)
      const sessionId = this.authService.getSessionId();
      if (sessionId) {
        console.log('[WsClient] Auto-resubscribing with sessionId', {
          requestId: lastRequestId.substring(0, 20) + '...',
          sessionIdPreview: sessionId.substring(0, 8) + '...'
        });
        this.subscribe(lastRequestId, 'search', sessionId);
      } else {
        console.warn('[WsClient] Cannot auto-resubscribe: no valid sessionId', {
          requestId: lastRequestId.substring(0, 20) + '...'
        });
      }
    }
  }

  /**
   * Handle connection close event
   * Reset auth state
   */
  private handleConnectionClose(): void {
    this.isAuthenticated = false;
    this.connectionPromise = null;
    console.log('[WsClient] Connection closed, auth reset');
  }
}
