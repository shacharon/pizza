/**
 * Subscription Manager (ORCHESTRATION)
 * Handles subscribe, unsubscribe, and message routing logic
 * Delegates ownership verification to OwnershipVerifier
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import { normalizeToCanonical } from './websocket-protocol.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import type { WebSocketContext, SubscriptionKey } from './websocket.types.js';
import { hashSessionId } from './websocket.types.js';
import type { IRequestStateStore } from '../state/request-state.store.js';
import type { ISearchJobStore } from '../../services/search/job-store/job-store.interface.js';
import { OwnershipVerifier } from './ownership-verifier.js';

/**
 * Subscription Manager Class
 * Manages channel subscriptions and message routing
 */
export class SubscriptionManager {
  private subscriptions = new Map<SubscriptionKey, Set<WebSocket>>();
  private socketToSubscriptions = new WeakMap<WebSocket, Set<SubscriptionKey>>();
  private readonly ownershipVerifier: OwnershipVerifier;

  constructor(
    private requestStateStore: IRequestStateStore | undefined,
    jobStore: ISearchJobStore | undefined
  ) {
    this.ownershipVerifier = new OwnershipVerifier(jobStore);
  }

  /**
   * Build subscription key (requestId-based for both channels)
   */
  buildSubscriptionKey(channel: WSChannel, requestId: string, sessionId?: string): SubscriptionKey {
    return `${channel}:${requestId}`;
  }

  /**
   * Subscribe to a channel
   */
  subscribe(
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
  unsubscribe(
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
   * Get subscribers for a subscription key
   */
  getSubscribers(key: SubscriptionKey): Set<WebSocket> | undefined {
    return this.subscriptions.get(key);
  }

  /**
   * Cleanup WebSocket from all subscriptions
   */
  cleanup(ws: WebSocket): void {
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
   * Handle subscribe request with ownership verification
   */
  async handleSubscribeRequest(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string,
    requireAuth: boolean,
    isProduction: boolean
  ): Promise<{
    success: boolean;
    pending?: boolean;
    channel?: WSChannel;
    requestId?: string;
    sessionId?: string;
  }> {
    // Normalize legacy to canonical
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

    // Step 1: Strict payload validation
    if (!requestId) {
      logger.warn({ clientId, channel, reason: 'missing_requestId' }, 'Subscribe validation failed');
      return { success: false };
    }

    if (channel !== 'search' && channel !== 'assistant') {
      logger.warn({ clientId, channel, requestId: requestIdHash, reason: 'invalid_channel' }, 'Subscribe validation failed');
      return { success: false };
    }

    // Step 2: Auth check (if enabled)
    if (requireAuth && connSessionId === 'anonymous') {
      logger.warn({ clientId, channel, requestIdHash, reason: 'not_authenticated' }, 'Subscribe rejected - no auth');
      return { success: false };
    }

    // Step 3: Verify ownership (delegated to OwnershipVerifier)
    const ownershipDecision = await this.ownershipVerifier.verifyOwnership(
      requestId,
      connSessionId,
      connUserId,
      clientId,
      channel
    );

    // Handle ownership decision
    if (ownershipDecision.result === 'DENY') {
      return { success: false };
    }

    if (ownershipDecision.result === 'PENDING') {
      // Owner not yet set - register pending subscription
      return { success: true, pending: true, channel, requestId, sessionId: connSessionId };
    }

    // ALLOW - owner matches, accept subscription
    this.subscribe(channel, requestId, connSessionId, ws);

    const resolvedKey = this.buildSubscriptionKey(channel, requestId, connSessionId);
    
    return { success: true, pending: false, channel, requestId, sessionId: connSessionId };
  }

  /**
   * Get request status for logging
   */
  async getRequestStatus(requestId: string): Promise<string> {
    if (!this.requestStateStore) {
      return 'unknown';
    }

    try {
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        return 'not_found';
      }

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
   * Replay state for late subscribers
   */
  async replayStateIfAvailable(
    requestId: string,
    ws: WebSocket,
    clientId: string,
    sendTo: (ws: WebSocket, message: WSServerMessage) => boolean
  ): Promise<void> {
    if (!this.requestStateStore) {
      return;
    }

    try {
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        logger.debug({ requestId, clientId }, 'No state to replay');
        return;
      }

      // Send current status
      const statusSent = sendTo(ws, {
        type: 'status',
        requestId,
        status: state.assistantStatus
      });

      // If assistant output exists, send it
      if (state.assistantOutput) {
        sendTo(ws, {
          type: 'stream.done',
          requestId,
          fullText: state.assistantOutput
        });
      }

      // If recommendations exist, send them
      if (state.recommendations && state.recommendations.length > 0) {
        sendTo(ws, {
          type: 'recommendation',
          requestId,
          actions: state.recommendations
        });
      }

      if (!statusSent) {
        return;
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

  /**
   * Get subscription stats
   */
  getStats(): {
    subscriptions: number;
    requestIdsTracked: number;
  } {
    return {
      subscriptions: Array.from(this.subscriptions.values())
        .reduce((sum, set) => sum + set.size, 0),
      requestIdsTracked: this.subscriptions.size
    };
  }

  /**
   * Hash requestId for logging
   */
  private hashRequestId(requestId: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }

}
