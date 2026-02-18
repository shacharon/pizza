/**
 * Search WebSocket Handler
 * Manages WebSocket connection, subscriptions, and message routing
 */

import { Injectable, inject, NgZone } from '@angular/core';
import { WsClientService } from '../core/services/ws-client.service';
import { AuthService } from '../core/auth/auth.service';
import { AssistantSseService } from '../core/services/assistant-sse.service';
import type { WSServerMessage, AssistantStatus } from '../core/models/ws-protocol.types';
import type { SearchResponse } from '../domain/types/search.types';
import { environment } from '../../environments/environment';
import type { Subscription } from 'rxjs';

export interface SearchEventHandlers {
  onSearchResponse: (response: SearchResponse, query: string) => void;
  onError: (message: string) => void;
  onProgress: () => void;
}

@Injectable()
export class SearchWsHandler {
  private readonly wsClient = inject(WsClientService);
  private readonly authService = inject(AuthService);
  private readonly assistantSse = inject(AssistantSseService);
  private readonly ngZone = inject(NgZone);

  // Track SSE subscription for cleanup
  private sseSubscription: Subscription | null = null;

  // Connection status
  readonly connectionStatus = this.wsClient.connectionStatus;

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    await this.wsClient.connect();
  }

  /**
   * Ensure WebSocket is connected and authenticated
   * Blocks until ready for subscriptions
   */
  async ensureConnected(): Promise<void> {
    await this.wsClient.ensureWsAuthed();
  }

  /**
   * Subscribe to WebSocket messages
   */
  subscribeToMessages(handler: (msg: WSServerMessage) => void): void {
    this.wsClient.messages$.subscribe(msg => handler(msg));
  }

  /**
   * Subscribe to channels for a request
   * CRITICAL: Uses JWT sessionId from localStorage (same as HTTP requests)
   * Ensures WS is connected and authenticated before subscribing
   * @param requestId - The search request ID to subscribe to
   * @param _legacySessionId - DEPRECATED, not used (kept for backward compatibility)
   * @param assistantHandler - Optional handler for assistant messages (for SSE routing and streaming)
   * @param onTerminalAssistantMessage - Optional callback when SSE delivers CLARIFY/GATE_FAIL/SUMMARY (same side effects as WS assistant path)
   */
  async subscribeToRequest(
    requestId: string,
    _legacySessionId?: string,
    assistantHandler?: {
      routeMessage: (type: any, message: string, requestId: string, payload: any) => void;
      setMessage: (message: string, requestId?: string, blocksSearch?: boolean, resetAnimation?: boolean) => void;
      setStatus: (status: AssistantStatus) => void;
    },
    onTerminalAssistantMessage?: (payload: { type: string; message?: string; question?: string | null; blocksSearch?: boolean }) => void
  ): Promise<void> {
    // STEP 1: Ensure WS is connected and authenticated (blocks until ready)
    try {
      console.log('[SearchWsHandler] Ensuring WS auth before subscribe', {
        requestId: requestId.substring(0, 20) + '...',
        timestamp: new Date().toISOString()
      });
      await this.ensureConnected();
      console.log('[SearchWsHandler] WS auth confirmed, proceeding with subscribe', {
        requestId: requestId.substring(0, 20) + '...',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[SearchWsHandler] Failed to connect WS, cannot subscribe', {
        requestId,
        error,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // STEP 2: Get JWT sessionId from localStorage (same as HTTP requests)
    const jwtSessionId = this.authService.getSessionId();

    // Guard: Prevent subscribing with empty/anonymous session
    if (!jwtSessionId) {
      console.error('[SearchWsHandler] CRITICAL: Cannot subscribe without JWT sessionId', {
        requestId,
        hint: 'Ensure AuthService.getToken() is called before subscribing'
      });
      return;
    }

    // Log for debugging session_mismatch issues
    console.log('[SearchWsHandler] Subscribing with JWT sessionId', {
      requestId: requestId.substring(0, 20) + '...',
      sessionId: jwtSessionId.substring(0, 20) + '...'
    });

    // STEP 3: Subscribe to channels (now guaranteed to have auth)
    // Subscribe to 'search' channel for progress/status/ready
    this.wsClient.subscribe(requestId, 'search', jwtSessionId);

    // FEATURE FLAG: Use SSE for assistant if enabled
    const useSseAssistant = environment.features?.useSseAssistant ?? false;

    if (useSseAssistant && assistantHandler) {
      console.log('[SearchWsHandler] Using SSE for assistant (WS assistant disabled)', { requestId: requestId.substring(0, 20) + '...' });

      // Clean up previous SSE subscription
      this.cleanupSse();

      // Accumulated text for streaming
      let streamedText = '';
      let isFirstDelta = true; // Track if this is the first delta (to replace narration)

      // Subscribe to SSE for assistant messages (streaming: narration → delta* → done)
      // Run updates inside NgZone so each chunk triggers change detection (avoids "one chunk" feel)
      this.sseSubscription = this.assistantSse.connect(requestId).subscribe({
        next: (event) => {
          this.ngZone.run(() => {
            if (event.type === 'narration') {
              streamedText = event.data.text ?? '';
              isFirstDelta = true; // Reset for new stream
              assistantHandler.setMessage(streamedText, requestId);
              assistantHandler.setStatus('streaming');
              console.log('[SearchWsHandler] SSE narration', { requestId: requestId.substring(0, 20) + '...', preview: streamedText.substring(0, 40) + '...' });
            } else if (event.type === 'delta') {
              const chunk = event.data.text ?? '';
              
              // First delta replaces narration (summary starts)
              const isFirstChunk = isFirstDelta;
              if (isFirstDelta) {
                streamedText = chunk;
                isFirstDelta = false;
              } else {
                streamedText += chunk;
              }
              
              // Reset animation on first delta to clear narration smoothly
              assistantHandler.setMessage(streamedText, requestId, undefined, isFirstChunk);
              assistantHandler.setStatus('streaming');
              console.log('[SearchWsHandler] SSE delta', { 
                requestId: requestId.substring(0, 20) + '...', 
                chunkLength: chunk.length,
                totalLength: streamedText.length,
                isFirst: !isFirstDelta,
                preview: streamedText.substring(Math.max(0, streamedText.length - 50))
              });
            } else if (event.type === 'message') {
              // Legacy: single full message (CLARIFY / GATE_FAIL / SUMMARY from SSE)
              const payload = event.data;
              console.log('[SearchWsHandler] SSE assistant message (legacy)', {
                type: payload.type,
                requestId: requestId.substring(0, 20) + '...',
                preview: payload.message?.substring(0, 50) + '...'
              });
              assistantHandler.routeMessage(
                payload.type,
                payload.message,
                requestId,
                {
                  question: payload.question,
                  blocksSearch: payload.blocksSearch,
                  language: payload.language as any,
                  ts: Date.now()
                }
              );
              // Same side effects as WS assistant path: clear loading, card state, cancel polling
              if (onTerminalAssistantMessage) {
                onTerminalAssistantMessage({
                  type: payload.type,
                  message: payload.message,
                  question: payload.question ?? null,
                  blocksSearch: payload.blocksSearch
                });
              }
            } else if (event.type === 'done') {
              // Keep showing streamed text in legacy slot; do NOT add a card so we avoid
              // switching to multi-message mode and re-animating (which made text disappear then animate again).
              if (streamedText.length > 0) {
                assistantHandler.setMessage(streamedText, requestId);
              }
              assistantHandler.setStatus('completed');
              streamedText = '';
              console.log('[SearchWsHandler] SSE complete', { requestId: requestId.substring(0, 20) + '...' });
            } else if (event.type === 'error') {
              console.error('[SearchWsHandler] SSE error', event.data);
            }
          });
        },
        error: (err) => {
          console.error('[SearchWsHandler] SSE connection error', err);
        },
        complete: () => {
          console.log('[SearchWsHandler] SSE connection closed', { requestId: requestId.substring(0, 20) + '...' });
        }
      });
    } else {
      // Fallback: Use WebSocket for assistant (legacy)
      console.log('[SearchWsHandler] Using WS for assistant (legacy)', { requestId: requestId.substring(0, 20) + '...' });
      this.wsClient.subscribe(requestId, 'assistant', jwtSessionId);
    }
  }

  /**
   * Clean up SSE subscription
   */
  private cleanupSse(): void {
    if (this.sseSubscription) {
      console.log('[SearchWsHandler] Cleaning up previous SSE subscription');
      this.sseSubscription.unsubscribe();
      this.sseSubscription = null;
    }
  }

  /**
   * Clear all active subscriptions
   * Used when starting a new search to prevent stale messages
   */
  clearAllSubscriptions(): void {
    this.wsClient.clearAllSubscriptions();
    this.cleanupSse();
  }

  /**
   * Handle incoming WebSocket message
   * Returns true if message was handled, false if should be passed to other handlers
   */
  handleMessage(
    msg: WSServerMessage,
    currentRequestId: string | undefined,
    handlers: {
      onSubAck?: (msg: any) => void;
      onSubNack?: (msg: any) => void;
      onAssistantMessage?: (msg: any) => void;
      onSearchEvent?: (event: any) => void;
      onLegacyMessage?: (msg: WSServerMessage) => void;
    }
  ): boolean {
    // DISABLED: Block ws_status messages from reaching UI
    // ws_status events are now blocked entirely - no connection status in UI
    if ((msg as any).type === 'ws_status') {
      console.debug('[SearchWsHandler] ws_status event blocked (no UI display):', (msg as any).state);
      // Consume the message - don't pass to any handlers
      return true;
    }

    // REQUESTID SCOPING: Ignore messages for old/different requests
    // Only process messages that match the current active requestId
    if ('requestId' in msg && (msg as any).requestId) {
      const msgRequestId = (msg as any).requestId;

      // No active search - ignore all request-specific messages
      if (!currentRequestId) {
        console.debug('[SearchWsHandler] Ignoring message - no active search', { msgRequestId });
        return true;
      }

      // Different requestId - ignore (old search)
      if (msgRequestId !== currentRequestId) {
        console.debug('[SearchWsHandler] Ignoring message from old request', {
          msgRequestId,
          currentRequestId
        });
        return true;
      }
    }

    // Handle sub_ack
    if ((msg as any).type === 'sub_ack') {
      const ack = msg as any;
      console.log('[SearchWsHandler] Subscription acknowledged', {
        channel: ack.channel,
        requestId: ack.requestId,
        pending: ack.pending
      });
      if (handlers.onSubAck) handlers.onSubAck(ack);
      return true;
    }

    // Handle sub_nack
    if ((msg as any).type === 'sub_nack') {
      const nack = msg as any;
      console.warn('[SearchWsHandler] Subscription rejected', {
        channel: nack.channel,
        requestId: nack.requestId,
        reason: nack.reason
      });
      if (handlers.onSubNack) handlers.onSubNack(nack);
      return true;
    }

    // DEDUP FIX: Handle assistant messages with strict validation
    // Only messages with type='assistant' AND valid payload.type should be processed
    if ((msg as any).type === 'assistant' && 'payload' in (msg as any)) {
      const payload = (msg as any).payload;
      const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];

      // Validate payload has proper assistant type
      if (payload && payload.type && validTypes.includes(payload.type)) {
        console.log('[WS][assistant] Valid LLM message:', payload.type, { requestId: (msg as any).requestId });
        if (handlers.onAssistantMessage) handlers.onAssistantMessage(msg);
        return true;
      } else {
        console.log('[WS][assistant] Ignoring non-LLM message:', payload?.type || 'unknown');
        return true; // Consumed but not processed
      }
    }

    // Handle assistant channel messages (legacy with channel field)
    if ('channel' in (msg as any) && (msg as any).channel === 'assistant') {
      const payload = (msg as any).payload;
      const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];

      // Validate legacy format also has proper type
      if (payload && payload.type && validTypes.includes(payload.type)) {
        console.log('[SearchWsHandler] Valid LLM assistant message on assistant channel');
        if (handlers.onAssistantMessage) handlers.onAssistantMessage(msg);
        return true;
      } else {
        console.log('[SearchWsHandler] Ignoring non-LLM message on assistant channel');
        return true; // Consumed but not processed
      }
    }

    // Handle search contract events
    if ('channel' in msg && msg.channel === 'search') {
      if (handlers.onSearchEvent) handlers.onSearchEvent(msg as any);
      return true;
    }

    // Pass to legacy handler
    if (handlers.onLegacyMessage) {
      handlers.onLegacyMessage(msg);
    }
    return false;
  }

  /**
   * Handle search contract event
   */
  handleSearchEvent(
    event: import('../contracts/search.contracts').WsSearchEvent,
    handlers: SearchEventHandlers,
    fetchResult: (requestId: string) => Promise<SearchResponse | null>,
    cancelPollingStart: () => void,
    cancelPolling: () => void,
    currentQuery: string
  ): void {
    const requestId = event.requestId;

    switch (event.type) {
      case 'progress':
        console.log('[SearchWsHandler] WS progress:', event.stage, event.message);
        // Cancel polling start - WS is working
        cancelPollingStart();
        handlers.onProgress();
        break;

      case 'ready':
        console.log('[SearchWsHandler] WS ready:', event.ready, event.resultUrl);
        if (event.ready === 'results') {
          // Stop all polling
          cancelPolling();

          // Fetch results
          fetchResult(requestId)
            .then(response => {
              if (response) {
                handlers.onSearchResponse(response, currentQuery);
              }
            })
            .catch(error => {
              console.error('[SearchWsHandler] WS-triggered fetch failed:', error);
              handlers.onError('Failed to fetch results');
            });
        }
        break;

      case 'error':
        console.error('[SearchWsHandler] WS search error:', event.code, event.message);
        cancelPolling();
        handlers.onError(event.message);
        break;
    }
  }
}
