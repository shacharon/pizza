/**
 * WebSocket Subscriptions Module
 * 
 * RESPONSIBILITY: ONLY manage subscribe/unsubscribe logic
 * - Build canonical subscribe/unsubscribe message envelopes
 * - Track lastRequestId for auto-resubscribe on reconnect
 * - Send messages via connection interface
 * 
 * NO knowledge of: WebSocket lifecycle, message routing, reconnection
 */

import type { WSClientMessage, WSSubscribeParams } from './ws-types';

export interface WSConnectionSender {
  send(json: string): boolean;
  isOpen(): boolean;
}

export class WSSubscriptionManager {
  private lastRequestId?: string;

  constructor(private readonly connection: WSConnectionSender) {}

  /**
   * Subscribe to a request ID (using canonical envelope)
   * Stores lastRequestId for auto-resubscribe on reconnect
   */
  subscribe(params: WSSubscribeParams): void {
    this.lastRequestId = params.requestId;

    // Build canonical message (only include sessionId if provided)
    const message: any = {
      v: 1,
      type: 'subscribe',
      channel: params.channel,
      requestId: params.requestId
    };

    if (params.sessionId) {
      message.sessionId = params.sessionId;
    }

    this.send(message as WSClientMessage);
    console.log('[WS] Subscribed to', { 
      requestId: params.requestId, 
      channel: params.channel, 
      sessionId: params.sessionId 
    });
  }

  /**
   * Unsubscribe from a request ID
   */
  unsubscribe(params: WSSubscribeParams): void {
    // Build canonical message (only include sessionId if provided)
    const message: any = {
      v: 1,
      type: 'unsubscribe',
      channel: params.channel,
      requestId: params.requestId
    };

    if (params.sessionId) {
      message.sessionId = params.sessionId;
    }

    this.send(message as WSClientMessage);
    console.log('[WS] Unsubscribed from', { 
      requestId: params.requestId, 
      channel: params.channel, 
      sessionId: params.sessionId 
    });
  }

  /**
   * Get last subscribed requestId (for auto-resubscribe)
   */
  getLastRequestId(): string | undefined {
    return this.lastRequestId;
  }

  /**
   * Send a message via connection
   * Safe to call even if not connected (will log and return false)
   */
  private send(message: WSClientMessage): void {
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
}
