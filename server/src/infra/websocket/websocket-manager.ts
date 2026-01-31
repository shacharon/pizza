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
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service.js';
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
import { MessageValidationService } from './message-validation.service.js';
import { SubscriptionAckService } from './subscription-ack.service.js';
import { SubscribeHandlerService } from './subscribe-handler.service.js';

// Utilities
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
  private messageValidator!: MessageValidationService;
  private subscriptionAck!: SubscriptionAckService;
  private subscribeHandler!: SubscribeHandlerService;

  // Idempotency tracking for NUDGE_REFINE (in-memory, per-process)
  // Tracks requestIds that have already received NUDGE_REFINE message
  private nudgeRefineSent = new Set<string>();

  constructor(server: HTTPServer, config?: Partial<WebSocketManagerConfig>) {
    // 1. Resolve and validate configuration
    this.config = resolveWebSocketConfig(config);

    // 2. Use shared Redis client (initialized by server.ts)
    if (this.config.redisUrl) {
      this.redis = RedisService.getClientOrNull();
      if (this.redis) {
        logger.info(
          { redisUrl: this.config.redisUrl.split('@')[1] || 'local' },
          'WebSocketManager: Using shared Redis client'
        );
      } else {
        logger.warn(
          { msg: 'WebSocketManager: Redis client not available (may still be initializing)' }
        );
      }
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

    // 5. Initialize extracted services (Pass 2)
    this.backlogDrainer = new BacklogDrainerService(this.backlogManager);
    this.publisher = new PublisherService(this.subscriptionManager, this.backlogManager);
    this.subscriptionActivator = new SubscriptionActivatorService(
      this.pendingSubscriptionsManager,
      this.subscriptionManager,
      this.backlogDrainer
    );
    this.messageValidator = new MessageValidationService({
      allowLegacy: process.env.WS_ALLOW_LEGACY !== 'false',
      isProduction: process.env.NODE_ENV === 'production'
    });
    this.subscriptionAck = new SubscriptionAckService();
    this.subscribeHandler = new SubscribeHandlerService(
      this.subscriptionManager,
      this.pendingSubscriptionsManager,
      this.backlogManager,
      this.subscriptionAck
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
    // Validate message using extracted service
    const validation = this.messageValidator.validate(data, clientId);

    if (!validation.valid) {
      // Handle different validation failure reasons
      if (validation.reason === 'parse_error') {
        this.sendError(ws, 'parse_error', 'Failed to parse JSON');
        return;
      }

      if (validation.reason === 'legacy_rejected') {
        const rejection = this.messageValidator.handleLegacyRejection(ws, clientId);
        if (rejection.shouldClose) {
          ws.close(rejection.closeCode, rejection.closeReason);
        }
        return;
      }

      if (validation.reason === 'invalid_format') {
        if (validation.isSubscribe && !validation.hasRequestId) {
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
    }

    // Message is valid, proceed with routing
    void this.handleClientMessage(ws, validation.message, clientId);
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
        onSubscribe: (ws, msg) => this.subscribeHandler.handleSubscribeRequest(
          ws,
          msg,
          clientId,
          requireAuth,
          isProduction,
          (ws: WebSocket, requestId: string, clientId: string) => this.subscriptionManager.replayStateIfAvailable(
            requestId,
            ws,
            clientId,
            (ws, msg) => this.publisher.sendTo(ws, msg, this.cleanup.bind(this))
          ),
          this.cleanup.bind(this)
        ),
        sendError: this.sendError.bind(this),
        onLoadMore: this.handleLoadMore.bind(this),
        onRevealLimitReached: this.handleRevealLimitReached.bind(this)
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
   * Handle load_more event from client
   * Delegates to global load_more registry
   */
  private async handleLoadMore(ws: WebSocket, message: WSClientMessage): Promise<void> {
    const loadMoreMessage = message as any;
    const sessionId = (ws as any).sessionId as string | undefined;
    const userId = (ws as any).userId as string | undefined;

    // Dynamic import to avoid circular dependency
    const { loadMoreRegistry } = await import('../../services/search/route2/assistant/load-more-registry.js');

    await loadMoreRegistry.handle(
      loadMoreMessage.requestId,
      sessionId,
      loadMoreMessage.newOffset,
      loadMoreMessage.totalShown,
      userId
    );
  }

  /**
   * Handle reveal_limit_reached event from client
   * Sends deterministic NUDGE_REFINE assistant message (no LLM, no counts)
   * 
   * Requirements:
   * - Owner auth check (like subscribe)
   * - Idempotent: Only send once per requestId
   * - Deterministic: Select message from copypack using hash(requestId) % N
   * - No LLM calls, no counts, no ranking claims
   */
  private async handleRevealLimitReached(ws: WebSocket, message: WSClientMessage): Promise<void> {
    const revealLimitMessage = message as any;
    const requestId = revealLimitMessage.requestId;
    const uiLanguage = (revealLimitMessage.uiLanguage || 'en') as 'he' | 'en';

    logger.info({
      requestId,
      uiLanguage,
      event: 'reveal_limit_reached_handler'
    }, '[WS] Handling reveal limit reached event');

    // 1. Idempotency check: Only send once per requestId
    if (this.nudgeRefineSent.has(requestId)) {
      logger.debug({
        requestId,
        event: 'nudge_refine_duplicate'
      }, '[WS] NUDGE_REFINE already sent for this requestId, skipping');
      return;
    }

    // 2. Owner auth check (like subscribe)
    // Extract connection identity
    const wsSessionId = (ws as any).sessionId || 'anonymous';
    const wsUserId = (ws as any).userId;
    const clientId = (ws as any).clientId || 'unknown';

    // Verify ownership using SubscriptionManager's internal verifier
    const ownershipVerifier = (this.subscriptionManager as any).ownershipVerifier;

    if (!ownershipVerifier) {
      logger.error({
        requestId,
        event: 'nudge_refine_no_verifier'
      }, '[WS] OwnershipVerifier not available');
      return;
    }

    try {
      const ownershipDecision = await ownershipVerifier.verifyOwnership(
        requestId,
        wsSessionId,
        wsUserId,
        clientId,
        'assistant'
      );

      if (ownershipDecision.result !== 'ALLOW') {
        logger.warn({
          requestId,
          clientId,
          reason: ownershipDecision.reason || 'unknown',
          event: 'nudge_refine_auth_denied'
        }, '[WS] reveal_limit_reached auth denied - not owner');
        return;
      }
    } catch (error) {
      logger.error({
        requestId,
        error: error instanceof Error ? error.message : 'unknown',
        event: 'nudge_refine_auth_error'
      }, '[WS] Error checking reveal_limit_reached ownership');
      return;
    }

    // 3. Load copypack and select message deterministically
    const messageData = await this.selectNudgeMessage(requestId, uiLanguage);

    if (!messageData) {
      logger.error({
        requestId,
        uiLanguage,
        event: 'nudge_refine_selection_failed'
      }, '[WS] Failed to select NUDGE_REFINE message');
      return;
    }

    // 4. Mark as sent (idempotency)
    this.nudgeRefineSent.add(requestId);

    // 5. Build and publish NUDGE_REFINE message
    const assistantMessage: WSServerMessage = {
      type: 'assistant',
      requestId,
      payload: {
        type: 'NUDGE_REFINE',
        message: messageData.text,
        question: null,
        blocksSearch: messageData.blocksSearch,
        suggestedAction: messageData.suggestedAction,
        uiLanguage
      }
    };

    // Publish to assistant channel only (no broadcast)
    this.publishToChannel('assistant', requestId, undefined, assistantMessage);

    logger.info({
      requestId,
      type: 'NUDGE_REFINE',
      lang: uiLanguage,
      index: messageData.index,
      event: 'nudge_refine_sent'
    }, '[WS] NUDGE_REFINE message sent (deterministic, no LLM)');
  }

  /**
   * Select NUDGE_REFINE message from copypack (deterministic, no LLM)
   * Uses hash(requestId) % N for deterministic selection
   */
  private async selectNudgeMessage(
    requestId: string,
    language: 'he' | 'en'
  ): Promise<{ text: string; blocksSearch: boolean; suggestedAction: 'REFINE_QUERY'; index: number } | null> {
    try {
      // Load copypack
      const fs = await import('fs/promises');
      const path = await import('path');
      const copypackPath = path.join(
        process.cwd(),
        'src/services/search/route2/assistant/copypack/ws-nudge-copypack-v1.json'
      );

      const copypackData = await fs.readFile(copypackPath, 'utf-8');
      const copypack = JSON.parse(copypackData);

      const messages = copypack.messages[language];

      if (!Array.isArray(messages) || messages.length === 0) {
        logger.error({
          language,
          event: 'copypack_invalid'
        }, '[WS] Invalid copypack format');
        return null;
      }

      // Deterministic selection: hash(requestId) % N
      // Simple hash: sum of char codes
      let hash = 0;
      for (let i = 0; i < requestId.length; i++) {
        hash += requestId.charCodeAt(i);
      }
      const index = hash % messages.length;

      const selectedMessage = messages[index];

      logger.info({
        requestId,
        type: 'NUDGE_REFINE',
        lang: language,
        index,
        totalMessages: messages.length,
        hash,
        event: 'nudge_refine_selected'
      }, '[WS] NUDGE_REFINE message selected (deterministic)');

      return {
        text: selectedMessage.text,
        blocksSearch: selectedMessage.blocksSearch || false,
        suggestedAction: 'REFINE_QUERY' as const,
        index
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'unknown',
        event: 'copypack_load_failed'
      }, '[WS] Failed to load copypack, using hardcoded fallback');

      // Hardcoded fallback
      const fallbackMessages = {
        en: 'Showing all results. For more precise matches, try refining your search - for example, add a specific location or cuisine type.',
        he: 'הצגת כל התוצאות. כדי לקבל תוצאות מדויקות יותר, נסה לחדד את החיפוש - למשל, הוסף מיקום ספציפי או סוג מטבח מסוים.'
      };

      return {
        text: fallbackMessages[language],
        blocksSearch: false,
        suggestedAction: 'REFINE_QUERY' as const,
        index: 0
      };
    }
  }

  private cleanup(ws: WebSocket): void {
    this.subscriptionManager.cleanup(ws);
  }

  /**
   * Activate pending subscriptions for a requestId when job is created
   * Delegated to SubscriptionActivatorService
   * GUARDRAIL: Never throws - logs error if activator not ready
   */
  activatePendingSubscriptions(requestId: string, ownerSessionId: string): void {
    // GUARDRAIL: Defensive check - activator should always be initialized
    if (!this.subscriptionActivator) {
      logger.error({
        requestId,
        ownerSessionId,
        activatorState: 'undefined'
      }, '[P0 Critical] WebSocketManager.subscriptionActivator is undefined - initialization failure');
      return;
    }

    this.subscriptionActivator.activatePendingSubscriptions(
      requestId,
      ownerSessionId,
      (ws, channel, requestId, pending) => this.subscriptionAck.sendSubAck(ws, channel, requestId, pending),
      (ws, channel, requestId, reason) => this.subscriptionAck.sendSubNack(ws, channel, requestId, reason),
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
   * GUARDRAIL: Never throws - returns failure summary if publisher not ready
   */
  publishToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    message: WSServerMessage
  ): PublishSummary {
    // GUARDRAIL: Defensive check - publisher should always be initialized
    if (!this.publisher) {
      logger.error({
        channel,
        requestId,
        messageType: message.type,
        publisherState: 'undefined'
      }, '[P0 Critical] WebSocketManager.publisher is undefined - initialization failure');
      return { attempted: 0, sent: 0, failed: 0 };
    }

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

  /**
   * Publish assistant message
   * Thin wrapper over publishToChannel for assistant channel
   */
  publishAssistant(
    requestId: string,
    payload: {
      type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY' | 'SEARCH_FAILED' | 'GENERIC_QUERY_NARRATION' | 'NUDGE_REFINE';
      reason?: string;
      language?: string;
      blocksSearch?: boolean;
      message?: string;
      question?: string | null;
      suggestedAction?: string;
      uiLanguage?: 'he' | 'en';
    }
  ): PublishSummary {
    const message: WSServerMessage = {
      type: 'assistant',
      requestId,
      payload: {
        type: payload.type,
        message: payload.message || '',
        question: payload.question || null,
        blocksSearch: payload.blocksSearch ?? false,
        ...(payload.suggestedAction && { suggestedAction: payload.suggestedAction as 'REFINE_QUERY' }),
        ...(payload.uiLanguage && { uiLanguage: payload.uiLanguage })
      }
    };
    
    return this.publishToChannel('assistant', requestId, undefined, message);
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
      this.pendingSubscriptionsManager.cleanupExpired((ws, channel, requestId, reason) =>
        this.subscriptionAck.sendSubNack(ws, channel, requestId, reason)
      );

      // Cleanup expired backlogs
      this.backlogManager.cleanupExpired();
    }, this.config.heartbeatIntervalMs);

    this.heartbeatInterval.unref();
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

  /**
   * Check if there are active WebSocket subscribers for a given requestId
   * Used for deduplication staleness detection (keep alive if subscribed)
   */
  hasActiveSubscribers(requestId: string, sessionId?: string): boolean {
    const key = this.subscriptionManager.buildSubscriptionKey('search', requestId, sessionId);
    const subscribers = this.subscriptionManager.getSubscribers(key);
    return !!(subscribers && subscribers.size > 0);
  }
}
