/**
 * Subscription Acknowledgment Service
 * Handles sending subscription acknowledgments and rejections
 * PURE messaging - no subscription state management
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSChannel } from './websocket-protocol.js';

/**
 * SubscriptionAckService
 * Sends sub_ack and sub_nack messages to clients
 */
export class SubscriptionAckService {
  /**
   * Send subscription acknowledgment
   */
  sendSubAck(ws: WebSocket, channel: WSChannel, requestId: string, pending: boolean): void {
    const ack: any = {
      type: 'sub_ack',
      channel,
      requestId,
      pending
    };

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(ack));
      } catch (err) {
        logger.warn({
          clientId: (ws as any).clientId,
          channel,
          requestIdHash: this.hashRequestId(requestId),
          error: err instanceof Error ? err.message : 'unknown'
        }, 'Failed to send sub_ack');
      }
    }
  }

  /**
   * Send subscription negative acknowledgment
   */
  sendSubNack(ws: WebSocket, channel: WSChannel, requestId: string, reason: string): void {
    const nack: any = {
      type: 'sub_nack',
      channel,
      requestId,
      reason
    };

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(nack));
      } catch (err) {
        logger.warn({
          clientId: (ws as any).clientId,
          channel,
          requestIdHash: this.hashRequestId(requestId),
          error: err instanceof Error ? err.message : 'unknown'
        }, 'Failed to send sub_nack');
      }
    }
  }

  /**
   * Hash requestId for logging
   */
  private hashRequestId(requestId?: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }
}
