/**
 * Phase 3: WebSocket Manager
 * Manages WebSocket connections, subscriptions, and message routing
 * Phase 3 improvements: Late-subscriber replay + production origin checks
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import { isWSClientMessage, normalizeToCanonical } from './websocket-protocol.js';
import type { IRequestStateStore } from '../state/request-state.store.js';

export interface WebSocketManagerConfig {
  path: string;
  heartbeatIntervalMs: number;
  allowedOrigins: string[];
  requestStateStore?: IRequestStateStore; // Phase 3: For late-subscriber replay
}

/**
 * Subscription key: channel:requestId or channel:sessionId
 */
type SubscriptionKey = string;

export class WebSocketManager {
  private wss: WebSocketServer;
  // Unified subscription map: key = "channel:requestId" or "channel:sessionId"
  private subscriptions = new Map<SubscriptionKey, Set<WebSocket>>();
  private socketToSubscriptions = new WeakMap<WebSocket, Set<SubscriptionKey>>();
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private config: WebSocketManagerConfig;
  private requestStateStore: IRequestStateStore | undefined;

  constructor(server: HTTPServer, config?: Partial<WebSocketManagerConfig>) {
    this.config = {
      path: config?.path || '/ws',
      heartbeatIntervalMs: config?.heartbeatIntervalMs || 30_000,
      allowedOrigins: config?.allowedOrigins || ['*'],
    };

    this.requestStateStore = config?.requestStateStore;

    // Phase 3: Production origin check
    if (process.env.NODE_ENV === 'production') {
      if (!this.config.allowedOrigins || this.config.allowedOrigins.length === 0 || this.config.allowedOrigins.includes('*')) {
        logger.error({
          allowedOrigins: this.config.allowedOrigins,
          env: process.env.NODE_ENV
        }, 'SECURITY: WebSocket allowedOrigins must be explicitly set in production (not *)');

        // In production, reject all if misconfigured
        this.config.allowedOrigins = ['__PRODUCTION_MISCONFIGURED__'];
      }
    }

    this.wss = new WebSocketServer({
      server,
      path: this.config.path,
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();

    logger.info({
      path: this.config.path,
      heartbeatMs: this.config.heartbeatIntervalMs,
      allowedOrigins: this.config.allowedOrigins,
      hasStateStore: !!this.requestStateStore
    }, 'WebSocketManager initialized');
  }

  private verifyClient(info: { origin: string; req: any }): boolean {
    // MVP: Allow all origins or check allowlist
    if (this.config.allowedOrigins.includes('*')) {
      return true;
    }

    const origin = info.origin || info.req.headers.origin;
    const allowed = this.config.allowedOrigins.some(allowedOrigin =>
      origin?.includes(allowedOrigin)
    );

    if (!allowed) {
      logger.warn({ origin }, 'WebSocket connection rejected: origin not allowed');
    }

    return allowed;
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();

    logger.info({
      clientId,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent']
    }, 'websocket_connected');

    // Initialize ping/pong
    (ws as any).isAlive = true;
    (ws as any).clientId = clientId; // Store for heartbeat logging
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', (data) => this.handleMessage(ws, data, clientId));
    ws.on('close', (code, reason) => this.handleClose(ws, clientId, code, reason));
    ws.on('error', (err) => this.handleError(ws, err, clientId));
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

    // Normalize requestId from various legacy locations (backward compatibility)
    if (message && message.type === 'subscribe' && !message.requestId) {
      // Check payload.requestId
      if (message.payload?.requestId) {
        message.requestId = message.payload.requestId;
        logger.debug({ clientId }, '[WS] Normalized requestId from payload.requestId');
      }
      // Check data.requestId
      else if ((message as any).data?.requestId) {
        message.requestId = (message as any).data.requestId;
        logger.debug({ clientId }, '[WS] Normalized requestId from data.requestId');
      }
      // Check reqId
      else if ((message as any).reqId) {
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

      // Send specific error for missing requestId on subscribe
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

    // Log message metadata only (no payload)
    const logData: any = {
      clientId,
      type: message.type,
      hasRequestId: 'requestId' in message,
      hasSessionId: 'sessionId' in message
    };

    if ('channel' in message) {
      logData.channel = message.channel;
    }

    logger.debug(logData, 'WebSocket message received');

    this.handleClientMessage(ws, message, clientId);
  }

  private async handleClientMessage(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string
  ): Promise<void> {
    switch (message.type) {
      case 'subscribe': {
        // Normalize legacy to canonical
        const canonical = normalizeToCanonical(message);
        const envelope = canonical as any;

        const channel: WSChannel = envelope.channel || 'search';
        const requestId = envelope.requestId;
        const sessionId = envelope.sessionId;

        // Subscribe using channel-based key
        this.subscribeToChannel(channel, requestId, sessionId, ws);

        // Minimal logging (no status check for search)
        if (channel === 'search') {
          logger.info({
            clientId,
            channel,
            requestId
          }, 'websocket_subscribed');

          // Phase 3: Late-subscriber replay
          this.replayStateIfAvailable(requestId, ws, clientId);
        } else {
          // Assistant channel: include sessionId and status
          const requestStatus = await this.getRequestStatus(requestId);
          logger.info({
            clientId,
            channel,
            requestId,
            sessionId: sessionId || 'none',
            status: requestStatus
          }, 'websocket_subscribed');
        }
        break;
      }

      case 'unsubscribe': {
        const envelope = message as any;
        const channel: WSChannel = envelope.channel;
        const requestId = envelope.requestId;
        const sessionId = envelope.sessionId;

        this.unsubscribeFromChannel(channel, requestId, sessionId, ws);

        logger.info({
          clientId,
          channel,
          requestId,
          sessionId: sessionId || 'none'
        }, 'websocket_unsubscribed');
        break;
      }

      case 'event': {
        const envelope = message as any;
        logger.debug({
          clientId,
          channel: envelope.channel,
          requestId: envelope.requestId
        }, 'websocket_event_received');
        // TODO: Handle custom events
        break;
      }

      case 'action_clicked':
        logger.info({
          clientId,
          requestId: message.requestId,
          actionId: message.actionId
        }, 'websocket_action_clicked');
        // TODO Phase 4: Handle action clicks
        break;

      case 'ui_state_changed':
        logger.debug({
          clientId,
          requestId: message.requestId
        }, 'websocket_ui_state_changed');
        // TODO Phase 4: Handle UI state changes
        break;
    }
  }

  /**
   * Get request status for logging
   */
  private async getRequestStatus(requestId: string): Promise<string> {
    if (!this.requestStateStore) {
      return 'unknown'; // No state store available
    }

    try {
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        return 'not_found'; // Request doesn't exist or expired
      }

      // Map assistant status to subscribe log status
      switch (state.assistantStatus) {
        case 'pending':
          return 'pending';
        case 'streaming':
          return 'streaming';
        case 'completed':
          return 'completed';
        case 'failed':
          return 'failed';
        default:
          return 'unknown';
      }
    } catch (error) {
      logger.debug({ requestId, error }, 'Failed to get request status');
      return 'error';
    }
  }

  /**
   * Phase 3: Late-subscriber replay
   * Send cached state to newly subscribed clients
   */
  private async replayStateIfAvailable(
    requestId: string,
    ws: WebSocket,
    clientId: string
  ): Promise<void> {
    if (!this.requestStateStore) {
      return; // No state store configured
    }

    try {
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        logger.debug({ requestId, clientId }, 'No state to replay');
        return;
      }

      // Send current status
      this.sendTo(ws, {
        type: 'status',
        requestId,
        status: state.assistantStatus
      });

      // If assistant output exists, send it
      if (state.assistantOutput) {
        this.sendTo(ws, {
          type: 'stream.done',
          requestId,
          fullText: state.assistantOutput
        });
      }

      // If recommendations exist, send them
      if (state.recommendations && state.recommendations.length > 0) {
        this.sendTo(ws, {
          type: 'recommendation',
          requestId,
          actions: state.recommendations
        });
      }

      logger.info({
        requestId,
        clientId,
        hasOutput: !!state.assistantOutput,
        hasRecommendations: !!(state.recommendations && state.recommendations.length > 0)
      }, 'websocket_replay_sent');

    } catch (error) {
      logger.error({
        requestId,
        clientId,
        error
      }, 'Failed to replay state');
    }
  }

  private handleClose(ws: WebSocket, clientId: string, code: number, reasonBuffer: Buffer): void {
    this.cleanup(ws);

    const reason = reasonBuffer?.toString() || '';
    const wasClean = code === 1000 || code === 1001;

    logger.info({
      clientId,
      code,
      reason: reason || 'none',
      wasClean,
      ...(((ws as any).terminatedBy) && { terminatedBy: (ws as any).terminatedBy })
    }, 'websocket_disconnected');
  }

  private handleError(ws: WebSocket, err: Error, clientId: string): void {
    logger.error({ clientId, err }, 'WebSocket error');
    this.cleanup(ws);
  }

  /**
   * Build subscription key
   * For search channel: always use requestId (ignore sessionId)
   * For assistant channel: use sessionId if provided, else requestId
   */
  private buildSubscriptionKey(channel: WSChannel, requestId: string, sessionId?: string): SubscriptionKey {
    if (channel === 'search') {
      return `search:${requestId}`;
    }

    // Assistant channel: prefer session-based
    if (sessionId) {
      return `${channel}:${sessionId}`;
    }
    return `${channel}:${requestId}`;
  }

  /**
   * Subscribe to a channel (unified)
   */
  private subscribeToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    client: WebSocket
  ): void {
    const key = this.buildSubscriptionKey(channel, requestId, sessionId);

    // Add to subscriptions map
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(client);

    // Track reverse mapping for cleanup
    if (!this.socketToSubscriptions.has(client)) {
      this.socketToSubscriptions.set(client, new Set());
    }
    this.socketToSubscriptions.get(client)!.add(key);

    logger.debug({
      channel,
      requestId,
      sessionId: sessionId || 'none',
      subscriberCount: this.subscriptions.get(key)!.size
    }, 'WebSocket subscribed to channel');
  }

  /**
   * Unsubscribe from a channel
   */
  private unsubscribeFromChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    client: WebSocket
  ): void {
    const key = this.buildSubscriptionKey(channel, requestId, sessionId);

    const subscribers = this.subscriptions.get(key);
    if (subscribers) {
      subscribers.delete(client);
      if (subscribers.size === 0) {
        this.subscriptions.delete(key);
      }
    }

    const clientSubs = this.socketToSubscriptions.get(client);
    if (clientSubs) {
      clientSubs.delete(key);
    }

    logger.debug({
      channel,
      requestId,
      sessionId: sessionId || 'none'
    }, 'WebSocket unsubscribed from channel');
  }

