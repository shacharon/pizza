/**
 * Phase 3: WebSocket Manager
 * Manages WebSocket connections, subscriptions, and message routing
 * Phase 3 improvements: Late-subscriber replay + production origin checks
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage } from './websocket-protocol.js';
import { isWSClientMessage } from './websocket-protocol.js';
import type { IRequestStateStore } from '../state/request-state.store.js';

export interface WebSocketManagerConfig {
  path: string;
  heartbeatIntervalMs: number;
  allowedOrigins: string[];
  requestStateStore?: IRequestStateStore; // Phase 3: For late-subscriber replay
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private subscriptions = new Map<string, Set<WebSocket>>();
  private socketToRequests = new WeakMap<WebSocket, Set<string>>();
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
    try {
      const raw = data.toString();
      const message = JSON.parse(raw);

      if (!isWSClientMessage(message)) {
        logger.warn({
          clientId,
          messageType: message?.type,
        }, 'Invalid WebSocket message format');

        this.sendError(ws, 'invalid_message', 'Invalid message format');
        return;
      }

      logger.debug({
        clientId,
        type: message.type,
        requestId: message.requestId
      }, 'WebSocket message received');

      this.handleClientMessage(ws, message, clientId);

    } catch (err) {
      logger.error({
        clientId,
        err
      }, 'WebSocket message parse error');

      this.sendError(ws, 'parse_error', 'Failed to parse message');
    }
  }

  private async handleClientMessage(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string
  ): Promise<void> {
    switch (message.type) {
      case 'subscribe':
        this.subscribe(message.requestId, ws);
        
        // Check request state for enhanced logging
        const requestStatus = await this.getRequestStatus(message.requestId);
        
        logger.info({
          clientId,
          requestId: message.requestId,
          status: requestStatus
        }, 'websocket_subscribed');
        
        // Phase 3: Late-subscriber replay
        this.replayStateIfAvailable(message.requestId, ws, clientId);
        break;

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
   * Subscribe a WebSocket to receive updates for a specific requestId
   */
  subscribe(requestId: string, client: WebSocket): void {
    // Add to subscriptions map
    if (!this.subscriptions.has(requestId)) {
      this.subscriptions.set(requestId, new Set());
    }
    this.subscriptions.get(requestId)!.add(client);

    // Track reverse mapping for cleanup
    if (!this.socketToRequests.has(client)) {
      this.socketToRequests.set(client, new Set());
    }
    this.socketToRequests.get(client)!.add(requestId);

    logger.debug({
      requestId,
      subscriberCount: this.subscriptions.get(requestId)!.size
    }, 'WebSocket subscribed to requestId');
  }

  /**
   * Publish a message to all WebSockets subscribed to a requestId
   */
  publish(requestId: string, message: WSServerMessage): void {
    const clients = this.subscriptions.get(requestId);

    if (!clients || clients.size === 0) {
      logger.debug({ requestId }, 'No subscribers for requestId');
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

    logger.debug({
      requestId,
      messageType: message.type,
      subscriberCount: clients.size,
      sentCount: sent
    }, 'websocket_message_sent');
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
   * Cleanup: Remove WebSocket from all subscriptions (leak prevention)
   */
  private cleanup(ws: WebSocket): void {
    const requestIds = this.socketToRequests.get(ws);

    if (requestIds) {
      for (const requestId of requestIds) {
        const sockets = this.subscriptions.get(requestId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            this.subscriptions.delete(requestId);
          }
        }
      }
      this.socketToRequests.delete(ws);
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
