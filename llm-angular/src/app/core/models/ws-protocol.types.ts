/**
 * WebSocket Protocol Types - Phase 6
 * Exact union types matching backend server/src/infra/websocket/websocket-protocol.ts
 * 
 * Unified Protocol: Supports both "search" and "assistant" channels
 */

/**
 * Assistant Status States
 */
export type AssistantStatus = 'idle' | 'pending' | 'streaming' | 'completed' | 'failed';

/**
 * WebSocket Channel Types
 */
export type WSChannel = 'search' | 'assistant';

/**
 * Action Definition (from backend)
 */
export interface ActionDefinition {
  id: string;
  type: string;
  level: number;
  label: string;
  icon?: string;
  enabled: boolean;
  requiresSelection?: boolean;
  // Allow extra fields for forward compatibility
  [key: string]: any;
}

/**
 * Client → Server Messages (Canonical Envelope v1)
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

/**
 * Server → Client Messages
 */
export interface WSServerStatus {
  type: 'status';
  requestId: string;
  status: AssistantStatus;
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
  actions: ActionDefinition[];
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

/**
 * Type guard for WebSocket server messages
 */
export function isWSServerMessage(msg: any): msg is WSServerMessage {
  return (
    msg &&
    typeof msg === 'object' &&
    'type' in msg &&
    'requestId' in msg &&
    typeof msg.type === 'string' &&
    typeof msg.requestId === 'string'
  );
}

/**
 * Connection Status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
