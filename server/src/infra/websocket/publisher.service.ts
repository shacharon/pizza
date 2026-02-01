/**
 * Publisher Service
 * Handles publishing messages to WebSocket subscribers
 * 
 * Responsibility:
 * - Publish messages to active subscribers
 * - Enqueue to backlog if no subscribers
 * - Track send success/failure metrics
 * - Log publish events with appropriate detail level
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { BacklogManager } from './backlog-manager.js';
import type { SubscriptionManager } from './subscription-manager.js';
import type { PublishSummary, SubscriptionKey } from './websocket.types.js';
import { hashSessionId } from '../../utils/security.utils.js';
import type { WSChannel, WSServerMessage } from './websocket-protocol.js';

export class PublisherService {
  constructor(
    private subscriptionManager: SubscriptionManager,
    private backlogManager: BacklogManager
  ) { }

  /**
   * Publish to a specific channel
   */
  publishToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    message: WSServerMessage,
    cleanupCallback: (ws: WebSocket) => void
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
          // INSTRUMENTATION: Raw WS out log (track assistantLanguage)
          if (channel === 'assistant') {
            const envelope = message as any;
            const payload = envelope.payload || {};
            const rawJson = data;
            
            logger.info({
              event: 'ws_assistant_out_raw',
              requestId,
              clientId: (client as any).clientId || 'unknown',
              channel,
              payloadType: payload.type || null,
              assistantLanguage: payload.assistantLanguage || payload.language || envelope.assistantLanguage || null,
              uiLanguage: payload.uiLanguage || null,
              envelopeKeys: Object.keys(envelope),
              payloadKeys: Object.keys(payload),
              rawJsonLen: rawJson.length,
              rawJsonPreview: rawJson.length > 2000 ? rawJson.slice(0, 2000) + '...' : rawJson
            }, '[WS OUT] Raw assistant message before send');
          }

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
          cleanupCallback(client);
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
   * Send a message to a specific WebSocket client
   */
  sendTo(
    ws: WebSocket,
    message: WSServerMessage,
    cleanupCallback: (ws: WebSocket) => void
  ): boolean {
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
        cleanupCallback(ws);
        return false;
      }
    }
    return false;
  }

  /**
   * Send validation error message
   */
  sendValidationError(
    ws: WebSocket,
    errorPayload: any,
    cleanupCallback: (ws: WebSocket) => void
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(errorPayload));
        this.backlogManager.incrementSent();
      } catch (err) {
        this.backlogManager.incrementFailed();
        logger.warn({
          error: err instanceof Error ? err.message : 'unknown',
          clientId: (ws as any).clientId
        }, 'WebSocket send failed in sendValidationError');
        cleanupCallback(ws);
      }
    }
  }

  /**
   * Send error message
   */
  sendError(
    ws: WebSocket,
    error: string,
    message: string,
    cleanupCallback: (ws: WebSocket) => void
  ): void {
    this.sendTo(ws, {
      type: 'error',
      requestId: 'unknown',
      error,
      message
    }, cleanupCallback);
  }
}
