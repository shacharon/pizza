/**
 * WebSocket Connection Module
 * 
 * RESPONSIBILITY: ONLY WebSocket lifecycle management
 * - Create/open/close WebSocket connections
 * - Reconnection with exponential backoff + jitter
 * - Ticket fetching and URL construction
 * - Hard vs soft failure classification
 * - Connection state tracking
 * 
 * NO knowledge of: subscribe/unsubscribe, message routing, channels
 * 
 * Reconnection Policy:
 * - Max 10 reconnect attempts for network errors (status=0)
 * - After 10 attempts, stop reconnecting (terminal failure)
 * - Auth errors (401) are terminal immediately
 * - Counter resets on successful connection
 */

import type {
  WSConnectionConfig,
  WSConnectionCallbacks,
  WSTicketProvider,
  ConnectionStatus
} from './ws-types';
import { isHardCloseReason } from './ws-types';

const MAX_RECONNECT_ATTEMPTS = 10;

export class WSConnection {
  private ws?: WebSocket;
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private hardFailureLogged = false;
  private shouldReconnect = true;
  private connectInFlight = false; // Mutex to prevent concurrent connections

  constructor(
    private readonly config: WSConnectionConfig,
    private readonly ticketProvider: WSTicketProvider,
    private readonly callbacks: WSConnectionCallbacks
  ) { }

  /**
   * Connect to WebSocket server
   * Safe to call multiple times (idempotent)
   * 
   * CRITICAL: Fetches a NEW one-time ticket for EVERY connection attempt.
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
    this.callbacks.onStatusChange('connecting');

    try {
      // STEP 1: Ensure JWT exists before requesting ticket
      await this.ticketProvider.ensureAuth();

      // STEP 2: Request NEW one-time ticket (CRITICAL: fetch fresh ticket every time)
      let ticketResponse: any;
      try {
        ticketResponse = await this.ticketProvider.requestTicket();
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
      const wsUrl = `${this.config.wsBaseUrl}/ws?ticket=${encodeURIComponent(ticketResponse.ticket)}`;

      // Safety guard: verify URL contains ticket parameter
      if (!wsUrl.includes('ticket=')) {
        console.error('[WS] CRITICAL: WebSocket URL missing ticket parameter', { wsUrl });
        throw new Error('WebSocket URL must contain ticket parameter');
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.callbacks.onStatusChange('connected');
        this.connectInFlight = false;
        this.reconnectAttempts = 0; // Reset counter on successful connection
        this.shouldReconnect = true;
        this.hardFailureLogged = false;
        this.callbacks.onOpen();
      };

      this.ws.onmessage = (event) => {
        this.callbacks.onMessage(event);
      };

      this.ws.onerror = (error) => {
        // Don't log noisy errors - they're handled in onclose
        this.callbacks.onError(error);
      };

      this.ws.onclose = (event) => {
        const reason = event.reason || '';
        const wasClean = event.wasClean;
        const code = event.code;

        // Always log close to console for debugging
        console.log('[WS] Disconnected', { code, reason, wasClean });

        this.callbacks.onStatusChange('disconnected');
        this.connectInFlight = false;
        this.callbacks.onClose(event);

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
      this.callbacks.onStatusChange('disconnected');
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

      // Check if we've exceeded max reconnect attempts
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[WS] Max reconnect attempts reached - stopping', {
          attempts: this.reconnectAttempts,
          maxAttempts: MAX_RECONNECT_ATTEMPTS
        });
        
        if (!this.hardFailureLogged) {
          console.error('[WS] Hard failure - server unreachable after', MAX_RECONNECT_ATTEMPTS, 'attempts');
          this.hardFailureLogged = true;
        }
        
        this.shouldReconnect = false;
        this.callbacks.onStatusChange('disconnected');
        return;
      }

      // Network error (status=0 or connection refused)
      if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
        console.warn('[WS] Network error - will retry', {
          status: error.status,
          attempt: this.reconnectAttempts + 1,
          maxAttempts: MAX_RECONNECT_ATTEMPTS
        });
      }

      if (error?.status === 503) {
        // Soft failure: service unavailable (Redis down)
        console.warn('[WS] Service unavailable (503) - will retry');
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

    this.callbacks.onStatusChange('disconnected');
  }

  /**
   * Send raw message (used by subscription manager)
   */
  send(json: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(json);
      return true;
    } catch (error) {
      console.error('[WS] Failed to send message', error);
      return false;
    }
  }

  /**
   * Check if connection is open
   */
  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Schedule reconnection with exponential backoff + jitter
   * Backoff: 250ms → 500ms → 1s → 2s → 4s → 5s (max)
   * Jitter: ±25% randomization to prevent thundering herd
   * 
   * Limits: Max 10 attempts for network errors, then stops permanently
   */
  private scheduleReconnect(): void {
    // Check if we've exceeded max reconnect attempts
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] Max reconnect attempts reached - stopping', {
        attempts: this.reconnectAttempts,
        maxAttempts: MAX_RECONNECT_ATTEMPTS
      });
      this.shouldReconnect = false;
      this.callbacks.onStatusChange('disconnected');
      return;
    }

    // Clear any existing timer before scheduling new one
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Exponential backoff: 250ms * 2^attempts, capped at 5s
    const exponentialDelay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    // Add jitter: ±25%
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    // Log reconnection attempt
    console.log(`[WS] Reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    this.callbacks.onStatusChange('reconnecting');

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts++;
      this.connect(); // Fetches NEW ticket every time
    }, delay);
  }
}
