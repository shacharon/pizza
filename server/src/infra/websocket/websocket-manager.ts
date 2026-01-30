/**
 * Phase 4: WebSocket Manager (Thin Lifecycle + Wiring)
 * Manages WebSocket connections and coordinates extracted services
 * Refactored Pass 2: Extracted backlog drain, activation, and publishing (SOLID)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import { isWSClientMessage } from './websocket-protocol.js';
import Redis from 'ioredis';
import { SOFT_CLOSE_REASONS } from './ws-close-reasons.js';

// Configuration and auth
import { resolveWebSocketConfig, validateRedisForAuth } from './websocket.config.js';
import { verifyClient } from './auth-verifier.js';
import { setupConnection, handleClose, handleError, executeHeartbeat } from './connection-handler.js';

// Core managers
import { BacklogManager } from './backlog-manager.js';
import { PendingSubscriptionsManager } from './pending-subscriptions.js';
import { SubscriptionManager } from './subscription-manager.js';
import { SocketRateLimiter } from './rate-limiter.js';
import { WebSocketMessageRouter } from './message-router.js';

// Pass 2: Extracted services
import { BacklogDrainerService } from './backlog-drainer.service.js';
import { SubscriptionActivatorService } from './subscription-activator.service.js';
import { PublisherService } from './publisher.service.js';

// Utilities
import { normalizeLegacyMessage } from './message-normalizer.js';
import type {
  WebSocketManagerConfig,
  PublishSummary,
  WebSocketStats
} from './websocket.types.js';

// Re-export for backward compatibility
export type { WebSocketManagerConfig };

export class WebSocketManager {
  private wss: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private config: WebSocketManagerConfig;
  private redis: Redis.Redis | null = null;

  // Core managers
  private backlogManager: BacklogManager;
  private pendingSubscriptionsManager: PendingSubscriptionsManager;
  private subscriptionManager: SubscriptionManager;
  private rateLimiter: SocketRateLimiter;
  private messageRouter: WebSocketMessageRouter;

  // Pass 2: Extracted services
  private backlogDrainer!: BacklogDrainerService;
  private subscriptionActivator!: SubscriptionActivatorService;
  private publisher!: PublisherService;

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
    this.rateLimiter = new SocketRateLimiter({
      maxTokens: 10,
      refillRate: 10 / 60,
      refillInterval: 1000
    });
    this.messageRouter = new WebSocketMessageRouter(
      this.subscriptionManager,
      this.rateLimiter,
      {
        requireAuth: process.env.WS_REQUIRE_AUTH !== 'false',
        isProduction: process.env.NODE_ENV === 'production'
      }
    );

    // 6. Init WebSocket server with Security Limits
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
    // Returns null if legacy message is rejected (WS_ALLOW_LEGACY=false)
    message = normalizeLegacyMessage(message, clientId);

    // Check if message was rejected due to legacy protocol enforcement
    if (message === null) {
      this.handleLegacyRejection(ws, clientId);
      return;
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

    void this.handleClientMessage(ws, message, clientId);
  }

  private async handleClientMessage(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string
  ): Promise<void> {
    const isProduction = process.env.NODE_ENV === 'production';
    const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false';

    // Route message to appropriate handler
    const result = await this.messageRouter.routeMessage(
      ws,
      message,
      clientId,
      {
        onSubscribe: (ws, msg) => this.handleSubscribeRequest(ws, msg, clientId, requireAuth, isProduction),
        sendError: this.sendError.bind(this)
      }
    );

    // Handle close if requested
    if (result.shouldClose && result.closeCode && result.closeReason) {
      ws.close(result.closeCode, result.closeReason);
    }
  }



  private handleCloseEvent(ws: WebSocket, clientId: string, code: number, reasonBuffer: Buffer): void {
    handleClose(ws, clientId, code, reasonBuffer, this.cleanup.bind(this));
  }

  private handleErrorEvent(ws: WebSocket, err: Error, clientId: string): void {
    handleError(ws, err, clientId, this.cleanup.bind(this));
  }

  /**
   * Handle legacy protocol rejection
   * Sends NACK message and closes connection with clear reason
   */
  private handleLegacyRejection(ws: WebSocket, clientId: string): void {
    const nackMessage = {
      type: 'sub_nack',
      reason: 'LEGACY_PROTOCOL_REJECTED',
      message: 'Legacy WebSocket protocol is no longer supported. Please upgrade your client to use canonical protocol v1. See: docs/ws-legacy-sunset.md',
      migrationDoc: 'docs/ws-legacy-sunset.md'
    };

    logger.warn({
      clientId,
      event: 'ws_legacy_rejected',
      reason: 'LEGACY_PROTOCOL_REJECTED',
      message: 'Connection rejected due to legacy protocol usage'
    }, '[WS] Rejecting connection: legacy protocol not allowed');

    try {
      ws.send(JSON.stringify(nackMessage));
    } catch (sendErr) {
      logger.error({ clientId, error: String(sendErr) }, '[WS] Failed to send legacy rejection NACK');
    }

    // Close connection with clear reason
    ws.close(1008, 'Legacy protocol not supported'); // 1008 = Policy Violation
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
          (ws, msg) => this.publisher.sendTo(ws, msg, this.cleanup.bind(this))
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
   * Delegated to SubscriptionActivatorService
   */
  activatePendingSubscriptions(requestId: string, ownerSessionId: string): void {
    this.subscriptionActivator.activatePendingSubscriptions(
      requestId,
      ownerSessionId,
      this.sendSubAck.bind(this),
      this.sendSubNack.bind(this),
      this.cleanup.bind(this)
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
   * Delegated to PublisherService
   */
  publishToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    message: WSServerMessage
  ): PublishSummary {
    return this.publisher.publishToChannel(
      channel,
      requestId,
      sessionId,
      message,
      this.cleanup.bind(this)
    );
  }

  /**
   * Legacy: Publish a message to all WebSockets subscribed to a requestId
   */
  publish(requestId: string, message: WSServerMessage): PublishSummary {
    return this.publishToChannel('search', requestId, undefined, message);
  }

  private sendError(ws: WebSocket, error: string, message: string): void {
    this.publisher.sendError(ws, error, message, this.cleanup.bind(this));
  }

  private sendValidationError(ws: WebSocket, errorPayload: any): void {
    this.publisher.sendValidationError(ws, errorPayload, this.cleanup.bind(this));
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
