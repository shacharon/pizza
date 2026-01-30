/**
 * Subscription Activator Service
 * Activates pending subscriptions when job/request becomes ready
 * 
 * Responsibility:
 * - Activate pending subscriptions for a requestId
 * - Coordinate between PendingSubscriptionsManager and SubscriptionManager
 * - Send acknowledgments to activated subscribers
 * - Trigger backlog drain for newly activated subscriptions
 */

import { WebSocket } from 'ws';
import type { PendingSubscriptionsManager } from './pending-subscriptions.js';
import type { SubscriptionManager } from './subscription-manager.js';
import type { BacklogDrainerService } from './backlog-drainer.service.js';
import type { SubscriptionKey } from './websocket.types.js';
import type { WSChannel } from './websocket-protocol.js';

export class SubscriptionActivatorService {
  constructor(
    private pendingSubscriptionsManager: PendingSubscriptionsManager,
    private subscriptionManager: SubscriptionManager,
    private backlogDrainer: BacklogDrainerService
  ) {}

  /**
   * Activate pending subscriptions for a requestId when job is created
   * Delegates to PendingSubscriptionsManager with appropriate callbacks
   */
  activatePendingSubscriptions(
    requestId: string,
    ownerSessionId: string,
    sendSubAck: (ws: WebSocket, channel: WSChannel, requestId: string, pending: boolean) => void,
    sendSubNack: (ws: WebSocket, channel: WSChannel, requestId: string, reason: string) => void,
    cleanupFn: (ws: WebSocket) => void
  ): void {
    this.pendingSubscriptionsManager.activate(
      requestId,
      ownerSessionId,
      this.subscriptionManager.subscribe.bind(this.subscriptionManager),
      sendSubAck,
      sendSubNack,
      (key: SubscriptionKey, ws: WebSocket, channel: WSChannel, reqId: string) => {
        this.backlogDrainer.drain(key, ws, channel, reqId, cleanupFn);
      },
      this.subscriptionManager.buildSubscriptionKey.bind(this.subscriptionManager)
    );
  }
}
