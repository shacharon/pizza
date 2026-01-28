/**
 * WebSocket Client Service - Phase 6 + Secure Ticket Auth + Silent Reconnect
 * Manages WebSocket connection, reconnection, and message streaming
 * 
 * Security:
 * - Uses one-time tickets from /api/v1/ws-ticket (no JWT in URL)
 * - Ticket stored in memory only (never localStorage)
 * - CRITICAL: Obtains NEW ticket for EVERY connection attempt (initial + reconnect)
 * - Tickets are one-time use with 30s TTL - NEVER reused
 * 
 * Reconnection:
 * - Silent reconnection with exponential backoff + jitter
 * - Classifies HARD vs SOFT failures (stops reconnect for HARD)
 * - No UI noise for transient failures
 * - Logs structured close reasons to console only
 * - Backoff applies to entire sequence: JWT check → NEW ticket → connect
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
import { isHardCloseReason } from '../models/ws-close-reasons';

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

  // Reconnection state with exponential backoff + jitter
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 5_000; // 5 seconds max
  private readonly baseReconnectDelay = 250; // Start at 250ms
  private reconnectTimer?: number;
  private lastRequestId?: string;
  private hardFailureLogged = false; // Log hard failures only once per page load
  private shouldReconnect = true; // Flag to stop reconnect on hard failures
  private connectInFlight = false; // Mutex: prevent concurrent connect attempts

  /**
   * Connect to WebSocket server
   * Safe to call multiple times (idempotent)
   * 
   * CRITICAL: Fetches a NEW one-time ticket for EVERY connection attempt.
   * - Initial connection: fetches ticket
   * - Every reconnect: fetches NEW ticket (30s TTL, one-time use)
   * - NEVER reuse tickets
   * 
   * Security Flow:
   * 1. Ensure JWT exists (fetch if needed)
   * 2. Request NEW one-time ticket (JWT-protected, 30s TTL)
   * 3. Connect WebSocket with ticket in URL query param
   * 
   * Backoff applies to the entire sequence (JWT + ticket + connect).
   */
  async connect(): Promise<void> {
    // Mutex: prevent concurrent connect attempts
    if (this.connectInFlight) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.connectInFlight = true;
    this.connectionStatus.set('connecting');

    try {
      // STEP 1: Ensure JWT exists before requesting ticket
      await this.authService.getToken();

      // STEP 2: Request NEW one-time ticket (CRITICAL: fetch fresh ticket every time)
      let ticketResponse: any;
      try {
        ticketResponse = await firstValueFrom(this.authApi.requestWSTicket());
      } catch (error: any) {
        // Handle EmptyError as retryable
        if (error?.name === 'EmptyError' || error?.message?.includes('no elements in sequence')) {
          console.warn('[WS] EmptyError fetching ticket - will retry');
          this.scheduleReconnect();
          return;
        }
        throw error; // Re-throw other errors
      }
      
      console.log('[WS] Ticket OK, connecting...');

      // STEP 3: Connect with ticket in URL query param
      const wsUrl = `${this.wsBaseUrl}/ws?ticket=${encodeURIComponent(ticketResponse.ticket)}`;
      
      // Safety guard: verify URL contains ticket parameter
      if (!wsUrl.includes('ticket=')) {
        console.error('[WS] CRITICAL: WebSocket URL missing ticket parameter', { wsUrl });
        throw new Error('WebSocket URL must contain ticket parameter');
      }
      
      this.ws = new WebSocket(wsUrl);


      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.connectionStatus.set('connected');
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;
        this.hardFailureLogged = false;

        // Resubscribe to last requestId if we had one
        if (this.lastRequestId) {
          this.subscribe(this.lastRequestId);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onerror = (error) => {
        // Don't log noisy errors - they're handled in onclose
      };

      this.ws.onclose = (event) => {
        const reason = event.reason || '';
        const wasClean = event.wasClean;
        const code = event.code;

        // Always log close to console for debugging
        console.log('[WS] Disconnected', { code, reason, wasClean });

        this.connectionStatus.set('disconnected');
        this.connectInFlight = false;

        // Classify hard vs soft failures
        if (isHardCloseReason(reason)) {
          // HARD failure: log once and stop reconnecting
          if (!this.hardFailureLogged) {
            console.error('[WS] Hard failure - stopping reconnect', { code, reason, wasClean });
            this.hardFailureLogged = true;
          }
          
          this.shouldReconnect = false;
          return;
        }

        // SOFT failure or unknown: reconnect with backoff
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error: any) {
      console.error('[WS] Connection error', error);
      this.connectionStatus.set('disconnected');
      this.connectInFlight = false;
      
      // Classify ticket request failures
      if (error?.status === 401) {
        // Hard failure: auth error (JWT invalid/missing sessionId)
        const errorCode = error?.error?.code;
        console.error('[WS] Hard failure - auth error', { status: 401, code: errorCode });
        
        if (!this.hardFailureLogged) {
          console.error('[WS] Ticket request failed: 401 UNAUTHORIZED - stopping reconnect');
          this.hardFailureLogged = true;
        }
        
        this.shouldReconnect = false;
        return;
      }
      
      if (error?.status === 503) {
        // Soft failure: service unavailable (Redis down)
        console.warn('[WS] Service unavailable (503) - will retry');
        // Continue to reconnect with backoff
      }
      
      // Only reconnect if we haven't hit a hard failure
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false; // Explicit disconnect stops auto-reconnect

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

      // CTO-grade: Log sub_ack/sub_nack messages
      if (data.type === 'sub_ack') {
        const ack = data as any;
        console.log('[WS] Subscription acknowledged', {
          channel: ack.channel,
          requestId: ack.requestId,
          pending: ack.pending
        });
      } else if (data.type === 'sub_nack') {
        const nack = data as any;
        console.warn('[WS] Subscription rejected (no socket kill)', {
          channel: nack.channel,
          requestId: nack.requestId,
          reason: nack.reason
        });
      }

      // Emit validated message
      this.messagesSubject.next(data);
    } catch (error) {
      console.error('[WS] Failed to parse message', error, event.data);
    }
  }

  /**
   * Schedule reconnection with exponential backoff + jitter
   * Backoff: 250ms → 500ms → 1s → 2s → 4s → 5s (max)
   * Jitter: ±25% randomization to prevent thundering herd
   * 
   * IMPORTANT: Backoff applies to the ENTIRE connection sequence:
   * - JWT check
   * - NEW ticket request (one-time, 30s TTL)
   * - WebSocket connect
   */
  private scheduleReconnect(): void {
    // Clear any existing timer before scheduling new one
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Exponential backoff: 250ms * 2^attempts, capped at 5s
    const exponentialDelay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    // Add jitter: ±25%
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    // Silent: only log to console, never show in UI
    console.log(`[WS] Reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.connectionStatus.set('reconnecting');

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts++;
      this.connect(); // Fetches NEW ticket every time
    }, delay);
  }
}
