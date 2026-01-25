/**
 * WebSocket Close Codes and Reasons
 * Shared constants for structured disconnect reasons
 * 
 * Standard WebSocket close codes:
 * - 1000: Normal closure
 * - 1001: Going away (server shutdown, page navigation)
 * - 1006: Abnormal closure (no close frame, network failure)
 * - 1008: Policy violation
 * - 1011: Unexpected condition
 */

/**
 * Hard failure reasons that should stop auto-reconnect
 */
export const HARD_CLOSE_REASONS = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  ORIGIN_BLOCKED: 'ORIGIN_BLOCKED',
  BAD_SUBSCRIBE: 'BAD_SUBSCRIBE',
  INVALID_REQUEST: 'INVALID_REQUEST',
} as const;

/**
 * Soft failure reasons that allow auto-reconnect
 */
export const SOFT_CLOSE_REASONS = {
  SERVER_SHUTDOWN: 'SERVER_SHUTDOWN',
  IDLE_TIMEOUT: 'IDLE_TIMEOUT',
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
} as const;

export type HardCloseReason = typeof HARD_CLOSE_REASONS[keyof typeof HARD_CLOSE_REASONS];
export type SoftCloseReason = typeof SOFT_CLOSE_REASONS[keyof typeof SOFT_CLOSE_REASONS];
export type CloseReason = HardCloseReason | SoftCloseReason;

/**
 * Check if a close reason is a hard failure (should stop reconnect)
 */
export function isHardCloseReason(reason: string | undefined): reason is HardCloseReason {
  if (!reason) return false;
  return Object.values(HARD_CLOSE_REASONS).includes(reason as HardCloseReason);
}

/**
 * Get appropriate close code for a reason
 */
export function getCloseCodeForReason(reason: CloseReason): number {
  // Hard failures use 1008 (policy violation)
  if (isHardCloseReason(reason)) {
    return 1008;
  }
  // Soft failures use 1000 (normal) or 1001 (going away)
  return 1000;
}
