/**
 * Phase 2: Request State Store - Interface and Types
 * Stores intermediate search state for async assistant processing
 */

import type { CoreSearchResult, ActionDefinition } from '../../services/search/types/search.types.js';

/**
 * Request state stored between core search and assistant completion
 */
export interface RequestState {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  coreResult: CoreSearchResult;
  assistantStatus: 'pending' | 'streaming' | 'completed' | 'failed';
  assistantOutput?: string;
  recommendations?: ActionDefinition[];
  seed: number; // For deterministic randomness
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

/**
 * Interface for request state storage
 * Redis-ready design, Phase 2 uses in-memory implementation
 */
export interface IRequestStateStore {
  /**
   * Store request state with TTL
   */
  set(requestId: string, state: RequestState, ttlSeconds?: number): Promise<void>;

  /**
   * Get request state by ID
   * Returns null if expired or not found
   */
  get(requestId: string): Promise<RequestState | null>;

  /**
   * Delete request state
   */
  delete(requestId: string): Promise<void>;

  /**
   * Cleanup expired entries
   * Returns count of cleaned entries
   */
  cleanup(): Promise<number>;

  /**
   * Shutdown store (clear intervals, close connections)
   */
  shutdown(): void;
}
