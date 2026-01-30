/**
 * WebSocket Message Router
 * Routes client messages to appropriate handlers
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import { isWSClientMessage } from './websocket-protocol.js';
import type { SubscriptionManager } from './subscription-manager.js';
import type { SocketRateLimiter } from './rate-limiter.js';
import { HARD_CLOSE_REASONS } from './ws-close-reasons.js';

/**
 * Message routing result
 */
interface RouteResult {
  success: boolean;
  shouldClose?: boolean;
  closeCode?: number;
  closeReason?: string;
}

/**
 * WebSocketMessageRouter
 * Handles incoming client messages and routes to appropriate handlers
 */
export class WebSocketMessageRouter {
  constructor(
    private subscriptionManager: SubscriptionManager,
    private rateLimiter: SocketRateLimiter,
    private config: {
      requireAuth: boolean;
      isProduction: boolean;
    }
  ) { }

  /**
   * Route client message to appropriate handler
   */
  async routeMessage(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string,
    callbacks: {
      onSubscribe: (ws: WebSocket, message: WSClientMessage) => Promise<void>;
      sendError: (ws: WebSocket, error: string, message: string) => void;
      onLoadMore?: (ws: WebSocket, message: WSClientMessage) => Promise<void>;
      onRevealLimitReached?: (ws: WebSocket, message: WSClientMessage) => Promise<void>;
    }
  ): Promise<RouteResult> {
    const wsSessionId = (ws as any).sessionId as string | undefined;

    switch (message.type) {
      case 'subscribe': {
        // Rate limit check
        if (!this.rateLimiter.check(ws)) {
          logger.warn({
            clientId,
            sessionId: wsSessionId || 'none',
            event: 'subscribe_rate_limited'
          }, 'WebSocket subscribe rate limit exceeded');

          callbacks.sendError(ws, 'rate_limit_exceeded', 'Too many subscribe requests');
          return { success: false };
        }

        // Delegate to subscribe handler with error handling
        try {
          await callbacks.onSubscribe(ws, message);
          return { success: true };
        } catch (error) {
          logger.error({
            clientId,
            sessionId: wsSessionId || 'none',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            event: 'subscribe_handler_error'
          }, 'Subscribe handler threw error');
          
          callbacks.sendError(ws, 'internal_error', 'Failed to process subscribe request');
          return { success: false };
        }
      }

      case 'unsubscribe': {
        const envelope = message as any;
        const channel: WSChannel = envelope.channel;
        const requestId = envelope.requestId as string | undefined;
        const effectiveSessionId = wsSessionId;

        if (this.config.requireAuth && !effectiveSessionId) {
          callbacks.sendError(ws, 'unauthorized', 'Authentication required');
          return {
            success: false,
            shouldClose: true,
            closeCode: 1008,
            closeReason: HARD_CLOSE_REASONS.NOT_AUTHORIZED
          };
        }

        this.subscriptionManager.unsubscribe(channel, requestId || 'unknown', effectiveSessionId, ws);

        logger.info(
          {
            clientId,
            channel,
            requestIdHash: this.config.isProduction ? this.hashRequestId(requestId) : requestId,
            ...(this.config.isProduction ? {} : { sessionId: effectiveSessionId || 'none' })
          },
          'websocket_unsubscribed'
        );
        return { success: true };
      }

      case 'event': {
        const envelope = message as any;
        logger.debug(
          {
            clientId,
            channel: envelope.channel,
            requestIdHash: this.config.isProduction ? this.hashRequestId(envelope.requestId) : envelope.requestId
          },
          'websocket_event_received'
        );
        return { success: true };
      }

      case 'action_clicked':
        logger.info(
          {
            clientId,
            requestIdHash: this.config.isProduction ? this.hashRequestId((message as any).requestId) : (message as any).requestId,
            actionId: (message as any).actionId
          },
          'websocket_action_clicked'
        );
        return { success: true };

      case 'ui_state_changed':
        logger.debug(
          {
            clientId,
            requestIdHash: this.config.isProduction ? this.hashRequestId((message as any).requestId) : (message as any).requestId
          },
          'websocket_ui_state_changed'
        );
        return { success: true };

      case 'load_more': {
        const loadMoreMessage = message as any;
        logger.info(
          {
            clientId,
            requestIdHash: this.config.isProduction ? this.hashRequestId(loadMoreMessage.requestId) : loadMoreMessage.requestId,
            newOffset: loadMoreMessage.newOffset,
            totalShown: loadMoreMessage.totalShown
          },
          'websocket_load_more_event'
        );

        // Delegate to load more handler if provided
        if (callbacks.onLoadMore) {
          await callbacks.onLoadMore(ws, message);
        }

        return { success: true };
      }

      case 'reveal_limit_reached': {
        const revealLimitMessage = message as any;
        logger.info(
          {
            clientId,
            requestIdHash: this.config.isProduction ? this.hashRequestId(revealLimitMessage.requestId) : revealLimitMessage.requestId,
            uiLanguage: revealLimitMessage.uiLanguage
          },
          'websocket_reveal_limit_reached_event'
        );

        // Delegate to reveal limit handler if provided
        if (callbacks.onRevealLimitReached) {
          await callbacks.onRevealLimitReached(ws, message);
        }

        return { success: true };
      }

      default:
        return { success: false };
    }
  }

  /**
   * Hash requestId for logging
   */
  private hashRequestId(requestId?: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }
}
