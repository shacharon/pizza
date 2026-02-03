/**
 * Phase 3: WebSocket Manager (Thin Orchestrator)
 * Manages WebSocket connections, subscriptions, and message routing
 * Refactored: Extracted responsibilities into focused modules (SOLID)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import { isWSClientMessage } from './websocket-protocol.js';
import Redis from 'ioredis';
import { HARD_CLOSE_REASONS, SOFT_CLOSE_REASONS } from './ws-close-reasons.js';

// Extracted modules
import { resolveWebSocketConfig, validateRedisForAuth } from './websocket.config.js';
import { verifyClient } from './auth-verifier.js';
import { setupConnection, handleClose, handleError, executeHeartbeat } from './connection-handler.js';
import { BacklogManager } from './backlog-manager.js';
import { PendingSubscriptionsManager } from './pending-subscriptions.js';
import { SubscriptionManager } from './subscription-manager.js';
import type {
  WebSocketManagerConfig,
  SubscriptionKey,
  WebSocketContext,
  PublishSummary,
  WebSocketStats
} from './websocket.types.js';
import { hashSessionId } from './websocket.types.js';

// Re-export for backward compatibility
export type { WebSocketManagerConfig };

// PROD Hardening: Per-socket subscribe rate limit (token bucket)
interface SocketRateLimit {
  tokens: number;
  lastRefill: number;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private config: WebSocketManagerConfig;
  private redis: Redis.Redis | null = null;

  // Extracted module instances
  private backlogManager: BacklogManager;
  private pendingSubscriptionsManager: PendingSubscriptionsManager;
  private subscriptionManager: SubscriptionManager;
  
  // PROD Hardening: Per-socket rate limiting
  private socketRateLimits = new WeakMap<WebSocket, SocketRateLimit>();
  private readonly SUBSCRIBE_RATE_LIMIT = {
    maxTokens: 10, // 10 subscribes
    refillRate: 10 / 60, // per second (10/min)
    refillInterval: 1000 // Check every second
  };

  constructor(server: HTTPServer, config?: Partial<WebSocketManagerConfig>) {
    // 1. Resolve and validate configuration
    this.config = resolveWebSocketConfig(config);

    // 2. Initialize Redis Connection
    if (this.config.redisUrl) {
      this.redis = new Redis.Redis(this.config.redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true
      });
      logger.info(
        { redisUrl: this.config.redisUrl.split('@')[1] || 'local' },
        'WebSocketManager: Redis enabled'
      );
    }

    // 3. Validate Redis requirement for auth
    validateRedisForAuth(!!this.redis);

    // 4. Initialize extracted modules
    this.backlogManager = new BacklogManager();
    this.pendingSubscriptionsManager = new PendingSubscriptionsManager();
    this.subscriptionManager = new SubscriptionManager(
      this.config.requestStateStore,
      this.config.jobStore
    );

    // 5. Init WebSocket server with Security Limits
    this.wss = new WebSocketServer({
      server,
      path: this.config.path,
      verifyClient: (info, callback) => {
        verifyClient(info, this.config.allowedOrigins, this.redis)
          .then((allowed) => callback(allowed))
          .catch((err) => {
            logger.error({ error: err instanceof Error ? err.message : 'unknown' }, 'WS: verifyClient error');
            callback(false);
          });
      },
      maxPayload: 64 * 1024, // PROD Hardening: 64KB max payload (down from 1MB)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();

    logger.info({ path: this.config.path }, 'WebSocketManager: Initialized');
  }

  private handleConnection(ws: WebSocket, req: any): void {
    setupConnection(
      ws,
      req,
      this.handleMessage.bind(this),
      this.handleCloseEvent.bind(this),
      this.handleErrorEvent.bind(this)
    );

    // DISABLED: No ws_status broadcasts to clients (UI doesn't show connection status)
    // this.sendConnectionStatus(ws, 'connected');
  }


  private handleMessage(ws: WebSocket, data: any, clientId: string): void {
    let message: any;

    try {
      const raw = data.toString();
      message = JSON.parse(raw);
    } catch (err) {
      logger.error({
        clientId,
        error: err instanceof Error ? err.message : 'unknown'
      }, 'WebSocket JSON parse error');

      this.sendError(ws, 'parse_error', 'Failed to parse JSON');
      return;
    }

    // DEV: Log message structure (keys only, no values)
    if (process.env.NODE_ENV !== 'production') {
      const msgKeys = message ? Object.keys(message) : [];
      const payloadKeys = message?.payload ? Object.keys(message.payload) : null;
      const dataKeys = message?.data ? Object.keys(message.data) : null;
      logger.debug({
        clientId,
        msgKeys,
        payloadKeys,
        dataKeys,
        hasPayload: !!message?.payload,
        hasData: !!message?.data
      }, '[DEV] WS message keys');
    }

    // Normalize requestId from various legacy locations
    if (message && message.type === 'subscribe' && !message.requestId) {
      if (message.payload?.requestId) {
        message.requestId = message.payload.requestId;
        logger.debug({ clientId }, '[WS] Normalized requestId from payload.requestId');
      } else if ((message as any).data?.requestId) {
        message.requestId = (message as any).data.requestId;
        logger.debug({ clientId }, '[WS] Normalized requestId from data.requestId');
      } else if ((message as any).reqId) {
        message.requestId = (message as any).reqId;
        logger.debug({ clientId }, '[WS] Normalized requestId from reqId');
      }
    }

    // Validate message structure
    if (!isWSClientMessage(message)) {
      const isSubscribe = message?.type === 'subscribe';
      const hasRequestId = 'requestId' in (message || {});

      logger.warn({
        clientId,
        messageType: message?.type || 'undefined',
        hasChannel: 'channel' in (message || {}),
        hasRequestId,
        reasonCode: isSubscribe && !hasRequestId ? 'MISSING_REQUEST_ID' : 'INVALID_FORMAT'
      }, 'Invalid WebSocket message format');

      if (isSubscribe && !hasRequestId) {
        this.sendValidationError(ws, {
          v: 1,
          type: 'publish',
          channel: 'system',
          payload: {
            code: 'MISSING_REQUEST_ID',
            message: 'Subscribe requires requestId. Send subscribe after /search returns requestId.'
          }
        });
      } else {
        this.sendError(ws, 'invalid_message', 'Invalid message format');
      }
      return;
    }

    logger.debug({
      clientId,
      type: message.type,
      hasRequestId: 'requestId' in message,
      hasSessionId: 'sessionId' in message,
      ...('channel' in message && { channel: message.channel })
    }, 'WebSocket message received');

    this.handleClientMessage(ws, message, clientId);
  }

  /**
   * PROD Hardening: Check and consume rate limit token
   */
  private checkRateLimit(ws: WebSocket): boolean {
    let limit = this.socketRateLimits.get(ws);
    const now = Date.now();

    if (!limit) {
      limit = {
        tokens: this.SUBSCRIBE_RATE_LIMIT.maxTokens,
        lastRefill: now
      };
      this.socketRateLimits.set(ws, limit);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - limit.lastRefill;
    const tokensToAdd = (elapsed / this.SUBSCRIBE_RATE_LIMIT.refillInterval) * this.SUBSCRIBE_RATE_LIMIT.refillRate;
    limit.tokens = Math.min(this.SUBSCRIBE_RATE_LIMIT.maxTokens, limit.tokens + tokensToAdd);
    limit.lastRefill = now;

    // Check if we have tokens available
    if (limit.tokens < 1) {
      return false; // Rate limited
    }

    // Consume one token
    limit.tokens -= 1;
    return true; // Allowed
  }

  private async handleClientMessage(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string
  ): Promise<void> {
    const isProduction = process.env.NODE_ENV === 'production';
    const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false';
    const wsSessionId = (ws as any).sessionId as string | undefined;

    switch (message.type) {
      case 'subscribe': {
        // PROD Hardening: Per-socket rate limit for subscribe messages
        if (!this.checkRateLimit(ws)) {
          logger.warn({
            clientId,
            sessionId: wsSessionId || 'none',
            event: 'subscribe_rate_limited'
          }, 'WebSocket subscribe rate limit exceeded');
          
          this.sendError(ws, 'rate_limit_exceeded', 'Too many subscribe requests');
          return;
        }
        
        await this.handleSubscribeRequest(ws, message, clientId, requireAuth, isProduction);
        break;
      }

      case 'unsubscribe': {
        const envelope = message as any;
        const channel: WSChannel = envelope.channel;
        const requestId = envelope.requestId as string | undefined;
        const effectiveSessionId = wsSessionId;

        if (requireAuth && !effectiveSessionId) {
          this.sendError(ws, 'unauthorized', 'Authentication required');
          ws.close(1008, HARD_CLOSE_REASONS.NOT_AUTHORIZED);
          return;
        }

        this.subscriptionManager.unsubscribe(channel, requestId || 'unknown', effectiveSessionId, ws);

        logger.info(
          {
            clientId,
            channel,
            requestIdHash: isProduction ? this.hashRequestId(requestId) : requestId,
            ...(isProduction ? {} : { sessionId: effectiveSessionId || 'none' })
          },
          'websocket_unsubscribed'
        );
        break;
      }

      case 'event': {
        const envelope = message as any;
        logger.debug(
          {
            clientId,
            channel: envelope.channel,
            requestIdHash: isProduction ? this.hashRequestId(envelope.requestId) : envelope.requestId
          },
          'websocket_event_received'
        );
        break;
      }

      case 'action_clicked':
        logger.info(
          {
            clientId,
            requestIdHash: isProduction ? this.hashRequestId((message as any).requestId) : (message as any).requestId,
            actionId: (message as any).actionId
          },
          'websocket_action_clicked'
        );
        break;

      case 'ui_state_changed':
        logger.debug(
          {
            clientId,
            requestIdHash: isProduction ? this.hashRequestId((message as any).requestId) : (message as any).requestId
          },
          'websocket_ui_state_changed'
        );
        break;
    }
  }



  private handleCloseEvent(ws: WebSocket, clientId: string, code: number, reasonBuffer: Buffer): void {
    handleClose(ws, clientId, code, reasonBuffer, this.cleanup.bind(this));
  }

  private handleErrorEvent(ws: WebSocket, err: Error, clientId: string): void {
    handleError(ws, err, clientId, this.cleanup.bind(this));
  }

  private cleanup(ws: WebSocket): void {
    this.subscriptionManager.cleanup(ws);
  }

  private async handleSubscribeRequest(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string,
    requireAuth: boolean,
    isProduction: boolean
  ): Promise<void> {
    const result = await this.subscriptionManager.handleSubscribeRequest(
      ws,
      message,
      clientId,
      requireAuth,
      isProduction
    );

    if (!result.success) {
      this.sendSubNack(ws, result.channel || 'search', result.requestId || '', 'invalid_request');
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
      this.sendSubAck(ws, result.channel!, result.requestId!, true);
    } else {
      // Active subscription established
      this.sendSubAck(ws, result.channel!, result.requestId!, false);

      // Drain backlog if exists
      const key = this.subscriptionManager.buildSubscriptionKey(
        result.channel!,
        result.requestId!,
        result.sessionId
      );
      this.backlogManager.drain(key, ws, result.channel!, result.requestId!, this.cleanup.bind(this));

      // Late-subscriber replay for search channel
      if (result.channel === 'search') {
        await this.subscriptionManager.replayStateIfAvailable(
          result.requestId!,
          ws,
          clientId,
          this.sendTo.bind(this)
        );
      }
    }
  }

  private sendSubAck(ws: WebSocket, channel: WSChannel, requestId: string, pending: boolean): void {
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

  private sendSubNack(ws: WebSocket, channel: WSChannel, requestId: string, reason: string): void {
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
   * Activate pending subscriptions for a requestId when job is created
   */
  activatePendingSubscriptions(requestId: string, ownerSessionId: string): void {
    this.pendingSubscriptionsManager.activate(
      requestId,
      ownerSessionId,
      this.subscriptionManager.subscribe.bind(this.subscriptionManager),
      this.sendSubAck.bind(this),
      this.sendSubNack.bind(this),
      (key: SubscriptionKey, ws: WebSocket, channel: WSChannel, reqId: string) => {
        this.backlogManager.drain(key, ws, channel, reqId, this.cleanup.bind(this));
      },
      this.subscriptionManager.buildSubscriptionKey.bind(this.subscriptionManager)
    );
  }

  /**
   * Legacy: Subscribe a WebSocket to receive updates for a specific requestId
   * @deprecated Use subscribeToChannel with channel parameter
   */
  subscribe(requestId: string, client: WebSocket): void {
    this.subscriptionManager.subscribe('search', requestId, undefined, client);
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
          this.cleanup(client);
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
   * Legacy: Publish a message to all WebSockets subscribed to a requestId
   */
  publish(requestId: string, message: WSServerMessage): PublishSummary {
    return this.publishToChannel('search', requestId, undefined, message);
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
    updatedAt?: string
  ): PublishSummary {
    const timestamp = updatedAt || new Date().toISOString();

    // Build provider state with updatedAt
    const providerState = {
      status,
      url,
      updatedAt: timestamp,
    };

    // Build RESULT_PATCH message
    const patchEvent: any = {
      type: 'RESULT_PATCH',
      requestId,
      placeId,
      patch: {
        // NEW: Structured providers field
        providers: {
          [provider]: providerState,
        },
        // DEPRECATED: Legacy field for backward compatibility (only for 'wolt')
        ...(provider === 'wolt' && {
          wolt: {
            status,
            url,
          },
        }),
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
        requestId,
      },
      `[WebSocketManager] Publishing provider patch: ${provider}`
    );

    // Publish to 'search' channel
    const result = this.publishToChannel('search', requestId, undefined, patchEvent);

    return result;
  }

  private sendTo(ws: WebSocket, message: WSServerMessage): boolean {
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
        this.cleanup(ws);
        return false;
      }
    }
    return false;
  }

  private sendError(ws: WebSocket, error: string, message: string): void {
    this.sendTo(ws, {
      type: 'error',
      requestId: 'unknown',
      error,
      message
    });
  }

  private sendValidationError(ws: WebSocket, errorPayload: any): void {
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
        this.cleanup(ws);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      executeHeartbeat(this.wss.clients, this.cleanup.bind(this));
      
      // NO ws_status broadcast on heartbeat - only send on lifecycle events
      // This prevents infinite "connecting" spam from heartbeat pings
      
      // Cleanup expired pending subscriptions
      this.pendingSubscriptionsManager.cleanupExpired(this.sendSubNack.bind(this));

      // Cleanup expired backlogs
      this.backlogManager.cleanupExpired();
    }, this.config.heartbeatIntervalMs);

    this.heartbeatInterval.unref();
  }

  /**
   * Send connection status to a specific client (lifecycle events only)
   * Used by app-assistant-line to show stable WS status
   */
  private sendConnectionStatus(ws: WebSocket, state: 'connected' | 'reconnecting' | 'offline'): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const statusEvent: WSServerMessage = {
      type: 'ws_status',
      state,
      ts: new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(statusEvent));
      logger.debug({
        state,
        clientId: (ws as any).clientId
      }, '[WS] Sent connection status (lifecycle event)');
    } catch (err) {
      logger.warn({
        error: err instanceof Error ? err.message : 'unknown',
        clientId: (ws as any).clientId
      }, '[WS] Failed to send ws_status event');
    }
  }

  /**
   * Shutdown: Close all connections and cleanup
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    const clientCount = this.wss.clients.size;

    this.wss.clients.forEach(ws => {
      this.cleanup(ws);
      ws.close(1001, SOFT_CLOSE_REASONS.SERVER_SHUTDOWN);
    });

    this.wss.close();

    logger.info({
      closedConnections: clientCount
    }, 'WebSocketManager shutdown');
  }

  private hashRequestId(requestId?: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }

  /**
   * Get stats for monitoring
   */
  getStats(): WebSocketStats {
    const subStats = this.subscriptionManager.getStats();
    const msgStats = this.backlogManager.getStats();

    return {
      connections: this.wss.clients.size,
      subscriptions: subStats.subscriptions,
      requestIdsTracked: subStats.requestIdsTracked,
      backlogCount: this.backlogManager.getSize(),
      messagesSent: msgStats.sent,
      messagesFailed: msgStats.failed
    };
  }
}
