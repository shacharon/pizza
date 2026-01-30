/**
 * Pending Subscriptions Manager
 * Handles subscriptions awaiting job creation
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { PendingSubscription, SubscriptionKey } from './websocket.types.js';
import { hashSessionId } from '../../utils/security.utils.js';
import type { WSChannel } from './websocket-protocol.js';
import crypto from 'crypto';

const PENDING_SUB_TTL_MS = 90 * 1000; // 90 seconds

/**
 * Pending Subscriptions Manager Class
 */
export class PendingSubscriptionsManager {
  private pendingSubscriptions = new Map<string, PendingSubscription>();

  /**
   * Register a pending subscription
   */
  register(
    channel: WSChannel,
    requestId: string,
    sessionId: string,
    ws: WebSocket
  ): void {
    const pendingKey = `${channel}:${requestId}:${sessionId}`;
    const pendingSub: PendingSubscription = {
      ws,
      channel,
      requestId,
      sessionId,
      expiresAt: Date.now() + PENDING_SUB_TTL_MS
    };

    this.pendingSubscriptions.set(pendingKey, pendingSub);

    // Note: ws_subscribe_ack will be logged by subscription-manager after registration
    logger.debug({
      clientId: (ws as any).clientId,
      channel,
      requestIdHash: this.hashRequestId(requestId),
      sessionHash: hashSessionId(sessionId),
      pending: true,
      ttlMs: PENDING_SUB_TTL_MS,
      event: 'pending_subscription_registered'
    }, 'Subscribe pending - awaiting job creation');
  }

  /**
   * Activate pending subscriptions for a requestId
   * Called when job is created or transitions to RUNNING state
   */
  activate(
    requestId: string,
    ownerSessionId: string,
    subscribeCallback: (channel: WSChannel, requestId: string, sessionId: string, ws: WebSocket) => void,
    sendSubAck: (ws: WebSocket, channel: WSChannel, requestId: string, pending: boolean) => void,
    sendSubNack: (ws: WebSocket, channel: WSChannel, requestId: string, reason: string) => void,
    drainBacklog: (key: SubscriptionKey, ws: WebSocket, channel: WSChannel, requestId: string) => void,
    buildSubscriptionKey: (channel: WSChannel, requestId: string, sessionId?: string) => SubscriptionKey
  ): void {
    let activatedCount = 0;
    const now = Date.now();

    // Find all pending subscriptions for this requestId
    const keysToActivate: string[] = [];
    for (const [key, pending] of this.pendingSubscriptions.entries()) {
      if (pending.requestId === requestId) {
        // Check if expired
        if (pending.expiresAt < now) {
          this.pendingSubscriptions.delete(key);
          logger.debug({
            requestId: this.hashRequestId(requestId),
            channel: pending.channel,
            reason: 'expired'
          }, 'Pending subscription expired before activation');
          continue;
        }

        // Check if sessionId matches owner
        if (pending.sessionId !== ownerSessionId) {
          this.pendingSubscriptions.delete(key);
          logger.warn({
            requestId: this.hashRequestId(requestId),
            channel: pending.channel,
            reason: 'session_mismatch_on_activation'
          }, 'Pending subscription rejected - session mismatch on activation');

          // Send sub_nack to client
          sendSubNack(pending.ws, pending.channel, requestId, 'session_mismatch');
          continue;
        }

        keysToActivate.push(key);
      }
    }

    // Activate matched pending subscriptions
    for (const key of keysToActivate) {
      const pending = this.pendingSubscriptions.get(key);
      if (!pending) continue;

      // Move to active subscriptions
      subscribeCallback(pending.channel, pending.requestId, pending.sessionId, pending.ws);

      // Send updated sub_ack with pending:false
      sendSubAck(pending.ws, pending.channel, pending.requestId, false);

      // Drain backlog if exists
      const subscriptionKey = buildSubscriptionKey(pending.channel, pending.requestId, pending.sessionId);
      drainBacklog(subscriptionKey, pending.ws, pending.channel, pending.requestId);

      this.pendingSubscriptions.delete(key);
      activatedCount++;

      logger.info({
        clientId: (pending.ws as any).clientId,
        channel: pending.channel,
        requestIdHash: this.hashRequestId(requestId),
        event: 'pending_subscription_activated'
      }, 'Pending subscription activated');
    }

    if (activatedCount > 0) {
      logger.info({
        requestIdHash: this.hashRequestId(requestId),
        activatedCount,
        event: 'pending_subscriptions_batch_activated'
      }, 'Pending subscriptions activated for request');
    }
  }

  /**
   * Cleanup expired pending subscriptions
   */
  cleanupExpired(
    sendSubNack: (ws: WebSocket, channel: WSChannel, requestId: string, reason: string) => void
  ): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, pending] of this.pendingSubscriptions.entries()) {
      if (pending.expiresAt < now) {
        // Send sub_nack to client about expiration
        sendSubNack(pending.ws, pending.channel, pending.requestId, 'invalid_request');

        this.pendingSubscriptions.delete(key);
        cleanedCount++;

        logger.debug({
          clientId: (pending.ws as any).clientId,
          channel: pending.channel,
          requestIdHash: this.hashRequestId(pending.requestId),
          event: 'pending_subscription_expired'
        }, 'Pending subscription expired');
      }
    }

    if (cleanedCount > 0) {
      logger.info({ cleanedCount, event: 'pending_subscriptions_cleanup' }, 'Expired pending subscriptions cleaned');
    }
  }

  /**
   * Hash requestId for logging
   */
  private hashRequestId(requestId: string): string {
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }

}
