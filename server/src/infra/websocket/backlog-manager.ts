/**
 * WebSocket Backlog Manager
 * Manages message backlogs for late subscribers
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { BacklogEntry, SubscriptionKey } from './websocket.types.js';
import type { WSChannel, WSServerMessage } from './websocket-protocol.js';

const BACKLOG_TTL_MS = 2 * 60 * 1000; // 2 minutes
const BACKLOG_MAX_ITEMS = 50; // Per requestId cap
const MAX_TOTAL_MESSAGES = 10_000; // PROD Hardening: Global cap

/**
 * Backlog Manager Class
 * Handles message queuing for late subscribers
 * PROD Hardening: Per-requestId and global caps enforced
 */
export class BacklogManager {
  private backlog = new Map<SubscriptionKey, BacklogEntry>();
  private messagesSent = 0;
  private messagesFailed = 0;

  /**
   * PROD Hardening: Get total messages in all backlogs
   */
  private getTotalMessages(): number {
    let total = 0;
    for (const entry of this.backlog.values()) {
      total += entry.items.length;
    }
    return total;
  }

  /**
   * Enqueue message to backlog (no active subscribers)
   * PROD Hardening: Enforces per-requestId and global caps
   */
  enqueue(
    key: SubscriptionKey,
    message: WSServerMessage,
    channel: WSChannel,
    requestId: string
  ): void {
    // PROD Hardening: Check global cap
    const totalMessages = this.getTotalMessages();
    if (totalMessages >= MAX_TOTAL_MESSAGES) {
      logger.warn({
        channel,
        requestId,
        totalMessages,
        maxTotal: MAX_TOTAL_MESSAGES,
        event: 'backlog_global_cap_exceeded'
      }, 'WebSocket backlog global cap exceeded - dropping message');
      return;
    }

    let entry = this.backlog.get(key);

    if (!entry) {
      // Create new backlog entry
      entry = {
        items: [],
        expiresAt: Date.now() + BACKLOG_TTL_MS
      };
      this.backlog.set(key, entry);

      logger.info({
        channel,
        requestId,
        event: 'backlog_created'
      }, 'WebSocket backlog created for late subscribers');
    }

    // Add message (drop oldest if at per-requestId max)
    if (entry.items.length >= BACKLOG_MAX_ITEMS) {
      const droppedMessage = entry.items.shift(); // Drop oldest
      logger.warn({
        channel,
        requestId,
        backlogSize: entry.items.length,
        maxPerRequest: BACKLOG_MAX_ITEMS,
        droppedMessageType: droppedMessage?.type,
        event: 'backlog_per_request_cap_exceeded'
      }, 'WebSocket backlog per-requestId cap exceeded - dropping oldest message');
    }
    entry.items.push(message);

    logger.debug({
      channel,
      requestId,
      backlogSize: entry.items.length,
      totalMessages: totalMessages + 1,
      event: 'backlog_enqueued'
    }, 'WebSocket message enqueued to backlog');
  }

  /**
   * Drain backlog to newly subscribed client
   */
  drain(
    key: SubscriptionKey,
    client: WebSocket,
    channel: WSChannel,
    requestId: string,
    cleanup: (ws: WebSocket) => void
  ): void {
    const entry = this.backlog.get(key);

    if (!entry) {
      return; // No backlog
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.backlog.delete(key);
      logger.debug({
        channel,
        requestId,
        event: 'backlog_expired'
      }, 'WebSocket backlog expired, not drained');
      return;
    }

    // Send all backlog items in FIFO order
    let sent = 0;
    let failed = 0;
    for (const message of entry.items) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
          sent++;
          this.messagesSent++;
        } catch (err) {
          failed++;
          this.messagesFailed++;
          logger.warn({
            channel,
            requestId,
            error: err instanceof Error ? err.message : 'unknown',
            clientId: (client as any).clientId
          }, 'WebSocket send failed in drainBacklog');
          // Cleanup failed connection and stop draining
          cleanup(client);
          break;
        }
      }
    }

    // Clear backlog
    this.backlog.delete(key);

    logger.info({
      channel,
      requestId,
      count: sent,
      ...(failed > 0 && { failedCount: failed }),
      event: 'backlog_drained'
    }, 'WebSocket backlog drained to late subscriber');
  }

  /**
   * Cleanup expired backlogs
   */
  cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: SubscriptionKey[] = [];

    for (const [key, entry] of this.backlog.entries()) {
      if (entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.backlog.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug({
        expiredCount: expiredKeys.length,
        event: 'backlog_cleanup'
      }, 'WebSocket expired backlogs cleaned up');
    }
  }

  /**
   * Get backlog size
   */
  getSize(): number {
    return this.backlog.size;
  }

  /**
   * Get message stats
   */
  getStats(): { sent: number; failed: number } {
    return {
      sent: this.messagesSent,
      failed: this.messagesFailed
    };
  }

  /**
   * Increment sent counter (for external sends)
   */
  incrementSent(): void {
    this.messagesSent++;
  }

  /**
   * Increment failed counter (for external sends)
   */
  incrementFailed(): void {
    this.messagesFailed++;
  }
}
