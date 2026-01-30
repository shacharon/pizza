/**
 * Legacy Protocol Adapter
 * Normalizes legacy message formats to current protocol
 * 
 * Purpose: Handle backward compatibility with old client message formats
 * that placed requestId in different locations (payload.requestId, data.requestId, reqId)
 * 
 * SUNSET PLAN: See docs/ws-legacy-sunset.md
 * - Phase 2 (Current): Monitoring with warnings (WS_ALLOW_LEGACY=true)
 * - Phase 3 (Q2 2026): Enforcement (WS_ALLOW_LEGACY=false)
 * - Phase 4 (Q3 2026): Adapter removal
 */

import { logger } from '../../lib/logger/structured-logger.js';

/**
 * Environment flag to control legacy protocol support
 * - true (default): Allow legacy messages with normalization and warnings
 * - false: Reject legacy messages with clear error
 * 
 * Set WS_ALLOW_LEGACY=false to enforce canonical protocol only
 */
const ALLOW_LEGACY = process.env.WS_ALLOW_LEGACY !== 'false';

/**
 * Rate limiter for legacy protocol warnings
 * Tracks last warning time per clientId to avoid log spam
 * Max 1 warning per client per hour
 */
const legacyWarnings = new Map<string, number>();
const WARNING_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Detect if a message uses legacy protocol format
 * 
 * @param message Raw message from client
 * @returns Object with detection result and legacy format type
 */
export function detectLegacyFormat(message: any): {
  isLegacy: boolean;
  format?: 'payload.requestId' | 'data.requestId' | 'reqId';
} {
  if (!message || message.type !== 'subscribe' || message.requestId) {
    return { isLegacy: false };
  }

  if (message.payload?.requestId) {
    return { isLegacy: true, format: 'payload.requestId' };
  }

  if ((message as any).data?.requestId) {
    return { isLegacy: true, format: 'data.requestId' };
  }

  if ((message as any).reqId) {
    return { isLegacy: true, format: 'reqId' };
  }

  return { isLegacy: false };
}

/**
 * Log rate-limited warning for legacy protocol usage
 * Max 1 warning per clientId per hour to avoid log spam
 * 
 * @param clientId Client identifier
 * @param legacyFormat Detected legacy format type
 */
function warnLegacyProtocol(clientId: string, legacyFormat: string): void {
  const now = Date.now();
  const lastWarned = legacyWarnings.get(clientId) || 0;

  if (now - lastWarned > WARNING_COOLDOWN_MS) {
    logger.warn({
      event: 'ws_legacy_protocol_detected',
      clientId,
      legacyFormat,
      allowLegacy: ALLOW_LEGACY,
      migrationDoc: 'docs/ws-legacy-sunset.md',
      message: 'Client is using DEPRECATED legacy WebSocket protocol. Migration required before enforcement date.'
    }, '[WS] DEPRECATED: Legacy protocol detected');

    legacyWarnings.set(clientId, now);
  }
}

/**
 * Normalize legacy subscribe messages that have requestId in non-standard locations
 * 
 * Legacy formats supported (DEPRECATED - see docs/ws-legacy-sunset.md):
 * - message.payload.requestId (old format)
 * - message.data.requestId (very old format)
 * - message.reqId (alternate naming)
 * 
 * Canonical format (USE THIS):
 * - message.requestId (standard)
 * - message.v = 1 (protocol version)
 * - message.channel (required)
 * 
 * @param message Raw message from client
 * @param clientId Client identifier for logging
 * @returns Normalized message with requestId at top level, or null if rejected
 */
export function normalizeLegacyMessage(message: any, clientId: string): any | null {
  // Check if message uses legacy format
  const { isLegacy, format } = detectLegacyFormat(message);

  if (!isLegacy) {
    // Not a legacy message, return as-is
    return message;
  }

  // Legacy format detected - check if we allow it
  if (!ALLOW_LEGACY) {
    // Enforcement mode: Reject legacy messages
    logger.warn({
      event: 'ws_legacy_protocol_rejected',
      clientId,
      legacyFormat: format,
      allowLegacy: false,
      migrationDoc: 'docs/ws-legacy-sunset.md',
      message: 'Legacy WebSocket protocol REJECTED. Client must upgrade to canonical protocol v1.'
    }, '[WS] REJECTED: Legacy protocol not allowed (WS_ALLOW_LEGACY=false)');

    return null; // Signal rejection to caller
  }

  // Monitoring mode: Allow with warning
  warnLegacyProtocol(clientId, format as string);

  // Normalize the message
  if (message.payload?.requestId) {
    message.requestId = message.payload.requestId;
    logger.debug({ clientId, format: 'payload.requestId' }, '[WS] Normalized requestId from payload.requestId');
    return message;
  }

  if ((message as any).data?.requestId) {
    message.requestId = (message as any).data.requestId;
    logger.debug({ clientId, format: 'data.requestId' }, '[WS] Normalized requestId from data.requestId');
    return message;
  }

  if ((message as any).reqId) {
    message.requestId = (message as any).reqId;
    logger.debug({ clientId, format: 'reqId' }, '[WS] Normalized requestId from reqId');
    return message;
  }

  // No normalization needed or possible
  return message;
}

/**
 * Check if legacy protocol support is currently enabled
 * 
 * @returns true if legacy messages are allowed (with normalization and warnings)
 */
export function isLegacyProtocolAllowed(): boolean {
  return ALLOW_LEGACY;
}
