/**
 * Publish Manager Module
 * Handles message publishing, backlog, and provider patches
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSServerMessage, WSChannel } from './websocket-protocol.js';
import type { PublishSummary, SubscriptionKey } from './websocket.types.js';
import { hashSessionId } from './websocket.types.js';
import { BacklogManager } from './backlog-manager.js';
import { SubscriptionManager } from './subscription-manager.js';

export class PublishManager {
  private backlogManager: BacklogManager;

  constructor(
    private subscriptionManager: SubscriptionManager,
    backlogManager?: BacklogManager
  ) {
    this.backlogManager = backlogManager || new BacklogManager();
  }

  /**
   * Publish to a specific channel
   */
  publishToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    message: WSServerMessage
  ): PublishSummary {
    const startTime = performance.now();
    const key = this.subscriptionManager.buildSubscriptionKey(channel, requestId, sessionId);

    // SESSIONHASH FIX: Use shared utility for consistent hashing
    const sessionHash = hashSessionId(sessionId);

    // Cleanup expired backlogs
    this.backlogManager.cleanupExpired();

    const clients = this.subscriptionManager.getSubscribers(key);

    const data = JSON.stringify(message);
    const payloadBytes = Buffer.byteLength(data, 'utf8');

    // If no subscribers, enqueue to backlog
    if (!clients || clients.size === 0) {
      this.backlogManager.enqueue(key, message, channel, requestId);

      logger.debug({
        channel,
        requestId,
        sessionHash,
        subscriptionKey: key,
        clientCount: 0,
        payloadBytes,
        payloadType: message.type,
        enqueued: true,
        event: 'websocket_published'
      }, 'websocket_published');

      return { attempted: 0, sent: 0, failed: 0 };
    }

    // Send to active subscribers
    let attempted = 0;
    let sent = 0;
    let failed = 0;

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        attempted++;
        try {
          client.send(data);
          sent++;
          this.backlogManager.incrementSent();
        } catch (err) {
          failed++;
          this.backlogManager.incrementFailed();
          logger.warn({
            clientId: (client as any).clientId,
            requestId,
            channel,
            error: err instanceof Error ? err.message : 'unknown'
          }, 'WebSocket send failed in publishToChannel');
          this.subscriptionManager.cleanup(client);
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    const errorDetails = message.type === 'error' && 'code' in message
      ? {
        errorType: (message as any).code,
        errorMessage: (message as any).message?.substring(0, 100),
        errorStage: (message as any).stage,
        errorKind: (message as any).errorKind
      }
      : {};

    // Log at INFO for errors, DEBUG for status/progress/ready
    const level = message.type === 'error' ? 'info' : 'debug';
    logger[level]({
      channel,
      requestId,
      sessionHash,
      subscriptionKey: key,
      clientCount: sent,
      ...(failed > 0 && { failedCount: failed }),
      payloadBytes,
      payloadType: message.type,
      durationMs,
      ...errorDetails
    }, 'websocket_published');

    return { attempted, sent, failed };
  }

  /**
   * Unified method for publishing provider enrichment patches
   * 
   * Publishes RESULT_PATCH WebSocket event with structured logging.
   * Use this method for all provider enrichments (Wolt, TripAdvisor, etc.)
   * 
   * @param provider - Provider name (e.g., 'wolt', 'tripadvisor')
   * @param placeId - Google Place ID
   * @param requestId - Search request ID
   * @param status - Enrichment status
   * @param url - Provider URL (or null)
   * @param updatedAt - ISO timestamp (optional, defaults to now)
   * @returns Publish summary
   */
  publishProviderPatch(
    provider: string,
    placeId: string,
    requestId: string,
    status: 'FOUND' | 'NOT_FOUND',
    url: string | null,
    updatedAt?: string,
    meta?: { layerUsed: 1 | 2 | 3; source: 'cse' | 'internal' }
  ): PublishSummary {
    const timestamp = updatedAt || new Date().toISOString();

    // Build provider state with updatedAt and meta
    const providerState: any = {
      status,
      url,
      updatedAt: timestamp,
    };

    // Add meta if provided
    if (meta) {
      providerState.meta = meta;
    }

    // Build RESULT_PATCH message
    const patchEvent: any = {
      type: 'RESULT_PATCH',
      requestId,
      placeId,
      patch: {
        // Structured providers field
        providers: {
          [provider]: providerState,
        },
      },
    };

    // Structured logging BEFORE publish
    logger.info(
      {
        event: 'provider_patch_published',
        provider,
        placeId,
        status,
        url: url ? 'present' : 'null', // Don't log full URL for privacy
        updatedAt: timestamp,
        meta,
        requestId,
      },
      `[WebSocketManager] Publishing provider patch: ${provider}`
    );

    // Publish to 'search' channel
    const result = this.publishToChannel('search', requestId, undefined, patchEvent);

    return result;
  }

  /**
   * Send message directly to a WebSocket
   */
  sendTo(ws: WebSocket, message: WSServerMessage): boolean {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        this.backlogManager.incrementSent();
        return true;
      } catch (err) {
        this.backlogManager.incrementFailed();
        logger.warn({
          error: err instanceof Error ? err.message : 'unknown',
          messageType: message.type,
          clientId: (ws as any).clientId
        }, 'WebSocket send failed in sendTo');
        this.subscriptionManager.cleanup(ws);
        return false;
      }
    }
    return false;
  }

  /**
   * Drain backlog for a subscription
   */
  drainBacklog(
    key: SubscriptionKey,
    ws: WebSocket,
    channel: WSChannel,
    requestId: string,
    cleanupFn: (ws: WebSocket) => void
  ): void {
    this.backlogManager.drain(key, ws, channel, requestId, cleanupFn);
  }

  /**
   * Get message stats
   */
  getStats(): { sent: number; failed: number } {
    return this.backlogManager.getStats();
  }

  /**
   * Get backlog size
   */
  getBacklogSize(): number {
    return this.backlogManager.getSize();
  }

  /**
   * Cleanup expired backlogs
   */
  cleanupExpiredBacklogs(): void {
    this.backlogManager.cleanupExpired();
  }

  /**
   * Get backlog manager instance
   */
  getBacklogManager(): BacklogManager {
    return this.backlogManager;
  }
}
