/**
 * Ownership Verifier
 * Verifies WebSocket subscription ownership based on session/user matching
 * 
 * Responsibility:
 * - Fetch request owner from JobStore
 * - Verify sessionId/userId matches between subscriber and owner
 * - Provide ownership decision (ALLOW / DENY / PENDING)
 */

import crypto from 'crypto';
import { logger } from '../../lib/logger/structured-logger.js';
import type { ISearchJobStore } from '../../services/search/job-store/job-store.interface.js';
import type { RequestOwner } from './websocket.types.js';

export type OwnershipDecision =
  | { result: 'ALLOW' }
  | { result: 'DENY'; reason: string }
  | { result: 'PENDING' };

/**
 * Ownership Verifier Service
 */
export class OwnershipVerifier {
  constructor(
    private jobStore: ISearchJobStore | undefined
  ) { }

  /**
   * Get request owner from JobStore
   */
  async getRequestOwner(requestId: string): Promise<RequestOwner | null> {
    if (!this.jobStore) {
      return null;
    }

    try {
      const job = await this.jobStore.getJob(requestId);
      if (!job) {
        return null;
      }

      const result: RequestOwner = {};
      if (job.ownerUserId) result.userId = job.ownerUserId;
      if (job.ownerSessionId) result.sessionId = job.ownerSessionId;

      return Object.keys(result).length > 0 ? result : null;
    } catch (err) {
      logger.debug({
        requestId: this.hashRequestId(requestId),
        error: err instanceof Error ? err.message : 'unknown'
      }, 'WS: Failed to get request owner');
      return null;
    }
  }

  /**
   * Verify if subscriber owns the request or should be allowed to subscribe
   * Returns: ALLOW (subscribe), DENY (reject), PENDING (register pending)
   */
  async verifyOwnership(
    requestId: string,
    connSessionId: string,
    connUserId: string | undefined,
    clientId: string,
    channel: string
  ): Promise<OwnershipDecision> {
    // Fetch owner
    let owner: RequestOwner | null = null;
    try {
      owner = await this.getRequestOwner(requestId);
    } catch (err) {
      logger.warn({
        clientId,
        channel,
        requestIdHash: this.hashRequestId(requestId),
        error: err instanceof Error ? err.message : 'unknown',
        reason: 'owner_lookup_failed'
      }, 'Subscribe ownership check failed');
      return { result: 'DENY', reason: 'owner_lookup_failed' };
    }

    // No owner yet - register as pending
    if (!owner) {
      return { result: 'PENDING' };
    }

    // Owner exists - verify match
    const ownerSessionId = owner.sessionId;
    const ownerUserId = owner.userId;
    const requestIdHash = this.hashRequestId(requestId);
    const sessionHash = this.hashSessionId(connSessionId);

    // Check userId match if owner has userId
    if (ownerUserId && ownerUserId !== connUserId) {
      logger.warn({
        clientId,
        channel,
        requestIdHash,
        reason: 'user_mismatch',
        event: 'ws_subscribe_nack'
      }, 'Subscribe rejected - user mismatch');
      return { result: 'DENY', reason: 'user_mismatch' };
    }

    // Check sessionId match if owner has sessionId
    if (ownerSessionId && ownerSessionId !== connSessionId) {
      logger.warn({
        clientId,
        channel,
        requestIdHash,
        sessionHash,
        reason: 'session_mismatch',
        event: 'ws_subscribe_nack'
      }, 'Subscribe rejected - session mismatch');
      return { result: 'DENY', reason: 'session_mismatch' };
    }

    // Owner matches - allow subscription
    // Note: ws_subscribe_ack will be logged by subscription-manager after registration
    logger.debug({
      clientId,
      channel,
      requestIdHash,
      sessionHash,
      event: 'ownership_verified'
    }, 'Subscribe ownership verified - owner match');

    return { result: 'ALLOW' };
  }

  /**
   * Hash requestId for logging
   */
  private hashRequestId(requestId: string): string {
    if (!requestId) return 'none';
    return crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
  }

  /**
   * Hash sessionId for logging
   */
  private hashSessionId(sessionId: string): string {
    if (!sessionId || sessionId === 'anonymous') return 'anon';
    return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 8);
  }
}
