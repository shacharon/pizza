/**
 * 10bis Job Queue - In-Process Queue (MVP)
 * 
 * Simple in-memory job queue for background 10bis enrichment.
 * For production, consider external queue (Bull, BullMQ, etc.)
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { getRedisClient } from '../../../../../lib/redis/redis-client.js';
import type { ProviderDeepLinkResolver } from '../provider-deeplink-resolver.js';
import { TenbisWorker, type TenbisEnrichmentJob } from './tenbis-worker.js';

/**
 * In-process job queue for 10bis enrichment
 * 
 * MVP implementation:
 * - Jobs are processed immediately in background (via setImmediate)
 * - No persistence (jobs lost on restart)
 * - No retries (failures are logged but not retried)
 * - No rate limiting (processed as fast as possible)
 * 
 * For production:
 * - Use external queue (Bull, BullMQ) with Redis persistence
 * - Add retry logic with exponential backoff
 * - Add rate limiting to avoid overloading search API
 */
export class TenbisJobQueue {
  private worker: TenbisWorker | null = null;
  private processing = false;
  private queue: TenbisEnrichmentJob[] = [];

  constructor(private resolver: ProviderDeepLinkResolver) {}

  /**
   * Initialize worker (lazy initialization)
   */
  private async initWorker(): Promise<TenbisWorker | null> {
    if (this.worker) {
      return this.worker;
    }

    const redis = await getRedisClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });

    if (!redis) {
      logger.warn(
        {
          event: 'tenbis_worker_init_failed',
          reason: 'redis_unavailable',
        },
        '[TenbisJobQueue] Worker initialization failed: Redis unavailable'
      );
      return null;
    }

    this.worker = new TenbisWorker(redis, this.resolver);

    logger.info(
      {
        event: 'tenbis_worker_initialized',
      },
      '[TenbisJobQueue] Worker initialized'
    );

    return this.worker;
  }

  /**
   * Enqueue a 10bis enrichment job
   * 
   * Idempotency guard: Prevents duplicate jobs for same placeId in queue
   * (Primary deduplication is via Redis lock before enqueue, this is safety net)
   * 
   * @param job - 10bis enrichment job
   */
  enqueue(job: TenbisEnrichmentJob): void {
    // Guard: Check if job for same placeId already in queue
    const existingJob = this.queue.find((j) => j.placeId === job.placeId);
    if (existingJob) {
      logger.info(
        {
          event: 'tenbis_job_deduplicated',
          requestId: job.requestId,
          placeId: job.placeId,
          existingRequestId: existingJob.requestId,
          queuePosition: this.queue.indexOf(existingJob),
        },
        '[TenbisJobQueue] Job already in queue, skipped (idempotency guard)'
      );
      return;
    }

    logger.debug(
      {
        event: 'tenbis_job_enqueued',
        requestId: job.requestId,
        placeId: job.placeId,
        restaurantName: job.name,
        queueSize: this.queue.length + 1,
      },
      '[TenbisJobQueue] Job enqueued'
    );

    this.queue.push(job);

    // Process queue in background (non-blocking)
    this.processQueue();
  }

  /**
   * Process queue in background
   * 
   * Uses setImmediate to process jobs asynchronously without blocking
   */
  private processQueue(): void {
    // Prevent concurrent processing
    if (this.processing) {
      return;
    }

    // Schedule processing on next tick
    setImmediate(() => {
      void this.processNextJob();
    });
  }

  /**
   * Process next job in queue
   */
  private async processNextJob(): Promise<void> {
    // Guard: Already processing
    if (this.processing) {
      return;
    }

    // Guard: Queue empty
    if (this.queue.length === 0) {
      return;
    }

    this.processing = true;

    // Dequeue job (must be outside try block for catch visibility)
    const job = this.queue.shift();
    if (!job) {
      this.processing = false;
      return;
    }

    try {

      // Initialize worker (lazy)
      const worker = await this.initWorker();
      if (!worker) {
        logger.warn(
          {
            event: 'tenbis_job_skipped',
            requestId: job.requestId,
            placeId: job.placeId,
            reason: 'worker_unavailable',
          },
          '[TenbisJobQueue] Job skipped: Worker unavailable'
        );
        
        // SAFETY GUARD: Publish NOT_FOUND patch even without worker
        // This ensures frontend doesn't stay in PENDING state when Redis fails
        try {
          logger.info(
            {
              event: 'tenbis_patch_publish_attempt',
              requestId: job.requestId,
              placeId: job.placeId,
              status: 'NOT_FOUND',
              reason: 'worker_unavailable',
            },
            '[TenbisJobQueue] Attempting to publish fallback RESULT_PATCH'
          );

          const { wsManager } = await import('../../../../../server.js');
          
          // Use unified provider patch method (includes structured logging)
          wsManager.publishProviderPatch(
            'tenbis',
            job.placeId,
            job.requestId,
            'NOT_FOUND',
            null,
            new Date().toISOString()
          );
          
          logger.info(
            {
              event: 'tenbis_fallback_patch_published',
              requestId: job.requestId,
              placeId: job.placeId,
              reason: 'worker_unavailable',
            },
            '[TenbisJobQueue] Fallback RESULT_PATCH published successfully'
          );
        } catch (patchErr) {
          logger.warn(
            {
              event: 'tenbis_patch_fallback_failed',
              requestId: job.requestId,
              placeId: job.placeId,
              error: patchErr instanceof Error ? patchErr.message : String(patchErr),
            },
            '[TenbisJobQueue] Failed to publish fallback patch (non-fatal)'
          );
        }
        
        return;
      }

      // Process job
      await worker.processJob(job);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'tenbis_job_processing_error',
          error,
        },
        '[TenbisJobQueue] Job processing error'
      );
      
      // SAFETY GUARD 2: Publish NOT_FOUND patch if job processing failed
      // This handles unexpected errors that occur before worker.processJob completes
      if (job) {
        try {
          logger.info(
            {
              event: 'tenbis_patch_publish_attempt',
              requestId: job.requestId,
              placeId: job.placeId,
              status: 'NOT_FOUND',
              reason: 'job_processing_error',
            },
            '[TenbisJobQueue] Attempting to publish emergency RESULT_PATCH'
          );

          const { wsManager } = await import('../../../../../server.js');
          
          // Use unified provider patch method (includes structured logging)
          wsManager.publishProviderPatch(
            'tenbis',
            job.placeId,
            job.requestId,
            'NOT_FOUND',
            null,
            new Date().toISOString()
          );
          
          logger.info(
            {
              event: 'tenbis_emergency_patch_published',
              requestId: job.requestId,
              placeId: job.placeId,
              reason: 'job_processing_error',
            },
            '[TenbisJobQueue] Emergency RESULT_PATCH published successfully'
          );
        } catch (patchErr) {
          logger.warn(
            {
              event: 'tenbis_patch_emergency_failed',
              requestId: job?.requestId,
              placeId: job?.placeId,
              error: patchErr instanceof Error ? patchErr.message : String(patchErr),
            },
            '[TenbisJobQueue] Failed to publish emergency patch (non-fatal)'
          );
        }
      }
    } finally {
      this.processing = false;

      // Continue processing queue if more jobs
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Get queue size (for monitoring)
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean {
    return this.processing;
  }
}