  /**
   * Legacy: Subscribe a WebSocket to receive updates for a specific requestId
   * @deprecated Use subscribeToChannel with channel parameter
   */
  subscribe(requestId: string, client: WebSocket): void {
    this.subscribeToChannel('search', requestId, undefined, client);
  }

  /**
   * Publish to a specific channel
   */
  publishToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    message: WSServerMessage
  ): void {
    const key = this.buildSubscriptionKey(channel, requestId, sessionId);
    const clients = this.subscriptions.get(key);

    if (!clients || clients.size === 0) {
      logger.debug({ channel, requestId, sessionId: sessionId || 'none' }, 'No subscribers for channel key');
      return;
    }

    const data = JSON.stringify(message);
    let sent = 0;

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        sent++;
      }
    }

    logger.info({
      channel,
      requestId,
      clientCount: sent
    }, 'websocket_published');
  }

  /**
   * Legacy: Publish a message to all WebSockets subscribed to a requestId
   * @deprecated Use publishToChannel with channel parameter
   */
  publish(requestId: string, message: WSServerMessage): void {
    this.publishToChannel('search', requestId, undefined, message);
  }

  /**
   * Send a message to a specific WebSocket
   */
  private sendTo(ws: WebSocket, message: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message to a specific WebSocket
   */
  private sendError(ws: WebSocket, error: string, message: string): void {
    this.sendTo(ws, {
      type: 'error',
      requestId: 'unknown',
      error,
      message
    });
  }

  /**
   * Send validation error with structured payload
   */
  private sendValidationError(ws: WebSocket, errorPayload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorPayload));
    }
  }

  /**
   * Cleanup: Remove WebSocket from all subscriptions (leak prevention)
   */
  private cleanup(ws: WebSocket): void {
    const subscriptionKeys = this.socketToSubscriptions.get(ws);

    if (subscriptionKeys) {
      for (const key of subscriptionKeys) {
        const sockets = this.subscriptions.get(key);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            this.subscriptions.delete(key);
          }
        }
      }
      this.socketToSubscriptions.delete(ws);
    }
  }

  /**
   * Heartbeat: Ping all connections, terminate dead ones
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      let activeCount = 0;
      let terminatedCount = 0;

      this.wss.clients.forEach((ws: any) => {
        if (ws.isAlive === false) {
          // Mark termination source for disconnect logging
          ws.terminatedBy = 'server_heartbeat';
          this.cleanup(ws);
          ws.terminate();
          terminatedCount++;

          // Log individual heartbeat termination with clientId
          if (ws.clientId) {
            logger.info({
              clientId: ws.clientId,
              reason: 'heartbeat_timeout'
            }, 'WebSocket heartbeat: terminating unresponsive connection');
          }
          return;
        }

        ws.isAlive = false;
        ws.ping();
        activeCount++;
      });

      if (terminatedCount > 0) {
        logger.debug({
          terminated: terminatedCount,
          active: activeCount
        }, 'WebSocket heartbeat: terminated dead connections');
      }
    }, this.config.heartbeatIntervalMs);

    // Non-blocking
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
      ws.close(1001, 'Server shutting down');
    });

    this.wss.close();
    this.subscriptions.clear();

    logger.info({
      closedConnections: clientCount
    }, 'WebSocketManager shutdown');
  }

  /**
   * Generate unique client ID for logging
   */
  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get stats for monitoring
   */
  getStats(): {
    connections: number;
    subscriptions: number;
    requestIdsTracked: number;
  } {
    return {
      connections: this.wss.clients.size,
      subscriptions: Array.from(this.subscriptions.values())
        .reduce((sum, set) => sum + set.size, 0),
      requestIdsTracked: this.subscriptions.size
    };
  }
}
