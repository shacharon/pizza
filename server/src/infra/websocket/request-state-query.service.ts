/**
 * Request State Query Service
 * Handles querying request status from state store
 * PURE query logic - no subscription management
 */

import { logger } from '../../lib/logger/structured-logger.js';
import type { IRequestStateStore } from '../state/request-state.store.js';

/**
 * RequestStateQueryService
 * Queries request status for logging and replay
 */
export class RequestStateQueryService {
  constructor(
    private requestStateStore: IRequestStateStore | undefined
  ) {}

  /**
   * Get request status for logging
   */
  async getRequestStatus(requestId: string): Promise<string> {
    if (!this.requestStateStore) {
      return 'unknown';
    }

    try {
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        return 'not_found';
      }

      switch (state.assistantStatus) {
        case 'pending':
          return 'pending';
        case 'streaming':
          return 'streaming';
        case 'completed':
          return 'completed';
        case 'failed':
          return 'failed';
        default:
          return 'unknown';
      }
    } catch (error) {
      logger.debug({ requestId, error }, 'Failed to get request status');
      return 'error';
    }
  }
}
