/**
 * WebSocket Close Codes and Reasons
 * Centralized taxonomy for all WS disconnections
 * 
 * Standard WebSocket close codes:
 * - 1000: Normal closure
 * - 1001: Going away (server shutdown, idle timeout)
 * - 1006: Abnormal closure (no close frame, network failure)
 * - 1008: Policy violation
 * - 1011: Unexpected condition (errors)
 */

import { logger } from '../../lib/logger/structured-logger.js';

/**
 * Close Source Taxonomy
 * Tags every close with its originating cause
 */
export enum CloseSource {
  IDLE_TIMEOUT = 'IDLE_TIMEOUT',           // Client inactive for 15+ minutes
  SERVER_SHUTDOWN = 'SERVER_SHUTDOWN',     // Graceful server shutdown
  CLIENT_CLOSE = 'CLIENT_CLOSE',           // Client initiated close
  POLICY = 'POLICY',                       // Auth/validation failure
  ERROR = 'ERROR',                         // Unexpected error condition
}

/**
 * Hard failure reasons that should stop auto-reconnect
 */
export const HARD_CLOSE_REASONS = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  ORIGIN_BLOCKED: 'ORIGIN_BLOCKED',
  BAD_SUBSCRIBE: 'BAD_SUBSCRIBE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  LEGACY_PROTOCOL: 'LEGACY_PROTOCOL',
} as const;

/**
 * Soft failure reasons that allow auto-reconnect
 */
export const SOFT_CLOSE_REASONS = {
  SERVER_SHUTDOWN: 'SERVER_SHUTDOWN',
  IDLE_TIMEOUT: 'IDLE_TIMEOUT',
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
  CLIENT_RECONNECT: 'CLIENT_RECONNECT',
} as const;

export type HardCloseReason = typeof HARD_CLOSE_REASONS[keyof typeof HARD_CLOSE_REASONS];
export type SoftCloseReason = typeof SOFT_CLOSE_REASONS[keyof typeof SOFT_CLOSE_REASONS];
export type CloseReason = HardCloseReason | SoftCloseReason;

/**
 * WebSocket Close Options
 */
export interface WSCloseOptions {
  code: number;
  reason: string;
  closeSource: CloseSource;
  clientId?: string;
}

/**
 * Centralized WebSocket close helper
 * SINGLE SOURCE OF TRUTH for all WS closes
 * 
 * Ensures:
 * - Code 1001 only for IDLE_TIMEOUT/SERVER_SHUTDOWN
 * - All closes have non-empty reason
 * - closeSource is always tagged
 */
export function wsClose(ws: any, options: WSCloseOptions): void {
  const { code, reason, closeSource, clientId } = options;

  // Validate reason is non-empty
  const finalReason = reason?.trim() || 'UNKNOWN';

  // INVARIANT: Code 1001 ONLY for IDLE_TIMEOUT/SERVER_SHUTDOWN
  if (code === 1001 && closeSource !== CloseSource.IDLE_TIMEOUT && closeSource !== CloseSource.SERVER_SHUTDOWN) {
    logger.warn({
      clientId: clientId || ws.clientId,
      code,
      reason: finalReason,
      closeSource,
      event: 'ws_close_code_mismatch'
    }, '[WS] Code 1001 used with non-IDLE/SHUTDOWN source - should use different code');
  }

  // INVARIANT: Empty reason detection
  if (!reason || reason === 'none') {
    logger.warn({
      clientId: clientId || ws.clientId,
      code,
      closeSource,
      event: 'ws_close_empty_reason'
    }, '[WS] Empty close reason detected');
  }

  // Tag closeSource on ws object for logging in handleClose
  (ws as any).closeSource = closeSource;
  (ws as any).closeReason = finalReason;

  try {
    ws.close(code, finalReason);
  } catch (err) {
    // Ignore close errors (connection may already be closed)
  }
}

/**
 * Get appropriate close code and reason for a closeSource
 */
export function getCloseParams(closeSource: CloseSource, reason?: string): Pick<WSCloseOptions, 'code' | 'reason'> {
  switch (closeSource) {
    case CloseSource.IDLE_TIMEOUT:
      return { code: 1001, reason: reason || 'IDLE_TIMEOUT' };

    case CloseSource.SERVER_SHUTDOWN:
      return { code: 1001, reason: reason || 'SERVER_SHUTDOWN' };

    case CloseSource.CLIENT_CLOSE:
      return { code: 1000, reason: reason || 'CLIENT_CLOSE' };

    case CloseSource.POLICY:
      return { code: 1008, reason: reason || 'POLICY_VIOLATION' };

    case CloseSource.ERROR:
      return { code: 1011, reason: reason || 'UNEXPECTED_ERROR' };

    default:
      return { code: 1000, reason: reason || 'UNKNOWN' };
  }
}

/**
 * Check if a close reason is a hard failure (should stop reconnect)
 */
export function isHardCloseReason(reason: string | undefined): reason is HardCloseReason {
  if (!reason) return false;
  return Object.values(HARD_CLOSE_REASONS).includes(reason as HardCloseReason);
}
