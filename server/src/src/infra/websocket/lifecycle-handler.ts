/**
 * Lifecycle Handler Module
 * Manages WebSocket connection lifecycle, heartbeat, and cleanup
 */

import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSServerMessage } from './websocket-protocol.js';
import { SOFT_CLOSE_REASONS } from './ws-close-reasons.js';
import { SubscriptionManager } from './subscription-manager.js';
import { setupConnection, executeHeartbeat } from './connection-handler.js';

export class LifecycleHandler {
  private heartbeatInterval: NodeJS.Timeout | undefined;

  constructor(
    private wss: WebSocketServer,
    private subscriptionManager: SubscriptionManager,
    private heartbeatIntervalMs: number,
    private onMessage: (ws: WebSocket, data: any, clientId: string) => void,
    private onClose: (ws: WebSocket, clientId: string, code: number, reasonBuffer: Buffer) => void,
    private onError: (ws: WebSocket, err: Error, clientId: string) => void
  ) {}

  /**
   * Setup new WebSocket connection
   */
  handleConnection(ws: WebSocket, req: any): void {
    setupConnection(
      ws,
      req,
      this.onMessage,
      this.onClose,
      this.onError
    );

    // DISABLED: No ws_status broadcasts to clients (UI doesn't show connection status)
    // this.sendConnectionStatus(ws, 'connected');
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat(
    cleanupFn: (ws: WebSocket) => void,
    sendSubNackFn: (ws: WebSocket, channel: any, requestId: string, reason: string) => void,
    pendingSubscriptionsCleanup: () => void,
    backlogCleanup: () => void
  ): void {
    this.heartbeatInterval = setInterval(() => {
      executeHeartbeat(this.wss.clients, cleanupFn);
      
      // NO ws_status broadcast on heartbeat - only send on lifecycle events
      // This prevents infinite "connecting" spam from heartbeat pings
      
      // Cleanup expired pending subscriptions
      pendingSubscriptionsCleanup();

      // Cleanup expired backlogs
      backlogCleanup();
    }, this.heartbeatIntervalMs);

    this.heartbeatInterval.unref();
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Cleanup WebSocket from all subscriptions (idempotent)
   */
  cleanup(ws: WebSocket): void {
    this.subscriptionManager.cleanup(ws);
  }

  /**
   * Shutdown: Close all connections and cleanup
   */
  shutdown(): void {
    this.stopHeartbeat();

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

  /**
   * Send connection status to a specific client (lifecycle events only)
   * Used by app-assistant-line to show stable WS status
   */
  sendConnectionStatus(ws: WebSocket, state: 'connected' | 'reconnecting' | 'offline'): void {
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
}
