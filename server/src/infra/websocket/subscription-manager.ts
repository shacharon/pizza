/**
 * Subscription Manager (ORCHESTRATION)
 * Handles subscribe, unsubscribe, and message routing logic
 * Delegates ownership verification to OwnershipVerifier
 * Delegates routing decisions to SubscriptionRouterService
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import type { SubscriptionKey } from './websocket.types.js';
import type { IRequestStateStore } from '../state/request-state.store.js';
import type { ISearchJobStore } from '../../services/search/job-store/job-store.interface.js';
import { OwnershipVerifier } from './ownership-verifier.js';
import { SubscriptionRouterService } from './subscription-router.service.js';
import { RequestStateQueryService } from './request-state-query.service.js';
import { StateReplayService } from './state-replay.service.js';

/**
 * Subscription Manager Class
 * Manages channel subscriptions and message routing
 */
export class SubscriptionManager {
  private subscriptions = new Map<SubscriptionKey, Set<WebSocket>>();
  private socketToSubscriptions = new WeakMap<WebSocket, Set<SubscriptionKey>>();
  private readonly ownershipVerifier: OwnershipVerifier;
  private readonly router: SubscriptionRouterService;
  private readonly stateQuery: RequestStateQueryService;
  private readonly stateReplay: StateReplayService;

  constructor(
    private requestStateStore: IRequestStateStore | undefined,
    jobStore: ISearchJobStore | undefined
  ) {
    this.ownershipVerifier = new OwnershipVerifier(jobStore);
    this.router = new SubscriptionRouterService();
    this.stateQuery = new RequestStateQueryService(requestStateStore);
    this.stateReplay = new StateReplayService(requestStateStore);
  }

  /** Build subscription key (requestId-based for both channels) */
  buildSubscriptionKey(channel: WSChannel, requestId: string, sessionId?: string): SubscriptionKey {
    return `${channel}:${requestId}`;
  }

  /** Subscribe to a channel */
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

    // CONSOLIDATED LOG: ws_subscribe_ack (after successful registration)
    // This is the single source of truth for subscription acknowledgment
    const clientId = (client as any).clientId;
    const requestIdHash = crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
    const sessionHash = crypto.createHash('sha256').update(sessionId || 'anonymous').digest('hex').substring(0, 12);
    
    logger.info({
      clientId,
      channel,
      requestIdHash,
      sessionHash,
      pending: false,
      subscriberCount: this.subscriptions.get(key)!.size,
      event: 'ws_subscribe_ack'
    }, 'Subscribe accepted - registration complete');
  }

  /** Unsubscribe from a channel */
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

  /** Get subscribers for a subscription key */
  getSubscribers(key: SubscriptionKey): Set<WebSocket> | undefined {
    return this.subscriptions.get(key);
  }

  /** Cleanup WebSocket from all subscriptions */
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

  /** Handle subscribe request with ownership verification */
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
    // Extract requestId for ownership check
    const envelope = message as any;
    const requestId = envelope.requestId as string | undefined;
    const ctx = (ws as any).ctx as any;
    const connSessionId = ctx?.sessionId || 'anonymous';
    const connUserId = ctx?.userId;

    // Verify ownership (orchestration)
    const ownershipDecision = await this.ownershipVerifier.verifyOwnership(
      requestId || 'unknown',
      connSessionId,
      connUserId,
      clientId,
      envelope.channel || 'search'
    );

    // Route the request (delegated to router)
    const route = this.router.routeSubscribeRequest(
      ws,
      message,
      clientId,
      requireAuth,
      ownershipDecision
    );

    // Execute action based on routing decision
    if (route.action === 'REJECT') {
      return { success: false };
    }

    if (route.action === 'PENDING') {
      return {
        success: true,
        pending: true,
        channel: route.channel!,
        requestId: route.requestId!,
        sessionId: route.sessionId!
      };
    }

    // SUBSCRIBE - accept subscription
    this.subscribe(route.channel!, route.requestId!, route.sessionId, ws);
    return {
      success: true,
      pending: false,
      channel: route.channel!,
      requestId: route.requestId!,
      sessionId: route.sessionId!
    };
  }

  /**
   * Get request status for logging
   * Delegated to RequestStateQueryService
   */
  async getRequestStatus(requestId: string): Promise<string> {
    return this.stateQuery.getRequestStatus(requestId);
  }

  /**
   * Replay state for late subscribers
   * Delegated to StateReplayService
   */
  async replayStateIfAvailable(
    requestId: string,
    ws: WebSocket,
    clientId: string,
    sendTo: (ws: WebSocket, message: WSServerMessage) => boolean
  ): Promise<void> {
    return this.stateReplay.replayStateIfAvailable(requestId, ws, clientId, sendTo);
  }

  /** Get subscription stats */
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
}
