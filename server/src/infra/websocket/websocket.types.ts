/**
 * WebSocket Manager Type Definitions
 * Extracted from websocket-manager.ts for SRP compliance
 */

import crypto from 'crypto';
import type { WebSocket } from 'ws';
import type { WSChannel, WSServerMessage } from './websocket-protocol.js';
import type { IRequestStateStore } from '../state/request-state.store.js';
import type { ISearchJobStore } from '../../services/search/job-store/job-store.interface.js';

/**
 * WebSocket Manager Configuration
 */
export interface WebSocketManagerConfig {
  path: string;
  heartbeatIntervalMs: number;
  allowedOrigins: string[];
  requestStateStore?: IRequestStateStore;
  jobStore?: ISearchJobStore;
  redisUrl?: string;
}

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
 * WebSocket connection context (source of truth from ticket/JWT only)
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
 * Request owner info from job store
 */
export interface RequestOwner {
  userId?: string;
  sessionId?: string;
}

/**
 * Publish result summary
 */
export interface PublishSummary {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * WebSocket stats for monitoring
 */
export interface WebSocketStats {
  connections: number;
  subscriptions: number;
  requestIdsTracked: number;
  backlogCount: number;
  messagesSent: number;
  messagesFailed: number;
}

/**
 * SESSIONHASH FIX: Shared utility for consistent sessionId hashing
 * Used by subscribe, publish, and logging across all WS components
 * 
 * Rules:
 * - 'anonymous' → 'anonymous' (special case, no hash)
 * - undefined/null → 'none' (missing session)
 * - Valid sessionId → SHA256 hash (first 12 chars)
 * 
 * @param sessionId - Session identifier from JWT/ticket
 * @returns Hashed or special-case string for logging
 */
export function hashSessionId(sessionId: string | undefined): string {
  if (!sessionId) return 'none';
  if (sessionId === 'anonymous') return 'anonymous';
  return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12);
}
