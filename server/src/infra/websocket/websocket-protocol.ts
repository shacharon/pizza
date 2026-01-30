/**
 * Phase 3: WebSocket Message Protocol
 * Defines client→server and server→client message types
 * 
 * Unified Protocol: Supports both "search" and "assistant" channels
 */

// ============================================================================
// Client → Server Messages (Canonical Envelope)
// ============================================================================

export type WSChannel = 'search' | 'assistant';

/**
 * Canonical message envelope for all client messages (v1)
 */
export interface WSClientEnvelope {
  v: 1;
  type: 'subscribe' | 'unsubscribe' | 'event';
  channel: WSChannel;
  requestId: string;
  sessionId?: string;
}

/**
 * Legacy subscribe message (backward compatible)
 */
export interface WSClientSubscribeLegacy {
  type: 'subscribe';
  requestId: string;
}

export interface WSClientActionClicked {
  type: 'action_clicked';
  requestId: string;
  actionId: string;
}

export interface WSClientUIStateChanged {
  type: 'ui_state_changed';
  requestId: string;
  state: {
    selectedResultId?: string;
    mapCenter?: { lat: number; lng: number };
    zoom?: number;
  };
}

export type WSClientMessage =
  | WSClientEnvelope
  | WSClientSubscribeLegacy
  | WSClientActionClicked
  | WSClientUIStateChanged;

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface WSServerStatus {
  type: 'status';
  requestId: string;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
}

export interface WSServerStreamDelta {
  type: 'stream.delta';
  requestId: string;
  text: string;
}

export interface WSServerStreamDone {
  type: 'stream.done';
  requestId: string;
  fullText: string;
}

export interface WSServerRecommendation {
  type: 'recommendation';
  requestId: string;
  actions: Array<{
    id: string;
    type: string;
    label: string;
    icon?: string;
  }>;
}

export interface WSServerError {
  type: 'error';
  requestId: string;
  error: string;
  message: string;
}

/**
 * WebSocket connection status event (connection-level, not request-specific)
 * For app-assistant-line to show stable WS status
 */
export interface WSServerConnectionStatus {
  type: 'ws_status';
  state: 'connected' | 'reconnecting' | 'offline';
  ts: string;
}

export interface WSServerAssistantProgress {
  type: 'assistant_progress';
  requestId: string;
  seq: number;
  message: string;
}

export interface WSServerAssistantSuggestion {
  type: 'assistant_suggestion';
  requestId: string;
  seq: number;
  message: string;
}

/**
 * Assistant message (LLM-generated guidance)
 */
export interface WSServerAssistant {
  type: 'assistant';
  requestId: string;
  payload: {
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY' | 'SEARCH_FAILED' | 'GENERIC_QUERY_NARRATION';
    message: string;
    question: string | null;
    blocksSearch: boolean;
  };
}

/**
 * Assistant error event (no user-facing message, just error code)
 */
export interface WSServerAssistantError {
  type: 'assistant_error';
  requestId: string;
  payload: {
    errorCode: 'LLM_TIMEOUT' | 'LLM_FAILED' | 'SCHEMA_INVALID';
  };
}

/**
 * Subscribe acknowledgment (CTO-grade protocol)
 */
export interface WSServerSubAck {
  type: 'sub_ack';
  channel: WSChannel;
  requestId: string;
  pending: boolean; // true if subscription is pending job creation
}

/**
 * Subscribe negative acknowledgment (CTO-grade protocol)
 */
export interface WSServerSubNack {
  type: 'sub_nack';
  channel: WSChannel;
  requestId: string;
  reason: 'session_mismatch' | 'invalid_request' | 'unauthorized';
}

export type WSServerMessage =
  | WSServerStatus
  | WSServerStreamDelta
  | WSServerStreamDone
  | WSServerRecommendation
  | WSServerError
  | WSServerAssistantProgress
  | WSServerAssistantSuggestion
  | WSServerAssistant
  | WSServerAssistantError
  | WSServerSubAck
  | WSServerSubNack
  | WSServerConnectionStatus;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and normalize client messages
 * Accepts both canonical envelope (v1) and legacy formats
 */
export function isWSClientMessage(msg: any): msg is WSClientMessage {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    return false;
  }

  switch (msg.type) {
    case 'subscribe':
      // Must have requestId
      if (typeof msg.requestId !== 'string') {
        return false;
      }

      // Accept both canonical (with channel) and legacy (without channel)
      if ('channel' in msg) {
        // Canonical envelope (v1)
        return (msg.channel === 'search' || msg.channel === 'assistant');
      } else {
        // Legacy format (backward compatible)
        return true;
      }

    case 'unsubscribe':
    case 'event':
      // Canonical envelope required
      return (
        typeof msg.requestId === 'string' &&
        'channel' in msg &&
        (msg.channel === 'search' || msg.channel === 'assistant')
      );

    case 'action_clicked':
      return typeof msg.requestId === 'string' && typeof msg.actionId === 'string';

    case 'ui_state_changed':
      return typeof msg.requestId === 'string' && typeof msg.state === 'object';

    default:
      return false;
  }
}

/**
 * Normalize legacy subscribe to canonical envelope
 */
export function normalizeToCanonical(msg: WSClientMessage): WSClientEnvelope | WSClientMessage {
  // If it's already canonical or not a subscribe, return as-is
  if (msg.type !== 'subscribe' || 'channel' in msg) {
    return msg;
  }

  // Convert legacy subscribe to canonical (default to 'search' channel)
  const legacy = msg as WSClientSubscribeLegacy;
  return {
    v: 1,
    type: 'subscribe',
    channel: 'search',
    requestId: legacy.requestId
  };
}
