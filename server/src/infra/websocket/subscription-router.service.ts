/**
 * Subscription Router Service
 * Routes subscription requests to appropriate actions
 * PURE routing logic - determines what action to take based on message and ownership
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import { normalizeToCanonical } from './websocket-protocol.js';
import type { WSClientMessage, WSChannel } from './websocket-protocol.js';
import type { WebSocketContext } from './websocket.types.js';
import { hashSessionId } from './websocket.types.js';
import type { OwnershipDecision } from './ownership-verifier.js';

/**
 * Subscription routing result
 */
export interface SubscriptionRoute {
  action: 'SUBSCRIBE' | 'PENDING' | 'REJECT';
  channel?: WSChannel;
  requestId?: string;
  sessionId?: string;
}

/**
 * SubscriptionRouterService
 * Decides what action to take for subscription requests
 */
export class SubscriptionRouterService {
  /**
   * Route a subscribe request
   * Returns action to take based on validation and ownership
   */
  routeSubscribeRequest(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string,
    requireAuth: boolean,
    ownershipDecision: OwnershipDecision
  ): SubscriptionRoute {
    // Step 1: Extract and normalize message envelope
    const canonical = normalizeToCanonical(message);
    const envelope = canonical as any;

    const channel: WSChannel = envelope.channel || 'search';
    const requestId = envelope.requestId as string | undefined;

    // Get context from WebSocket
    const ctx = (ws as any).ctx as WebSocketContext | undefined;
    const connSessionId = ctx?.sessionId || 'anonymous';
    const connUserId = ctx?.userId;

    const requestIdHash = this.hashRequestId(requestId || 'unknown');
    const sessionHash = hashSessionId(connSessionId);

    logger.info({
      clientId,
      channel,
      requestIdHash,
      sessionHash,
      event: 'ws_subscribe_attempt'
    }, 'WebSocket subscribe attempt');

    // Step 2: Strict payload validation
    if (!requestId) {
      logger.warn({ clientId, channel, reason: 'missing_requestId' }, 'Subscribe validation failed');
      return { action: 'REJECT' };
    }

    if (channel !== 'search' && channel !== 'assistant') {
      logger.warn({ clientId, channel, requestId: requestIdHash, reason: 'invalid_channel' }, 'Subscribe validation failed');
      return { action: 'REJECT' };
    }

    // Step 3: Auth check (if enabled)
    if (requireAuth && connSessionId === 'anonymous') {
      logger.warn({ clientId, channel, requestIdHash, reason: 'not_authenticated' }, 'Subscribe rejected - no auth');
      return { action: 'REJECT' };
    }

    // Step 4: Route based on ownership decision
    if (ownershipDecision.result === 'DENY') {
      return { action: 'REJECT' };
    }

    if (ownershipDecision.result === 'PENDING') {
      // Owner not yet set - register pending subscription
      return { action: 'PENDING', channel, requestId, sessionId: connSessionId };
    }

    // ALLOW - owner matches, accept subscription
    return { action: 'SUBSCRIBE', channel, requestId, sessionId: connSessionId };
  }

  /**
   * Hash requestId for logging
   */
  private hashRequestId(requestId: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }
}
