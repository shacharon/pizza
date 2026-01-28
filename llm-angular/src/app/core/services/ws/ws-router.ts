/**
 * WebSocket Router Module
 * 
 * RESPONSIBILITY: ONLY parse and route inbound messages
 * - Parse JSON from MessageEvent
 * - Validate message format with type guards
 * - Log specific message types (sub_ack, sub_nack)
 * - Emit validated messages to callback
 * 
 * NO knowledge of: connection lifecycle, subscriptions, reconnection
 */

import type { WSServerMessage } from './ws-types';
import { isWSServerMessage } from './ws-types';

export interface WSRouterCallbacks {
  onMessage: (message: WSServerMessage) => void;
}

export class WSRouter {
  constructor(private readonly callbacks: WSRouterCallbacks) { }

  /**
   * Handle incoming WebSocket message
   * Parses, validates, logs specific types, and emits
   */
  handleMessage(event: MessageEvent): void {
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
      } else if (data.type === 'assistant') {
        // DEBUG LOG: Assistant message received at WS layer
        console.log('[WS][assistant] received', {
          requestId: data.requestId,
          payloadType: data.type,
          narratorType: data.payload?.type
        });
      }

      // Emit validated message
      this.callbacks.onMessage(data);
    } catch (error) {
      console.error('[WS] Failed to parse message', error, event.data);
    }
  }
}
