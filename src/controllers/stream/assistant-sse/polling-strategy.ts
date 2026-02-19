/**
 * Polling Strategy
 * Encapsulates polling/backoff logic for waiting on upstream readiness
 * 
 * Delegates actual result checking to ResultWaiter but provides
 * consistent interface for polling configuration.
 */

import type { Logger } from 'pino';
import type { ISearchJobStore, JobStatus } from '../../../services/search/job-store/job-store.interface.js';
import { ResultWaiter } from './result-waiter.js';

/**
 * Polling result
 */
export interface PollResult {
  resultsReady: boolean;
  latestStatus: string | null;
  polledCount?: number;
  elapsedMs?: number;
}

/**
 * Polling configuration
 */
export interface PollingConfig {
  pollIntervalMs: number;
  timeoutMs: number;
}

/**
 * Polling Strategy
 * Wraps ResultWaiter with explicit polling configuration
 */
export class PollingStrategy {
  private readonly resultWaiter: ResultWaiter;

  constructor(
    jobStore: ISearchJobStore,
    logger: Logger,
    config: PollingConfig
  ) {
    this.resultWaiter = new ResultWaiter(
      jobStore,
      logger,
      config.pollIntervalMs,
      config.timeoutMs
    );
  }

  /**
   * Wait for results to be ready
   * 
   * @param requestId - Request ID
   * @param initialStatus - Initial job status (optimization)
   * @param abortSignal - Abort signal for early termination
   * @param isClientDisconnected - Function to check client disconnect
   * @returns Poll result with readiness status
   */
  async waitForResults(
    requestId: string,
    initialStatus: JobStatus | null,
    abortSignal: AbortSignal,
    isClientDisconnected: () => boolean
  ): Promise<PollResult> {
    return await this.resultWaiter.waitForResults(
      requestId,
      initialStatus,
      abortSignal,
      isClientDisconnected
    );
  }
}
