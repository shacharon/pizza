/**
 * WebSocket Subscriptions Module
 *
 * RESPONSIBILITY: ONLY manage subscribe/unsubscribe logic
 * - Build canonical subscribe/unsubscribe message envelopes
 * - Track subscriptions for auto-resubscribe on reconnect
 * - Queue subscribe/unsubscribe messages when not connected
 * - Drain queued + resubscribe on reconnect (idempotent)
 *
 * NO knowledge of: WebSocket lifecycle, message routing, reconnection strategy
 */

import type { WSClientMessage, WSSubscribeParams } from './ws-types';

export interface WSConnectionSender {
  send(json: string): boolean;
  isOpen(): boolean;
}

type SubscriptionKey = string;

type SubscriptionRecord = {
  requestId: string;
  channel: string;
  sessionId?: string;
};

type PendingActionType = 'subscribe' | 'unsubscribe';

type PendingAction = {
  type: PendingActionType;
  key: SubscriptionKey;
  message: WSClientMessage;
  ts: number;
};

export class WSSubscriptionManager {
  private lastRequestId?: string;

  // Desired/current subscriptions (client intent)
  private readonly subscriptions = new Map<SubscriptionKey, SubscriptionRecord>();

  // Pending actions to send once connection is open
  // Map => last action wins per key (dedupe)
  private readonly pending = new Map<SubscriptionKey, PendingAction>();

  constructor(private readonly connection: WSConnectionSender) { }

  /**
   * Subscribe to a request ID (using canonical envelope)
   * - Records subscription intent
   * - Sends immediately if connected, otherwise queues for later
   */
  subscribe(params: WSSubscribeParams): void {
    this.lastRequestId = params.requestId;

    const key = this.makeKey(params);
    this.subscriptions.set(key, {
      requestId: params.requestId,
      channel: params.channel,
      sessionId: params.sessionId,
    });

    const message = this.buildMessage('subscribe', params);

    this.sendOrQueue('subscribe', key, message);

    console.log('[WS] Subscribed to', {
      requestId: params.requestId,
      channel: params.channel,
      sessionId: params.sessionId,
    });
  }

  /**
   * Unsubscribe from a request ID
   * - Removes subscription intent
   * - Sends immediately if connected, otherwise queues for later
   */
  unsubscribe(params: WSSubscribeParams): void {
    const key = this.makeKey(params);
    this.subscriptions.delete(key);

    const message = this.buildMessage('unsubscribe', params);

    this.sendOrQueue('unsubscribe', key, message);

    console.log('[WS] Unsubscribed from', {
      requestId: params.requestId,
      channel: params.channel,
      sessionId: params.sessionId,
    });
  }

  /**
   * Auto-resubscribe entrypoint to be called by connection layer on WS open.
   * Idempotent:
   * - Drains pending actions first (subscribe/unsubscribe that were queued)
   * - Then re-sends subscribe for all active subscriptions (safe if server dedupes)
   */
  onConnected(): void {
    if (!this.connection.isOpen()) return;

    // 1) Drain pending (last action per key)
    if (this.pending.size > 0) {
      const actions = Array.from(this.pending.values()).sort((a, b) => a.ts - b.ts);
      this.pending.clear();

      for (const action of actions) {
        this.trySend(action.message);
      }
    }

    // 2) Re-subscribe all active intents (idempotent)
    for (const sub of this.subscriptions.values()) {
      const msg = this.buildMessage('subscribe', sub);
      this.trySend(msg);
    }
  }

  /**
   * Get last subscribed requestId (for auto-resubscribe)
   */
  getLastRequestId(): string | undefined {
    return this.lastRequestId;
  }

  /**
   * Clear all active subscriptions
   * Used when starting a new search to prevent stale messages
   */
  clearAllSubscriptions(): void {
    // Unsubscribe from all active subscriptions
    for (const sub of this.subscriptions.values()) {
      const message = this.buildMessage('unsubscribe', {
        requestId: sub.requestId,
        channel: sub.channel as 'search' | 'assistant',
        sessionId: sub.sessionId
      });
      this.sendOrQueue('unsubscribe', this.makeKey(sub as any), message);
    }
    
    // Clear subscription tracking
    this.subscriptions.clear();
    this.pending.clear();
    
    console.log('[WS] Cleared all subscriptions');
  }

  /**
   * Optional debug helpers
   */
  getActiveSubscriptionsCount(): number {
    return this.subscriptions.size;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Internal helpers
   */
  private buildMessage(
    type: 'subscribe' | 'unsubscribe',
    params: { channel: string; requestId: string; sessionId?: string }
  ): WSClientMessage {
    const message: any = {
      v: 1,
      type,
      channel: params.channel,
      requestId: params.requestId,
    };

    if (params.sessionId) {
      message.sessionId = params.sessionId;
    }

    return message as WSClientMessage;
  }

  private makeKey(params: { channel: string; requestId: string; sessionId?: string }): SubscriptionKey {
    // Include sessionId in key to avoid cross-session collisions in dev/hot-reload
    // If your server ignores sessionId for routing, this is still safe client-side.
    return `${params.channel}::${params.requestId}::${params.sessionId ?? ''}`;
  }

  private sendOrQueue(actionType: PendingActionType, key: SubscriptionKey, message: WSClientMessage): void {
    if (!this.connection.isOpen()) {
      // Queue last action wins per key
      this.pending.set(key, { type: actionType, key, message, ts: Date.now() });
      console.warn('[WS] Not connected, queued message', message);
      return;
    }

    this.trySend(message);
  }

  private trySend(message: WSClientMessage): void {
    try {
      const json = JSON.stringify(message);
      const ok = this.connection.send(json);
      if (!ok) {
        // If sender refused, re-queue so we don't lose it
        const key = this.makeKey({
          channel: (message as any).channel,
          requestId: (message as any).requestId,
          sessionId: (message as any).sessionId,
        });
        const actionType: PendingActionType = (message as any).type === 'unsubscribe' ? 'unsubscribe' : 'subscribe';
        this.pending.set(key, { type: actionType, key, message, ts: Date.now() });
        console.warn('[WS] Send returned false, re-queued', message);
      }
    } catch (error) {
      console.error('[WS] Failed to send message', error, message);

      // Re-queue on serialization/send error
      const key = this.makeKey({
        channel: (message as any).channel,
        requestId: (message as any).requestId,
        sessionId: (message as any).sessionId,
      });
      const actionType: PendingActionType = (message as any).type === 'unsubscribe' ? 'unsubscribe' : 'subscribe';
      this.pending.set(key, { type: actionType, key, message, ts: Date.now() });
    }
  }
}
