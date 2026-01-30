/**
 * Backlog Drainer Service
 * Handles draining of backlogged messages to newly connected subscribers
 * 
 * Responsibility:
 * - Drain backlogged messages when subscriber connects
 * - Coordinate with BacklogManager for message retrieval
 * - Handle failures during drain process
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { BacklogManager } from './backlog-manager.js';
import type { SubscriptionKey } from './websocket.types.js';
import type { WSChannel } from './websocket-protocol.js';

export class BacklogDrainerService {
  constructor(
    private backlogManager: BacklogManager
  ) {}

  /**
   * Drain backlog for a subscription key
   * Called when a subscriber connects and subscription becomes active
   */
  drain(
    key: SubscriptionKey,
    ws: WebSocket,
    channel: WSChannel,
    requestId: string,
    cleanupCallback: (ws: WebSocket) => void
  ): void {
    this.backlogManager.drain(key, ws, channel, requestId, cleanupCallback);
  }
}
