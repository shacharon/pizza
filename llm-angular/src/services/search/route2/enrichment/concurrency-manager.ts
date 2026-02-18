/**
 * Concurrency Manager for Provider Enrichments
 * 
 * Limits concurrent provider enrichment jobs to prevent overwhelming search APIs
 * and to control costs.
 * 
 * Features:
 * - Max concurrent jobs limit (default: 3)
 * - Queue-based job scheduling
 * - Per-provider concurrency tracking
 */

import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Provider enrichment job
 */
export interface ProviderJob {
  provider: 'wolt' | 'tenbis';
  placeId: string;
  requestId: string;
  execute: () => Promise<void>;
}

/**
 * Concurrency Manager
 * 
 * Ensures no more than N provider jobs run concurrently
 */
export class ConcurrencyManager {
  private runningJobs = 0;
  private maxConcurrent: number;
  private queue: ProviderJob[] = [];

  constructor(maxConcurrent?: number) {
    this.maxConcurrent = maxConcurrent || parseInt(process.env.MAX_CONCURRENT_PROVIDER_JOBS || '3');
    
    logger.info(
      {
        event: 'concurrency_manager_init',
        maxConcurrent: this.maxConcurrent,
      },
      '[ConcurrencyManager] Initialized'
    );
  }

  /**
   * Schedule a provider job with concurrency control
   * 
   * @param job - Provider job to execute
   * @returns Promise that resolves when job completes
   */
  async schedule(job: ProviderJob): Promise<void> {
    // If under limit, execute immediately
    if (this.runningJobs < this.maxConcurrent) {
      return this.executeJob(job);
    }

    // Otherwise, queue the job
    return new Promise((resolve, reject) => {
      this.queue.push({
        ...job,
        execute: async () => {
          try {
            await job.execute();
            resolve();
          } catch (err) {
            reject(err);
          }
        },
      });

      logger.debug(
        {
          event: 'provider_job_queued',
          provider: job.provider,
          placeId: job.placeId,
          requestId: job.requestId,
          queueSize: this.queue.length,
          runningJobs: this.runningJobs,
        },
        '[ConcurrencyManager] Job queued (at limit)'
      );
    });
  }

  /**
   * Execute a job and process queue when done
   */
  private async executeJob(job: ProviderJob): Promise<void> {
    this.runningJobs++;

    logger.debug(
      {
        event: 'provider_job_started',
        provider: job.provider,
        placeId: job.placeId,
        requestId: job.requestId,
        runningJobs: this.runningJobs,
        queueSize: this.queue.length,
      },
      '[ConcurrencyManager] Job started'
    );

    try {
      await job.execute();
    } finally {
      this.runningJobs--;

      logger.debug(
        {
          event: 'provider_job_completed',
          provider: job.provider,
          placeId: job.placeId,
          requestId: job.requestId,
          runningJobs: this.runningJobs,
          queueSize: this.queue.length,
        },
        '[ConcurrencyManager] Job completed'
      );

      // Process next queued job if any
      this.processNext();
    }
  }

  /**
   * Process next queued job
   */
  private processNext(): void {
    if (this.queue.length === 0 || this.runningJobs >= this.maxConcurrent) {
      return;
    }

    const nextJob = this.queue.shift();
    if (nextJob) {
      void this.executeJob(nextJob);
    }
  }

  /**
   * Get current stats for monitoring
   */
  getStats(): {
    running: number;
    queued: number;
    maxConcurrent: number;
  } {
    return {
      running: this.runningJobs,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
let managerInstance: ConcurrencyManager | null = null;

/**
 * Get or create the shared concurrency manager instance
 */
export function getConcurrencyManager(): ConcurrencyManager {
  if (!managerInstance) {
    managerInstance = new ConcurrencyManager();
  }
  return managerInstance;
}

/**
 * Reset manager instance (for testing)
 */
export function resetConcurrencyManager(): void {
  managerInstance = null;
}
