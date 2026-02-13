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
import { HARD_CLOSE_REASONS } from './ws-close-reasons.js';

// Extracted modules
import { resolveWebSocketConfig, validateRedisForAuth } from './websocket.config.js';
import { verifyClient } from './auth-verifier.js';
import { handleClose, handleError } from './connection-handler.js';
import { PendingSubscriptionsManager } from './pending-subscriptions.js';
import { SubscriptionManager } from './subscription-manager.js';
import type {
  WebSocketManagerConfig,
  SubscriptionKey,
  PublishSummary,
  WebSocketStats
} from './websocket.types.js';

// SOLID extracted modules
import { RateLimiter } from './rate-limiter.js';
import { PublishManager } from './publish-manager.js';
import { LifecycleHandler } from './lifecycle-handler.js';

// Re-export for backward compatibility
export type { WebSocketManagerConfig };

export class WebSocketManager {
  private wss: WebSocketServer;
  private config: WebSocketManagerConfig;
  private redis: Redis.Redis | null = null;

  // Extracted module instances
  private pendingSubscriptionsManager: PendingSubscriptionsManager;
  private subscriptionManager: SubscriptionManager;
  
  // SOLID modules
  private rateLimiter: RateLimiter;
  private publishManager: PublishManager;
  private lifecycleHandler: LifecycleHandler;

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
    this.pendingSubscriptionsManager = new PendingSubscriptionsManager();
    this.subscriptionManager = new SubscriptionManager(
      this.config.requestStateStore,
      this.config.jobStore
    );

    // 5. Initialize SOLID modules
    this.rateLimiter = new RateLimiter({
      maxTokens: 10,
      refillRate: 10 / 60,
      refillInterval: 1000
    });
    this.publishManager = new PublishManager(this.subscriptionManager);
    
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

    // 7. Initialize lifecycle handler after WSS is created
    this.lifecycleHandler = new LifecycleHandler(
      this.wss,
      this.subscriptionManager,
      this.config.heartbeatIntervalMs,
      this.handleMessage.bind(this),
      this.handleCloseEvent.bind(this),
      this.handleErrorEvent.bind(this)
    );

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();

    logger.info({ path: this.config.path }, 'WebSocketManager: Initialized');
  }

  private handleConnection(ws: WebSocket, req: any): void {
    this.lifecycleHandler.handleConnection(ws, req);
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
    return this.rateLimiter.checkRateLimit(ws);
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
    handleClose(ws, clientId, code, reasonBuffer, this.lifecycleHandler.cleanup.bind(this.lifecycleHandler));
  }

  private handleErrorEvent(ws: WebSocket, err: Error, clientId: string): void {
    handleError(ws, err, clientId, this.lifecycleHandler.cleanup.bind(this.lifecycleHandler));
  }

  private cleanup(ws: WebSocket): void {
    this.lifecycleHandler.cleanup(ws);
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
      this.publishManager.drainBacklog(key, ws, result.channel!, result.requestId!, this.cleanup.bind(this));

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
        this.publishManager.drainBacklog(key, ws, channel, reqId, this.cleanup.bind(this));
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
    return this.publishManager.publishToChannel(channel, requestId, sessionId, message);
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
    updatedAt?: string,
    meta?: { layerUsed: 1 | 2 | 3; source: 'cse' | 'internal' }
  ): PublishSummary {
    return this.publishManager.publishProviderPatch(provider, placeId, requestId, status, url, updatedAt, meta);
  }

  private sendTo(ws: WebSocket, message: WSServerMessage): boolean {
    return this.publishManager.sendTo(ws, message);
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
        this.publishManager.getBacklogManager().incrementSent();
      } catch (err) {
        this.publishManager.getBacklogManager().incrementFailed();
        logger.warn({
          error: err instanceof Error ? err.message : 'unknown',
          clientId: (ws as any).clientId
        }, 'WebSocket send failed in sendValidationError');
        this.cleanup(ws);
      }
    }
  }

  private startHeartbeat(): void {
    this.lifecycleHandler.startHeartbeat(
      this.cleanup.bind(this),
      this.sendSubNack.bind(this),
      () => this.pendingSubscriptionsManager.cleanupExpired(this.sendSubNack.bind(this)),
      () => this.publishManager.cleanupExpiredBacklogs()
    );
  }

  /**
   * Shutdown: Close all connections and cleanup
   */
  shutdown(): void {
    this.lifecycleHandler.shutdown();
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
    const msgStats = this.publishManager.getStats();

    return {
      connections: this.wss.clients.size,
      subscriptions: subStats.subscriptions,
      requestIdsTracked: subStats.requestIdsTracked,
      backlogCount: this.publishManager.getBacklogSize(),
      messagesSent: msgStats.sent,
      messagesFailed: msgStats.failed
    };
  }
}
