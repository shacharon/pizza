/**
 * Search WebSocket Handler
 * Manages WebSocket connection, subscriptions, and message routing
 */

import { Injectable, inject } from '@angular/core';
import { WsClientService } from '../core/services/ws-client.service';
import type { WSServerMessage } from '../core/models/ws-protocol.types';
import type { SearchResponse } from '../domain/types/search.types';

export interface SearchEventHandlers {
  onSearchResponse: (response: SearchResponse, query: string) => void;
  onError: (message: string) => void;
  onProgress: () => void;
}

@Injectable()
export class SearchWsHandler {
  private readonly wsClient = inject(WsClientService);

  // Connection status
  readonly connectionStatus = this.wsClient.connectionStatus;

  // Ticket unavailable stream (for polling fallback)
  readonly ticketUnavailable$ = this.wsClient.ticketUnavailable$;

  /**
   * Connect to WebSocket
   */
  connect(): void {
    this.wsClient.connect();
  }

  /**
   * Subscribe to WebSocket messages
   */
  subscribeToMessages(handler: (msg: WSServerMessage) => void): void {
    this.wsClient.messages$.subscribe(msg => handler(msg));
  }

  /**
   * Subscribe to channels for a request
   */
  subscribeToRequest(requestId: string, sessionId: string): void {
    // Subscribe to 'search' channel for progress/status/ready
    this.wsClient.subscribe(requestId, 'search', sessionId);
    // Subscribe to 'assistant' channel for narrator messages
    this.wsClient.subscribe(requestId, 'assistant', sessionId);
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
      const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL', 'NUDGE_REFINE', 'SEARCH_FAILED'];

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
      const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL', 'NUDGE_REFINE', 'SEARCH_FAILED'];

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
        // SECURITY: Never display raw error.message from backend
        // Use generic user-facing message to prevent provider error leakage
        const userMessage = 'Something went wrong. Please try again.';
        handlers.onError(userMessage);
        break;
    }
  }
}
