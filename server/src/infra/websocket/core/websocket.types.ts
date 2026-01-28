/**
 * WebSocket Manager Types
 * Core type definitions for WebSocket infrastructure
 */

import type { WebSocket } from 'ws';
import type { WSChannel, WSServerMessage } from '../websocket-protocol.js';

/**
 * Subscription key: channel:requestId or channel:sessionId
 */
export type SubscriptionKey = string;

/**
 * Backlog entry for messages published before subscribers
 */
export interface BacklogEntry {
  items: WSServerMessage[];
  expiresAt: number;
}

/**
 * WebSocket connection context (CTO-grade: source of truth from ticket/JWT only)
 */
export interface WebSocketContext {
  sessionId: string;
  userId?: string;
  clientId: string;
  connectedAt: number;
}

/**
 * Pending subscription entry (awaiting job creation)
 */
export interface PendingSubscription {
  ws: WebSocket;
  channel: WSChannel;
  requestId: string;
  sessionId: string;
  expiresAt: number;
}

/**
 * Request owner information (for ownership verification)
 */
export interface RequestOwner {
  userId?: string | null;
  sessionId?: string | null;
}
