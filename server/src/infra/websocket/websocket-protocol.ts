/**
 * Phase 3: WebSocket Message Protocol
 * Defines client→server and server→client message types
 */

// ============================================================================
// Client → Server Messages
// ============================================================================

export interface WSClientSubscribe {
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
  | WSClientSubscribe
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

export type WSServerMessage =
  | WSServerStatus
  | WSServerStreamDelta
  | WSServerStreamDone
  | WSServerRecommendation
  | WSServerError;

// ============================================================================
// Validation Helpers
// ============================================================================

export function isWSClientMessage(msg: any): msg is WSClientMessage {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    return false;
  }

  switch (msg.type) {
    case 'subscribe':
      return typeof msg.requestId === 'string';
    case 'action_clicked':
      return typeof msg.requestId === 'string' && typeof msg.actionId === 'string';
    case 'ui_state_changed':
      return typeof msg.requestId === 'string' && typeof msg.state === 'object';
    default:
      return false;
  }
}
