/**
 * Phase 3: WebSocket Manager
 * Manages WebSocket connections, subscriptions, and message routing
 * Phase 3 improvements: Late-subscriber replay + production origin checks
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage, WSServerMessage, WSChannel } from './websocket-protocol.js';
import { isWSClientMessage, normalizeToCanonical } from './websocket-protocol.js';
import type { IRequestStateStore } from '../state/request-state.store.js';
import type { ISearchJobStore } from '../../services/search/job-store/job-store.interface.js';
import Redis from 'ioredis';
import { validateOrigin, getSafeOriginSummary } from '../../lib/security/origin-validator.js';

// @server/src/infra/websocket/websocket-manager.ts

export interface WebSocketManagerConfig {
  path: string;
  heartbeatIntervalMs: number;
  allowedOrigins: string[];
  requestStateStore?: IRequestStateStore;
  jobStore?: ISearchJobStore;  // Phase 1: For ownership verification
  redisUrl?: string;
}
/**
 * Subscription key: channel:requestId or channel:sessionId
 */
type SubscriptionKey = string;

/**
 * Backlog entry for messages published before subscribers
 */
interface BacklogEntry {
  items: WSServerMessage[];
  expiresAt: number;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  // Unified subscription map: key = "channel:requestId" or "channel:sessionId"
  private subscriptions = new Map<SubscriptionKey, Set<WebSocket>>();
  private socketToSubscriptions = new WeakMap<WebSocket, Set<SubscriptionKey>>();
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private config: WebSocketManagerConfig;
  private requestStateStore: IRequestStateStore | undefined;
  private jobStore: ISearchJobStore | undefined;  // Phase 1: For ownership verification

  // Message backlog for late subscribers
  private backlog = new Map<SubscriptionKey, BacklogEntry>();
  private readonly BACKLOG_TTL_MS = 2 * 60 * 1000; // 2 minutes
  private readonly BACKLOG_MAX_ITEMS = 50;

  private redis: Redis.Redis | null = null;

  // Send operation counters
  private messagesSent = 0;
  private messagesFailed = 0;

