/**
 * WebSocket Connection Handler
 * Manages connection lifecycle: connect, disconnect, error, heartbeat
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import { wsClose, CloseSource, getCloseParams } from './ws-close-reasons.js';
import type { WebSocketContext } from './websocket.types.js';
import { hashSessionId } from '../../utils/security.utils.js';

/**
 * Setup new WebSocket connection with context and event handlers
 */
export function setupConnection(
  ws: WebSocket,
  req: any,
  onMessage: (ws: WebSocket, data: any, clientId: string) => void,
  onClose: (ws: WebSocket, clientId: string, code: number, reason: Buffer) => void,
  onError: (ws: WebSocket, err: Error, clientId: string) => void
): void {
  const clientId = generateClientId();

  // Store connection context from ticket/JWT (source of truth)
  const ctx: WebSocketContext = {
    sessionId: req.sessionId ?? 'anonymous',
    userId: req.userId ?? undefined,
    clientId,
    connectedAt: Date.now()
  };
  (ws as any).ctx = ctx;

  // Legacy fields for backward compatibility
  (ws as any).userId = ctx.userId;
  (ws as any).sessionId = ctx.sessionId;
  (ws as any).clientId = clientId;
  (ws as any).isAlive = true;

  // Prefer XFF (behind ALB/Proxy), fallback to socket remoteAddress
  const ip =
    (req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim()) ||
    req?.socket?.remoteAddress;

  // Extract host from origin safely
  const rawOrigin = (req?.headers?.origin ?? '').toString();
  let originHost = 'unknown';
  if (rawOrigin) {
    try {
      originHost = new URL(rawOrigin).hostname;
    } catch {
      originHost = 'invalid';
    }
  }

  // SESSIONHASH FIX: Use shared utility for consistent hashing
  const sessionHash = hashSessionId(ctx.sessionId);

  logger.info(
    {
      clientId,
      ip,
      originHost,
      sessionHash,
      hasUserId: !!ctx.userId,
      event: 'ws_conn_ctx_set'
    },
    'WebSocket connection context established'
  );

  // Setup pong handler for heartbeat
  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });

  // Setup idle timeout (15 min)
  let idleTimer: NodeJS.Timeout | undefined;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const params = getCloseParams(CloseSource.IDLE_TIMEOUT);
      wsClose(ws, {
        ...params,
        closeSource: CloseSource.IDLE_TIMEOUT,
        clientId
      });
    }, 15 * 60 * 1000);
  };
  armIdle();

  // Setup event handlers
  ws.on('message', (data) => {
    armIdle();
    onMessage(ws, data, clientId);
  });

  ws.on('close', (code, reason) => {
    if (idleTimer) clearTimeout(idleTimer);
    onClose(ws, clientId, code, reason);
  });

  ws.on('error', (err) => onError(ws, err, clientId));
}

/**
 * Handle WebSocket close event
 */
export function handleClose(
  ws: WebSocket,
  clientId: string,
  code: number,
  reasonBuffer: Buffer,
  cleanup: (ws: WebSocket) => void
): void {
  cleanup(ws);

  let reason = reasonBuffer?.toString()?.trim() || '';
  const wasClean = code === 1000 || code === 1001;

  // Extract closeSource if tagged (by wsClose helper)
  const closeSource = (ws as any).closeSource || 'UNKNOWN';
  const taggedReason = (ws as any).closeReason;

  // Use tagged reason if available (from wsClose), otherwise use buffer
  if (taggedReason && !reason) {
    reason = taggedReason;
  }

  // INVARIANT: code=1001 MUST have meaningful reason (not empty or "none")
  if (code === 1001 && (!reason || reason === 'none')) {
    logger.warn({
      clientId,
      code,
      originalReason: reason || 'empty',
      closeSource,
      event: 'ws_close_reason_missing'
    }, '[WS] Close(1001) with empty/none reason - logging as SERVER_CLOSE');
    reason = 'SERVER_CLOSE';
  }

  logger.info({
    clientId,
    code,
    reason: reason || 'none',
    closeSource,
    wasClean,
    ...(((ws as any).terminatedBy) && { terminatedBy: (ws as any).terminatedBy }),
    event: 'websocket_disconnected'
  }, `WebSocket disconnected: ${closeSource}`);
}

/**
 * Handle WebSocket error event
 */
export function handleError(
  ws: WebSocket,
  err: Error,
  clientId: string,
  cleanup: (ws: WebSocket) => void
): void {
  logger.error({ clientId, err }, 'WebSocket error');
  cleanup(ws);
}

/**
 * Execute heartbeat: ping all connections, terminate dead ones
 */
export function executeHeartbeat(
  clients: Set<WebSocket>,
  cleanup: (ws: WebSocket) => void
): void {
  let activeCount = 0;
  let terminatedCount = 0;

  clients.forEach((ws: any) => {
    if (ws.isAlive === false) {
      // Mark termination source for disconnect logging
      ws.terminatedBy = 'server_heartbeat';
      cleanup(ws);

      // Close with structured reason before terminate
      const params = getCloseParams(CloseSource.IDLE_TIMEOUT, 'HEARTBEAT_TIMEOUT');
      wsClose(ws, {
        ...params,
        closeSource: CloseSource.IDLE_TIMEOUT,
        clientId: ws.clientId
      });

      ws.terminate();
      terminatedCount++;

      // Log individual heartbeat termination with clientId
      if (ws.clientId) {
        logger.info({
          clientId: ws.clientId,
          reason: 'heartbeat_timeout',
          closeSource: CloseSource.IDLE_TIMEOUT
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
}

/**
 * Generate unique client ID for logging
 */
function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}
