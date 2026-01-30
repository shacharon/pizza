/**
 * Message Validation Service
 * Handles WebSocket message parsing, validation, and legacy protocol handling
 * PURE validation logic - no WebSocket lifecycle management
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSClientMessage } from './websocket-protocol.js';
import { isWSClientMessage } from './websocket-protocol.js';
import { normalizeLegacyMessage } from './message-normalizer.js';

/**
 * Validation result types
 */
export type ValidationResult =
  | { valid: true; message: WSClientMessage }
  | { valid: false; reason: 'parse_error'; error: string }
  | { valid: false; reason: 'legacy_rejected' }
  | { valid: false; reason: 'invalid_format'; isSubscribe: boolean; hasRequestId: boolean };

/**
 * Legacy rejection handler result
 */
export interface LegacyRejectionResult {
  nackSent: boolean;
  shouldClose: boolean;
  closeCode: number;
  closeReason: string;
}

/**
 * MessageValidationService
 * Validates and normalizes incoming WebSocket messages
 */
export class MessageValidationService {
  constructor(
    private config: {
      allowLegacy: boolean; // From WS_ALLOW_LEGACY env
      isProduction: boolean;
    }
  ) {}

  /**
   * Parse raw WebSocket data into JSON
   * Returns parsed message or null if parsing fails
   */
  parseMessage(data: any, clientId: string): { success: boolean; message?: any; error?: string } {
    try {
      const raw = data.toString();
      const message = JSON.parse(raw);
      return { success: true, message };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'unknown';
      logger.error({
        clientId,
        error
      }, 'WebSocket JSON parse error');
      return { success: false, error };
    }
  }

  /**
   * Log message structure in dev mode (keys only, no values)
   */
  logMessageStructure(message: any, clientId: string): void {
    if (this.config.isProduction) {
      return;
    }

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

  /**
   * Normalize legacy message format to canonical
   * Returns normalized message or null if legacy is rejected
   */
  normalizeLegacy(message: any, clientId: string): any | null {
    return normalizeLegacyMessage(message, clientId);
  }

  /**
   * Validate message structure against protocol
   */
  validateMessageStructure(message: any, clientId: string): {
    valid: boolean;
    isSubscribe?: boolean;
    hasRequestId?: boolean;
  } {
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

      return { valid: false, isSubscribe, hasRequestId };
    }

    return { valid: true };
  }

  /**
   * Log validated message
   */
  logValidatedMessage(message: WSClientMessage, clientId: string): void {
    logger.debug({
      clientId,
      type: message.type,
      hasRequestId: 'requestId' in message,
      hasSessionId: 'sessionId' in message,
      ...('channel' in message && { channel: message.channel })
    }, 'WebSocket message received');
  }

  /**
   * Full validation pipeline
   * Parses, normalizes, and validates a message
   */
  validate(data: any, clientId: string): ValidationResult {
    // Step 1: Parse JSON
    const parseResult = this.parseMessage(data, clientId);
    if (!parseResult.success) {
      return { valid: false, reason: 'parse_error', error: parseResult.error || 'unknown' };
    }

    let message = parseResult.message;

    // Step 2: Log message structure in dev
    this.logMessageStructure(message, clientId);

    // Step 3: Normalize legacy message format
    message = this.normalizeLegacy(message, clientId);

    // Check if legacy message was rejected
    if (message === null) {
      return { valid: false, reason: 'legacy_rejected' };
    }

    // Step 4: Validate message structure
    const structureValidation = this.validateMessageStructure(message, clientId);
    if (!structureValidation.valid) {
      return {
        valid: false,
        reason: 'invalid_format',
        isSubscribe: structureValidation.isSubscribe || false,
        hasRequestId: structureValidation.hasRequestId || false
      };
    }

    // Step 5: Log validated message
    this.logValidatedMessage(message as WSClientMessage, clientId);

    return { valid: true, message: message as WSClientMessage };
  }

  /**
   * Handle legacy protocol rejection
   * Sends NACK message and returns close parameters
   */
  handleLegacyRejection(ws: WebSocket, clientId: string): LegacyRejectionResult {
    const nackMessage = {
      type: 'sub_nack',
      reason: 'LEGACY_PROTOCOL_REJECTED',
      message: 'Legacy WebSocket protocol is no longer supported. Please upgrade your client to use canonical protocol v1. See: docs/ws-legacy-sunset.md',
      migrationDoc: 'docs/ws-legacy-sunset.md'
    };

    logger.warn({
      clientId,
      event: 'ws_legacy_rejected',
      reason: 'LEGACY_PROTOCOL_REJECTED',
      message: 'Connection rejected due to legacy protocol usage'
    }, '[WS] Rejecting connection: legacy protocol not allowed');

    let nackSent = false;
    try {
      ws.send(JSON.stringify(nackMessage));
      nackSent = true;
    } catch (sendErr) {
      logger.error({ clientId, error: String(sendErr) }, '[WS] Failed to send legacy rejection NACK');
    }

    return {
      nackSent,
      shouldClose: true,
      closeCode: 1008, // 1008 = Policy Violation
      closeReason: 'Legacy protocol not supported'
    };
  }
}
