/**
 * Result Waiter
 * Polls job status until results ready or timeout
 * Single responsibility: Result polling with abort support
 */

import type { Logger } from 'pino';
import type { ISearchJobStore, JobStatus } from '../../../services/search/job-store/job-store.interface.js';
import type { PollResult } from './models.js';

export class ResultWaiter {
  constructor(
    private readonly jobStore: ISearchJobStore,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number,
    private readonly timeoutMs: number
  ) {}

  /**
   * Sleep helper for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Poll for results readiness (up to timeout)
   * Returns when results ready or timeout reached
   */
  async waitForResults(
    requestId: string,
    initialStatus: JobStatus | null,
    abortSignal: AbortSignal,
    onClientDisconnect: () => boolean
  ): Promise<PollResult> {
    const pollDeadline = Date.now() + this.timeoutMs;
    let resultsReady = false;
    let latestStatus: JobStatus | null = initialStatus;

    while (Date.now() < pollDeadline) {
      // Check for client disconnect or abort
      if (onClientDisconnect() || abortSignal.aborted) {
        this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected during poll');
        return { resultsReady: false, latestStatus };
      }

      // Check job status
      const statusCheck = await this.jobStore.getStatus(requestId);
      latestStatus = statusCheck?.status || null;

      if (latestStatus === 'DONE_SUCCESS') {
        resultsReady = true;
        this.logger.debug({ requestId, latestStatus }, '[AssistantSSE] Results ready');
        break;
      }

      // Poll interval
      await this.sleep(this.pollIntervalMs);
    }

    return { resultsReady, latestStatus };
  }
}