  constructor(server: HTTPServer, config?: Partial<WebSocketManagerConfig>) {
    // 1. Resolve allowedOrigins from ENV (unified with CORS)
    // Priority: FRONTEND_ORIGINS > ALLOWED_ORIGINS (backward compat) > config
    const frontendOriginsEnv = process.env.FRONTEND_ORIGINS || process.env.ALLOWED_ORIGINS || '';
    const envAllowedOrigins = frontendOriginsEnv
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const isProduction = process.env.NODE_ENV === 'production';

    // 2. Dev/local defaults: explicitly allow localhost:4200 for Angular dev server
    const devDefaults = ['http://localhost:4200', 'http://127.0.0.1:4200'];

    // 3. Resolve base config
    this.config = {
      path: config?.path || '/ws',
      heartbeatIntervalMs: config?.heartbeatIntervalMs || 30_000,
      allowedOrigins:
        envAllowedOrigins.length > 0
          ? envAllowedOrigins
          : config?.allowedOrigins || (isProduction ? [] : devDefaults),
    };

    this.requestStateStore = config?.requestStateStore;
    this.jobStore = config?.jobStore;

    // 3. Initialize Redis Connection (CTO addition for shared backlog + WS ticket auth)
    const redisUrl = config?.redisUrl || process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis.Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true
      });
      logger.info({ redisUrl: redisUrl.split('@')[1] || 'local' }, 'WebSocketManager: Redis enabled');
    }

    // 3a. Security: Redis required for ticket-based auth
    const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false'; // default true
    if (requireAuth && !this.redis) {
      logger.error(
        { isProduction, requireAuth },
        'SECURITY: Redis required for WebSocket ticket authentication'
      );
      throw new Error('Redis connection required for WebSocket ticket authentication');
    }

    // 4. Production security gate with Fallback Logic
    // IMPORTANT: In production, NEVER allow wildcard (*) or empty allowlist
    if (isProduction) {
      if (
        this.config.allowedOrigins.length === 0 ||
        this.config.allowedOrigins.includes('*')
      ) {
        const fallbackOrigin =
          process.env.WS_FALLBACK_ORIGIN || 'https://app.going2eat.food';

        logger.warn(
          {
            fallbackOrigin,
            current: this.config.allowedOrigins,
          },
          'SECURITY: Production WS origins invalid, applying fallback domain'
        );

        this.config.allowedOrigins = [fallbackOrigin];
      }

      // Final safety check to prevent accidental wildcard leak
      if (this.config.allowedOrigins.includes('*')) {
        logger.error(
          { env: process.env.NODE_ENV, allowedOrigins: this.config.allowedOrigins },
          'SECURITY: WebSocket wildcard (*) BLOCKED in production'
        );
        this.config.allowedOrigins = ['__PRODUCTION_MISCONFIGURED__'];
      }
    }

    // 5. Init WebSocket server with Security Limits
    this.wss = new WebSocketServer({
      server,
      path: this.config.path,
      verifyClient: (info, callback) => {
        // Wrap async verifyClient in callback pattern
        this.verifyClient(info)
          .then((allowed) => callback(allowed))
          .catch((err) => {
            logger.error({ error: err instanceof Error ? err.message : 'unknown' }, 'WS: verifyClient error');
            callback(false);
          });
      },
      maxPayload: 1024 * 1024, // CTO Security: Prevent OOM attacks by limiting payload to 1MB
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();

    // 6. Final authoritative boot log with safe origin summary
    logger.info(
      {
        path: this.config.path,
        originsCount: this.config.allowedOrigins.length,
        originsSummary: getSafeOriginSummary(this.config.allowedOrigins),
        env: process.env.NODE_ENV || 'development',
        redisEnabled: !!this.redis,
        hasStateStore: !!this.requestStateStore,
      },
      'WebSocketManager: Initialized'
    );
  }

  private async verifyClient(info: { origin?: string; req: any; secure?: boolean }): Promise<boolean> {
    const isProduction = process.env.NODE_ENV === 'production';

    // Auth is REQUIRED by default. Disable only explicitly (prefer local dev only).
    const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false'; // default true

    // Prefer XFF (behind ALB/Proxy), fallback to socket remoteAddress
    const ip =
      (info.req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()) ||
      info.req?.socket?.remoteAddress;

    // Phase 1: Production security gates
    if (isProduction) {
      if (this.config.allowedOrigins.includes('*')) {
        logger.error({ ip }, 'WS: Rejected - wildcard forbidden in production');
        return false;
      }
      if (this.config.allowedOrigins.includes('__PRODUCTION_MISCONFIGURED__')) {
        logger.error({ ip }, 'WS: Rejected - misconfigured origins');
        return false;
      }

      // Enforce HTTPS via proxy header (TLS terminates at ALB)
      const xfProto = (info.req?.headers?.['x-forwarded-proto'] ?? '').toString();
      if (xfProto && xfProto !== 'https') {
        logger.warn({ ip, protocol: xfProto }, 'WS: Rejected - non-HTTPS in production');
        return false;
      }
    }

    // Phase 2: Origin validation using shared utility
    const rawOrigin = (info.origin ?? info.req?.headers?.origin)?.toString();

    // Special case: localhost without origin in dev
    const isLocal = ip === '127.0.0.1' || ip === '::1';
    const allowNoOrigin = !isProduction && isLocal;

    const result = validateOrigin(rawOrigin, {
      allowedOrigins: this.config.allowedOrigins,
      allowNoOrigin,
      isProduction,
      allowWildcardInDev: true,
      context: 'websocket'
    });

    if (!result.allowed) {
      logger.warn({ ip, origin: rawOrigin, reason: result.reason }, 'WS: Connection rejected');
      return false;
    }

    // Phase 3: Authentication (default ON; can be disabled explicitly, ideally local dev only)
    if (requireAuth) {
      // Extract ticket from query param (SECURE: one-time ticket, not JWT)
      const url = new URL(info.req.url || '', 'ws://dummy');
      const ticket = url.searchParams.get('ticket');

      if (!ticket) {
        logger.warn({ ip, origin: rawOrigin }, 'WS: Rejected - no auth ticket');
        return false;
      }

      // Verify ticket with Redis (one-time use)
      if (!this.redis) {
        logger.error({ ip, origin: rawOrigin }, 'WS: Rejected - Redis unavailable for ticket verification');
        return false;
      }

      try {
        const redisKey = `ws_ticket:${ticket}`;
        
        // Get and delete ticket atomically (one-time use)
        const ticketData = await this.redis.get(redisKey);
        
        if (!ticketData) {
          logger.warn(
            { 
              ip, 
              origin: rawOrigin, 
              ticketHash: crypto.createHash('sha256').update(ticket).digest('hex').substring(0, 12)
            },
            'WS: Rejected - ticket invalid or expired'
          );
          return false;
        }

        // Delete ticket immediately (one-time use)
        await this.redis.del(redisKey);

        // Parse ticket data
        const ticketPayload = JSON.parse(ticketData) as {
          userId?: string | null;
          sessionId: string;
          createdAt: number;
        };

        // Attach identity to request for handleConnection
        (info.req as any).userId = ticketPayload.userId || undefined;
        (info.req as any).sessionId = ticketPayload.sessionId;

        logger.debug(
          {
            ip,
            sessionId: ticketPayload.sessionId.substring(0, 12) + '...',
            hasUserId: Boolean(ticketPayload.userId),
            ticketAgeMs: Date.now() - ticketPayload.createdAt
          },
          'WS: Authenticated via ticket'
        );
      } catch (error) {
        logger.error(
          {
            ip,
            origin: rawOrigin,
            error: error instanceof Error ? error.message : 'unknown'
          },
          'WS: Rejected - ticket verification error'
        );
        return false;
      }
    } else {
      // If you intentionally disable auth, keep an explicit log line.
      logger.warn(
        { ip, isProduction },
        'WS: Authentication disabled via WS_REQUIRE_AUTH=false'
      );
    }

    return true;
  }




  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();

    // Phase 1: Attach authenticated identity to WebSocket
    (ws as any).userId = req.userId ?? undefined;
    (ws as any).sessionId = req.sessionId ?? undefined;

    // Prefer XFF (behind ALB/Proxy), fallback to socket remoteAddress
    const ip =
      (req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()) ||
      req?.socket?.remoteAddress;

    // Extract host from origin safely (never throw)
    const rawOrigin = (req?.headers?.origin ?? '').toString();
    let originHost = 'unknown';
    if (rawOrigin) {
      try {
        originHost = new URL(rawOrigin).hostname;
      } catch {
        originHost = 'invalid';
      }
    }

    logger.debug(
      {
        clientId,
        ip,
        originHost,
        authenticated: !!((ws as any).userId || (ws as any).sessionId)
      },
      'websocket_connected'
    );

    // Initialize ping/pong
    (ws as any).isAlive = true;
    (ws as any).clientId = clientId;

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    // Optional: idle timeout (15 min). Remove if you already have heartbeat-based cleanup elsewhere.
    let idleTimer: NodeJS.Timeout | undefined;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        try {
          ws.close(1000, 'Idle timeout');
        } catch {
          // ignore
        }
      }, 15 * 60 * 1000);
    };
    armIdle();

    ws.on('message', (data) => {
      armIdle();
      this.handleMessage(ws, data, clientId);
    });

    ws.on('close', (code, reason) => {
      if (idleTimer) clearTimeout(idleTimer);
      this.handleClose(ws, clientId, code, reason);
    });

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
    const isProduction = process.env.NODE_ENV === 'production';
    const requireAuth = process.env.WS_REQUIRE_AUTH !== 'false'; // default true

    const wsUserId = (ws as any).userId as string | undefined;
    const wsSessionId = (ws as any).sessionId as string | undefined;

    switch (message.type) {
      case 'subscribe': {
        // Normalize legacy to canonical
        const canonical = normalizeToCanonical(message);
        const envelope = canonical as any;

        const channel: WSChannel = envelope.channel || 'search';
        const requestId = envelope.requestId as string | undefined;
        const sessionIdFromClient = envelope.sessionId as string | undefined;

        // Phase 1: Authorization - require authenticated identity when auth is enabled
        if (requireAuth && !wsUserId && !wsSessionId) {
          logger.warn(
            { clientId, channel, requestIdHash: this.hashRequestId(requestId) },
            'WS: Subscribe rejected - not authenticated'
          );
          this.sendError(ws, 'unauthorized', 'Authentication required');
          return;
        }

        // Basic validation
        if (!requestId && channel === 'search') {
          logger.warn({ clientId, channel }, 'WS: Subscribe rejected - missing requestId');
          this.sendError(ws, 'invalid_request', 'Missing requestId');
          return;
        }

        // Phase 2: Ownership verification
        if (channel === 'assistant') {
          // Assistant channel: must have authenticated sessionId when auth is enabled
          if (requireAuth && !wsSessionId) {
            logger.warn(
              { clientId, channel, requestIdHash: this.hashRequestId(requestId) },
              'WS: Subscribe rejected - missing authenticated session'
            );
            this.sendError(ws, 'unauthorized', 'Authentication required');
            return;
          }

          // If client provided a sessionId, it must match authenticated sessionId (defense-in-depth)
          if (requireAuth && sessionIdFromClient && wsSessionId && sessionIdFromClient !== wsSessionId) {
            logger.warn(
              {
                clientId,
                channel,
                requestIdHash: this.hashRequestId(requestId),
                reason: 'session_mismatch'
              },
              'WS: Subscribe rejected - unauthorized session'
            );
            this.sendError(ws, 'unauthorized', 'Not authorized for this session');
            return;
          }
        } else if (channel === 'search') {
          const rid = requestId as string;

          let owner: { userId?: string | null; sessionId?: string | null } | null = null;
          try {
            owner = await this.getRequestOwner(rid);
          } catch (err) {
            logger.warn(
              {
                clientId,
                channel,
                requestIdHash: this.hashRequestId(rid),
                reason: 'owner_lookup_failed'
              },
              'WS: Subscribe rejected - owner lookup failed'
            );
            // If auth is enabled, fail-closed in ALL environments (not just production)
            if (requireAuth) {
              this.sendError(ws, 'unauthorized', 'Not authorized for this request');
              return;
            }
          }

          // Fail-closed when auth is enabled if owner is missing
          if (requireAuth && !owner) {
            logger.warn(
              {
                clientId,
                channel,
                requestIdHash: this.hashRequestId(rid),
                reason: 'owner_missing'
              },
              'WS: Subscribe rejected - owner missing'
            );
            this.sendError(ws, 'unauthorized', 'Not authorized for this request');
            return;
          }

          if (owner) {
            // Prefer userId ownership when present
            if (owner.userId) {
              if (!wsUserId || owner.userId !== wsUserId) {
                logger.warn(
                  {
                    clientId,
                    channel,
                    requestIdHash: this.hashRequestId(rid),
                    reason: 'user_mismatch',
                    wsUserId: wsUserId ? 'present' : 'missing',
                    ownerUserId: 'present'
                  },
                  'WS: Subscribe rejected - unauthorized request (user mismatch)'
                );
                this.sendError(ws, 'unauthorized', 'Not authorized for this request');
                return;
              }
            } else if (owner.sessionId) {
              if (!wsSessionId || owner.sessionId !== wsSessionId) {
                logger.warn(
                  {
                    clientId,
                    channel,
                    requestIdHash: this.hashRequestId(rid),
                    reason: 'session_mismatch',
                    wsSessionId: wsSessionId ? wsSessionId.substring(0, 12) + '...' : 'missing',
                    ownerSessionId: owner.sessionId.substring(0, 12) + '...'
                  },
                  'WS: Subscribe rejected - unauthorized request (session mismatch)'
                );
                this.sendError(ws, 'unauthorized', 'Not authorized for this request');
                return;
              }
              
              // Session match - log success
              logger.debug(
                {
                  clientId,
                  channel,
                  requestIdHash: this.hashRequestId(rid),
                  sessionIdMatch: true,
                  sessionIdPrefix: wsSessionId.substring(0, 12) + '...'
                },
                'WS: Subscribe authorized - session match'
              );
            } else if (requireAuth) {
              // Owner object exists but has no usable identity: reject when auth is enabled
              logger.warn(
                {
                  clientId,
                  channel,
                  requestIdHash: this.hashRequestId(rid),
                  reason: 'owner_identity_missing'
                },
                'WS: Subscribe rejected - owner identity missing'
              );
              this.sendError(ws, 'unauthorized', 'Not authorized for this request');
              return;
            }
          }
        }

        // Subscribe using channel-based key
        // IMPORTANT: never trust client-supplied sessionId for subscription keys.
        // Use authenticated wsSessionId when available.
        const effectiveSessionId = wsSessionId;

        // If auth is enabled and we still don't have a sessionId, block (defense-in-depth)
        if (requireAuth && !effectiveSessionId) {
          logger.warn(
            { clientId, channel, requestIdHash: this.hashRequestId(requestId), reason: 'missing_ws_session' },
            'WS: Subscribe rejected - missing authenticated session'
          );
          this.sendError(ws, 'unauthorized', 'Authentication required');
          return;
        }

        const safeRequestId = requestId || 'unknown';
        this.subscribeToChannel(channel, safeRequestId, effectiveSessionId, ws);

        // Logging (prod-safe)
        if (channel === 'search') {
          logger.info(
            {
              clientId,
              channel,
              requestIdHash: isProduction ? this.hashRequestId(requestId) : requestId
            },
            'websocket_subscribed'
          );

          // Late-subscriber replay
          this.replayStateIfAvailable(safeRequestId, ws, clientId);
        } else {
          const requestStatus = await this.getRequestStatus(safeRequestId);
          logger.info(
            {
              clientId,
              channel,
              requestIdHash: isProduction ? this.hashRequestId(requestId || 'unknown') : (requestId || 'unknown'),
              ...(isProduction ? {} : { sessionId: effectiveSessionId || 'none' }),
              status: requestStatus
            },
            'websocket_subscribed'
          );
        }
        break;
      }

      case 'unsubscribe': {
        const envelope = message as any;
        const channel: WSChannel = envelope.channel;
        const requestId = envelope.requestId as string | undefined;
        const sessionIdFromClient = envelope.sessionId as string | undefined;

        // Never trust client-supplied sessionId; use authenticated session
        const effectiveSessionId = wsSessionId;

        // If auth is enabled and we don't have session, block unsubscribe as well (prevents tampering)
        if (requireAuth && !effectiveSessionId) {
          this.sendError(ws, 'unauthorized', 'Authentication required');
          return;
        }

        this.unsubscribeFromChannel(channel, requestId || 'unknown', effectiveSessionId, ws);

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
        // TODO: Handle custom events
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
        // TODO Phase 4: Handle action clicks
        break;

      case 'ui_state_changed':
        logger.debug(
          {
            clientId,
            requestIdHash: isProduction ? this.hashRequestId((message as any).requestId) : (message as any).requestId
          },
          'websocket_ui_state_changed'
        );
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
      const statusSent = this.sendTo(ws, {
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

      // If initial status send failed, no point continuing replay
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

    // Cleanup expired backlogs
    this.cleanupExpiredBacklogs();

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

    // Drain backlog if exists
    this.drainBacklog(key, client, channel, requestId);
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
   * Returns summary: { attempted, sent, failed }
   */
  publishToChannel(
    channel: WSChannel,
    requestId: string,
    sessionId: string | undefined,
    message: WSServerMessage
  ): { attempted: number; sent: number; failed: number } {
    const startTime = performance.now();
    const key = this.buildSubscriptionKey(channel, requestId, sessionId);

    // Cleanup expired backlogs
    this.cleanupExpiredBacklogs();

    const clients = this.subscriptions.get(key);

    // If no subscribers, enqueue to backlog
    if (!clients || clients.size === 0) {
      this.enqueueToBacklog(key, message, channel, requestId);
      return { attempted: 0, sent: 0, failed: 0 };
    }

    // Send to active subscribers
    const data = JSON.stringify(message);
    const payloadBytes = Buffer.byteLength(data, 'utf8');
    let attempted = 0;
    let sent = 0;
    let failed = 0;

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        attempted++;
        try {
          client.send(data);
          sent++;
          this.messagesSent++;
        } catch (err) {
          failed++;
          this.messagesFailed++;
          logger.warn({
            clientId: (client as any).clientId,
            requestId,
            channel,
            error: err instanceof Error ? err.message : 'unknown'
          }, 'WebSocket send failed in publishToChannel');
          // Cleanup failed connection
          this.cleanup(client);
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    logger.info({
      channel,
      requestId,
      clientCount: sent,
      ...(failed > 0 && { failedCount: failed }),
      payloadBytes,
      payloadType: message.type,
      durationMs
    }, 'websocket_published');

    return { attempted, sent, failed };
  }

  /**
   * Legacy: Publish a message to all WebSockets subscribed to a requestId
   * @deprecated Use publishToChannel with channel parameter
   * Returns summary: { attempted, sent, failed }
   */
  publish(requestId: string, message: WSServerMessage): { attempted: number; sent: number; failed: number } {
    return this.publishToChannel('search', requestId, undefined, message);
  }


  /**
   * Send a message to a specific WebSocket
   * Returns true if sent successfully, false otherwise
   */
  private sendTo(ws: WebSocket, message: WSServerMessage): boolean {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        this.messagesSent++;
        return true;
      } catch (err) {
        this.messagesFailed++;
        logger.warn({
          error: err instanceof Error ? err.message : 'unknown',
          messageType: message.type,
          clientId: (ws as any).clientId
        }, 'WebSocket send failed in sendTo');
        // Cleanup failed connection
        this.cleanup(ws);
        return false;
      }
    }
    return false;
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
      try {
        ws.send(JSON.stringify(errorPayload));
        this.messagesSent++;
      } catch (err) {
        this.messagesFailed++;
        logger.warn({
          error: err instanceof Error ? err.message : 'unknown',
          clientId: (ws as any).clientId
        }, 'WebSocket send failed in sendValidationError');
        // Cleanup failed connection
        this.cleanup(ws);
      }
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
   * Enqueue message to backlog (no active subscribers)
   */
  private enqueueToBacklog(
    key: SubscriptionKey,
    message: WSServerMessage,
    channel: WSChannel,
    requestId: string
  ): void {
    let entry = this.backlog.get(key);

    if (!entry) {
      // Create new backlog entry
      entry = {
        items: [],
        expiresAt: Date.now() + this.BACKLOG_TTL_MS
      };
      this.backlog.set(key, entry);

      logger.info({
        channel,
        requestId,
        event: 'backlog_created'
      }, 'WebSocket backlog created for late subscribers');
    }

    // Add message (drop oldest if at max)
    if (entry.items.length >= this.BACKLOG_MAX_ITEMS) {
      entry.items.shift(); // Drop oldest
    }
    entry.items.push(message);

    logger.debug({
      channel,
      requestId,
      backlogSize: entry.items.length,
      event: 'backlog_enqueued'
    }, 'WebSocket message enqueued to backlog');
  }

  /**
   * Drain backlog to newly subscribed client
   */
  private drainBacklog(
    key: SubscriptionKey,
    client: WebSocket,
    channel: WSChannel,
    requestId: string
  ): void {
    const entry = this.backlog.get(key);

    if (!entry) {
      return; // No backlog
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.backlog.delete(key);
      logger.debug({
        channel,
        requestId,
        event: 'backlog_expired'
      }, 'WebSocket backlog expired, not drained');
      return;
    }

    // Send all backlog items in FIFO order
    let sent = 0;
    let failed = 0;
    for (const message of entry.items) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
          sent++;
          this.messagesSent++;
        } catch (err) {
          failed++;
          this.messagesFailed++;
          logger.warn({
            channel,
            requestId,
            error: err instanceof Error ? err.message : 'unknown',
            clientId: (client as any).clientId
          }, 'WebSocket send failed in drainBacklog');
          // Cleanup failed connection and stop draining
          this.cleanup(client);
          break;
        }
      }
    }

    // Clear backlog
    this.backlog.delete(key);

    logger.info({
      channel,
      requestId,
      count: sent,
      ...(failed > 0 && { failedCount: failed }),
      event: 'backlog_drained'
    }, 'WebSocket backlog drained to late subscriber');
  }

  /**
   * Cleanup expired backlogs
   */
  private cleanupExpiredBacklogs(): void {
    const now = Date.now();
    const expiredKeys: SubscriptionKey[] = [];

    for (const [key, entry] of this.backlog.entries()) {
      if (entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.backlog.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug({
        expiredCount: expiredKeys.length,
        event: 'backlog_cleanup'
      }, 'WebSocket expired backlogs cleaned up');
    }
  }

  /**
   * Generate unique client ID for logging
   */
  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Phase 1: Hash requestId for production logs (SHA-256, 12 chars)
   */
  private hashRequestId(requestId?: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }


  /**
   * Phase 1: Get request owner from JobStore
   * Returns userId and/or sessionId of the request owner
   */
  private async getRequestOwner(requestId: string): Promise<{ userId?: string; sessionId?: string } | null> {
    if (!this.jobStore) {
      return null;
    }

    try {
      const job = await this.jobStore.getJob(requestId);
      if (!job) {
        return null;
      }

      const result: { userId?: string; sessionId?: string } = {};
      if (job.ownerUserId) result.userId = job.ownerUserId;
      if (job.ownerSessionId) result.sessionId = job.ownerSessionId;

      return Object.keys(result).length > 0 ? result : null;
    } catch (err) {
      logger.debug({
        requestId: this.hashRequestId(requestId),
        error: err instanceof Error ? err.message : 'unknown'
      }, 'WS: Failed to get request owner');
      return null;
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats(): {
    connections: number;
    subscriptions: number;
    requestIdsTracked: number;
    backlogCount: number;
    messagesSent: number;
    messagesFailed: number;
  } {
    return {
      connections: this.wss.clients.size,
      subscriptions: Array.from(this.subscriptions.values())
        .reduce((sum, set) => sum + set.size, 0),
      requestIdsTracked: this.subscriptions.size,
      backlogCount: this.backlog.size,
      messagesSent: this.messagesSent,
      messagesFailed: this.messagesFailed
    };
  }
}
