/**
 * Provider Job Queue - In-Process Queue (Generic)
 * 
 * Simple in-memory job queue for background provider enrichment.
 * Supports multiple providers: wolt, tenbis, mishloha
 * 
 * For production, consider external queue (Bull, BullMQ, etc.)
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { getRedisClient } from '../../../../../lib/redis/redis-client.js';
import type { ProviderDeepLinkResolver } from '../provider-deeplink-resolver.js';
import { ProviderWorker } from './provider-worker.js';
import type { ProviderEnrichmentJob, ProviderId } from './provider.contracts.js';

/**
 * In-process job queue for provider enrichment
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
export class ProviderJobQueue {
  private worker: ProviderWorker | null = null;
  private processing = false;
  private queue: ProviderEnrichmentJob[] = [];
  private providerId: ProviderId;

  constructor(
    providerId: ProviderId,
    private resolver: ProviderDeepLinkResolver
  ) {
    this.providerId = providerId;
  }

  /**
   * Initialize worker (lazy initialization)
   */
  private async initWorker(): Promise<ProviderWorker | null> {
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
          event: 'provider_worker_init_failed',
          providerId: this.providerId,
          reason: 'redis_unavailable',
        },
        `[ProviderJobQueue:${this.providerId}] Worker initialization failed: Redis unavailable`
      );
      return null;
    }

    this.worker = new ProviderWorker(redis, this.resolver);

    logger.info(
      {
        event: 'provider_worker_initialized',
        providerId: this.providerId,
      },
      `[ProviderJobQueue:${this.providerId}] Worker initialized`
    );

    return this.worker;
  }

  /**
   * Enqueue a provider enrichment job
   * 
   * Idempotency guard: Prevents duplicate jobs for same placeId in queue
   * (Primary deduplication is via Redis lock before enqueue, this is safety net)
   * 
   * @param job - Provider enrichment job
   */
  enqueue(job: ProviderEnrichmentJob): void {
    // Guard: Check if job for same placeId already in queue
    const existingJob = this.queue.find((j) => j.placeId === job.placeId);
    if (existingJob) {
      logger.info(
        {
          event: 'provider_job_deduplicated',
          providerId: this.providerId,
          requestId: job.requestId,
          placeId: job.placeId,
          existingRequestId: existingJob.requestId,
          queuePosition: this.queue.indexOf(existingJob),
        },
        `[ProviderJobQueue:${this.providerId}] Job already in queue, skipped (idempotency guard)`
      );
      return;
    }

    logger.debug(
      {
        event: 'provider_job_enqueued',
        providerId: this.providerId,
        requestId: job.requestId,
        placeId: job.placeId,
        restaurantName: job.name,
        queueSize: this.queue.length + 1,
      },
      `[ProviderJobQueue:${this.providerId}] Job enqueued`
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
            event: 'provider_job_skipped',
            providerId: this.providerId,
            requestId: job.requestId,
            placeId: job.placeId,
            reason: 'worker_unavailable',
          },
          `[ProviderJobQueue:${this.providerId}] Job skipped: Worker unavailable`
        );
        
        // SAFETY GUARD: Publish NOT_FOUND patch even without worker
        // This ensures frontend doesn't stay in PENDING state when Redis fails
        try {
          logger.info(
            {
              event: 'provider_patch_publish_attempt',
              providerId: this.providerId,
              requestId: job.requestId,
              placeId: job.placeId,
              status: 'NOT_FOUND',
              reason: 'worker_unavailable',
            },
            `[ProviderJobQueue:${this.providerId}] Attempting to publish fallback RESULT_PATCH`
          );

          const { wsManager } = await import('../../../../../server.js');
          
          // Use unified provider patch method (includes structured logging)
          wsManager.publishProviderPatch(
            this.providerId,
            job.placeId,
            job.requestId,
            'NOT_FOUND',
            null,
            new Date().toISOString()
          );
          
          logger.info(
            {
              event: 'provider_fallback_patch_published',
              providerId: this.providerId,
              requestId: job.requestId,
              placeId: job.placeId,
              reason: 'worker_unavailable',
            },
            `[ProviderJobQueue:${this.providerId}] Fallback RESULT_PATCH published successfully`
          );
        } catch (patchErr) {
          logger.warn(
            {
              event: 'provider_patch_fallback_failed',
              providerId: this.providerId,
              requestId: job.requestId,
              placeId: job.placeId,
              error: patchErr instanceof Error ? patchErr.message : String(patchErr),
            },
            `[ProviderJobQueue:${this.providerId}] Failed to publish fallback patch (non-fatal)`
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
          event: 'provider_job_processing_error',
          providerId: this.providerId,
          error,
        },
        `[ProviderJobQueue:${this.providerId}] Job processing error`
      );
      
      // SAFETY GUARD 2: Publish NOT_FOUND patch if job processing failed
      // This handles unexpected errors that occur before worker.processJob completes
      if (job) {
        try {
          logger.info(
            {
              event: 'provider_patch_publish_attempt',
              providerId: this.providerId,
              requestId: job.requestId,
              placeId: job.placeId,
              status: 'NOT_FOUND',
              reason: 'job_processing_error',
            },
            `[ProviderJobQueue:${this.providerId}] Attempting to publish emergency RESULT_PATCH`
          );

          const { wsManager } = await import('../../../../../server.js');
          
          // Use unified provider patch method (includes structured logging)
          wsManager.publishProviderPatch(
            this.providerId,
            job.placeId,
            job.requestId,
            'NOT_FOUND',
            null,
            new Date().toISOString()
          );
          
          logger.info(
            {
              event: 'provider_emergency_patch_published',
              providerId: this.providerId,
              requestId: job.requestId,
              placeId: job.placeId,
              reason: 'job_processing_error',
            },
            `[ProviderJobQueue:${this.providerId}] Emergency RESULT_PATCH published successfully`
          );
        } catch (patchErr) {
          logger.warn(
            {
              event: 'provider_patch_emergency_failed',
              providerId: this.providerId,
              requestId: job?.requestId,
              placeId: job?.placeId,
              error: patchErr instanceof Error ? patchErr.message : String(patchErr),
            },
            `[ProviderJobQueue:${this.providerId}] Failed to publish emergency patch (non-fatal)`
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
