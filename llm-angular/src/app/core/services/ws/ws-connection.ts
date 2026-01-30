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
const MAX_503_RETRY_ATTEMPTS = 5; // Max retries for 503 errors (Redis unavailable)

export class WSConnection {
  private ws?: WebSocket;
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private hardFailureLogged = false;
  private shouldReconnect = true;
  private connectInFlight = false; // Mutex to prevent concurrent connections
  private ticketRequestInFlight = false; // Mutex to prevent concurrent ws-ticket requests
  private redis503Attempts = 0; // Track 503-specific retries
  private pollingFallbackTriggered = false; // Track if we've switched to polling mode

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
      // Mutex: ensure only one ws-ticket request in flight
      let ticketResponse: any;
      try {
        if (this.ticketRequestInFlight) {
          console.warn('[WS] ws-ticket request already in flight, skipping');
          this.connectInFlight = false;
          return;
        }

        this.ticketRequestInFlight = true;
        ticketResponse = await this.ticketProvider.requestTicket();
        this.ticketRequestInFlight = false;
        
        // Reset 503 counter on successful ticket fetch
        this.redis503Attempts = 0;
        this.pollingFallbackTriggered = false;

      } catch (error: any) {
        this.ticketRequestInFlight = false;

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

      if (error?.status === 503 || error?.error?.code === 'WS_TICKET_REDIS_UNAVAILABLE') {
        // Special handling for 503: Redis unavailable
        // Use slower backoff (2s, 4s, 8s, max 30s) and switch to polling mode
        this.redis503Attempts++;
        
        const retryAfter = error?.error?.retryAfter || 2;
        
        console.warn('[WS] ws-ticket unavailable (503) - Redis not ready', {
          attempt: this.redis503Attempts,
          maxAttempts: MAX_503_RETRY_ATTEMPTS,
          retryAfter: `${retryAfter}s`
        });

        // Switch to polling mode immediately on first 503
        if (!this.pollingFallbackTriggered && this.callbacks.onTicketUnavailable) {
          this.pollingFallbackTriggered = true;
          this.callbacks.onTicketUnavailable();
          console.log('[WS] Switched to polling mode (ws-ticket unavailable)');
        }

        // Stop retrying after max attempts
        if (this.redis503Attempts >= MAX_503_RETRY_ATTEMPTS) {
          console.error('[WS] Max 503 retry attempts reached - stopping ws-ticket requests', {
            attempts: this.redis503Attempts
          });
          this.shouldReconnect = false;
          this.callbacks.onStatusChange('disconnected');
          return;
        }

        // Schedule retry with 503-specific backoff (2s, 4s, 8s, max 30s)
        if (this.shouldReconnect) {
          this.scheduleReconnect503();
        }
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

  /**
   * Schedule reconnection for 503 errors (Redis unavailable)
   * Backoff: 2s → 4s → 8s → 16s → 30s (max)
   * Jitter: ±25% randomization to prevent thundering herd
   * 
   * Limits: Max 5 attempts, then stops permanently
   * Note: Polling mode is activated immediately on first 503
   */
  private scheduleReconnect503(): void {
    // Clear any existing timer before scheduling new one
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Exponential backoff starting at 2s: 2s * 2^(attempts-1), capped at 30s
    const baseDelay = 2000; // 2s
    const maxDelay = 30000; // 30s
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, this.redis503Attempts - 1),
      maxDelay
    );

    // Add jitter: ±25%
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    // Log retry attempt (quieter than normal reconnects - polling is active)
    console.log(`[WS] ws-ticket retry in ${Math.round(delay/1000)}s (attempt ${this.redis503Attempts}/${MAX_503_RETRY_ATTEMPTS}, polling active)`);

    this.callbacks.onStatusChange('reconnecting');

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect(); // Try fetching ticket again
    }, delay);
  }
}
