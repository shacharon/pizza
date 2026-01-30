/**
 * Subscribe Handler Service
 * Orchestrates subscription flow: validation, pending registration, backlog drain, replay
 * ORCHESTRATION - coordinates between multiple managers/services
 */

import { WebSocket } from 'ws';
import type { WSClientMessage } from './websocket-protocol.js';
import type { SubscriptionManager } from './subscription-manager.js';
import type { PendingSubscriptionsManager } from './pending-subscriptions.js';
import type { BacklogManager } from './backlog-manager.js';
import type { SubscriptionAckService } from './subscription-ack.service.js';

/**
 * SubscribeHandlerService
 * Handles the full subscription flow orchestration
 */
export class SubscribeHandlerService {
  constructor(
    private subscriptionManager: SubscriptionManager,
    private pendingSubscriptionsManager: PendingSubscriptionsManager,
    private backlogManager: BacklogManager,
    private subscriptionAck: SubscriptionAckService
  ) {}

  /**
   * Handle subscribe request with full orchestration
   */
  async handleSubscribeRequest(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string,
    requireAuth: boolean,
    isProduction: boolean,
    replaySender: (ws: WebSocket, requestId: string, clientId: string) => Promise<void>,
    cleanup: (ws: WebSocket) => void
  ): Promise<void> {
    const result = await this.subscriptionManager.handleSubscribeRequest(
      ws,
      message,
      clientId,
      requireAuth,
      isProduction
    );

    if (!result.success) {
      this.subscriptionAck.sendSubNack(ws, result.channel || 'search', result.requestId || '', 'invalid_request');
      return;
    }

    if (result.pending) {
      // Register pending subscription
      this.pendingSubscriptionsManager.register(
        result.channel!,
        result.requestId!,
        result.sessionId!,
        ws
      );
      this.subscriptionAck.sendSubAck(ws, result.channel!, result.requestId!, true);
    } else {
      // Active subscription established
      this.subscriptionAck.sendSubAck(ws, result.channel!, result.requestId!, false);

      // Drain backlog if exists
      const key = this.subscriptionManager.buildSubscriptionKey(
        result.channel!,
        result.requestId!,
        result.sessionId
      );
      this.backlogManager.drain(key, ws, result.channel!, result.requestId!, cleanup);

      // Late-subscriber replay for search channel
      if (result.channel === 'search') {
        await replaySender(ws, result.requestId!, clientId);
      }
    }
  }
}
