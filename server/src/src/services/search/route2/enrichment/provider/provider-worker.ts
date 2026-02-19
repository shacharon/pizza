/**
 * Provider Worker - Background Job Processor (Generic)
 * 
 * Processes provider enrichment jobs with timeout/retry for any provider (wolt, tenbis, mishloha)
 * 1. Search for provider restaurant page (using search adapter) - with timeout
 * 2. Match best result (using matcher)
 * 3. Write to Redis cache provider:{providerId}:{placeId} with TTL
 * 4. Publish WebSocket RESULT_PATCH with providers.{provider} + updatedAt
 * 
 * Error Handling:
 * - Timeout: Write NOT_FOUND, publish patch, log timeout
 * - Transient errors: Retry with exponential backoff (up to MAX_RETRIES)
 * - Permanent errors: Write NOT_FOUND, publish patch, no retry
 * 
 * Timeout Strategy:
 * - Overall job timeout: 30s (PROVIDER_JOB_CONFIG.JOB_TIMEOUT_MS)
 * - Search timeout: 20s (PROVIDER_JOB_CONFIG.SEARCH_TIMEOUT_MS)
 * - On timeout: Treated as transient error, eligible for retry
 * 
 * Retry Strategy:
 * - Max retries: 2 (total 3 attempts including initial)
 * - Exponential backoff: 1s → 2s → 4s
 * - Retryable: timeouts, network errors, 5xx responses
 * - Not retryable: 4xx errors, invalid data, cache write errors
 */

import type { Redis as RedisClient } from 'ioredis';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import {
  PROVIDER_REDIS_KEYS,
  PROVIDER_CACHE_TTL_SECONDS,
  PROVIDER_JOB_CONFIG,
  type ProviderCacheEntry,
  type ProviderEnrichmentJob,
  type JobResult,
  type ProviderId,
  getProviderDisplayName,
} from './provider.contracts.js';
import { wsManager } from '../../../../../server.js';
import { withTimeout } from '../../../../../lib/reliability/timeout-guard.js';
import type { ProviderDeepLinkResolver } from '../provider-deeplink-resolver.js';
import { getMetricsCollector } from '../metrics-collector.js';

/**
 * Provider Worker - Processes enrichment jobs for any provider
 */
export class ProviderWorker {
  constructor(
    private redis: RedisClient,
    private resolver: ProviderDeepLinkResolver
  ) {}

  /**
   * Process a single provider enrichment job (with timeout and retry)
   * 
   * Steps:
   * 1. Search for provider restaurant page (with timeout)
   * 2. Match best result
   * 3. Write to Redis cache provider:{providerId}:{placeId}
   * 4. Publish WebSocket RESULT_PATCH with updatedAt
   * 
   * Retry Strategy:
   * - Retries on: timeout, network errors, transient failures
   * - No retry on: 4xx errors, invalid data, permanent failures
   * - Exponential backoff: 1s → 2s → 4s
   * 
   * @param job - Provider enrichment job
   * @returns Job result with updatedAt
   */
  async processJob(job: ProviderEnrichmentJob): Promise<JobResult> {
    const { providerId, requestId, placeId, name, cityText } = job;
    const displayName = getProviderDisplayName(providerId);

    logger.info(
      {
        event: 'provider_job_started',
        providerId,
        requestId,
        placeId,
        restaurantName: name,
        cityText,
        timeout: PROVIDER_JOB_CONFIG.JOB_TIMEOUT_MS,
        maxRetries: PROVIDER_JOB_CONFIG.MAX_RETRIES,
      },
      `[ProviderWorker:${providerId}] Processing job`
    );

    // Wrap entire job with timeout guard
    try {
      const result = await withTimeout(
        this.processJobInternal(job, 0),
        PROVIDER_JOB_CONFIG.JOB_TIMEOUT_MS,
        `${displayName} job timeout for ${placeId}`
      );

      return result;
    } catch (err) {
      // Overall timeout or unrecoverable error
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes('timeout') || error.includes('Timeout');

      logger.error(
        {
          event: 'provider_job_failed',
          providerId,
          requestId,
          placeId,
          error,
          isTimeout,
        },
        `[ProviderWorker:${providerId}] Job failed (final)`
      );

      // Write NOT_FOUND and publish patch (no meta on error)
      const updatedAt = new Date().toISOString();
      try {
        await this.writeCacheEntry(providerId, placeId, null, 'NOT_FOUND', undefined);
        await this.publishPatchEvent(providerId, requestId, placeId, 'NOT_FOUND', null, updatedAt, undefined);
        await this.cleanupLock(providerId, placeId);
      } catch (cleanupErr) {
        logger.warn(
          {
            event: 'provider_error_cleanup_failed',
            providerId,
            requestId,
            placeId,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          },
          `[ProviderWorker:${providerId}] Failed to write NOT_FOUND on error (non-fatal)`
        );
      }

      return {
        success: false,
        url: null,
        status: 'NOT_FOUND',
        updatedAt,
        error,
      };
    }
  }

  /**
   * Internal job processing with retry logic
   * 
   * @param job - Provider enrichment job
   * @param attemptNumber - Current attempt (0-indexed)
   * @returns Job result
   */
  private async processJobInternal(
    job: ProviderEnrichmentJob,
    attemptNumber: number
  ): Promise<JobResult> {
    const { providerId, requestId, placeId, name, cityText } = job;

    try {
      // Step 1: Resolve provider deep link using 3-layer strategy
      logger.debug(
        {
          event: 'provider_resolution_started',
          providerId,
          requestId,
          placeId,
          name,
          cityText,
          attempt: attemptNumber + 1,
        },
        `[ProviderWorker:${providerId}] Starting resolution`
      );

      const resolveResult = await withTimeout(
        this.resolver.resolve({
          provider: providerId,
          name,
          cityText: cityText ?? null,
        }),
        PROVIDER_JOB_CONFIG.SEARCH_TIMEOUT_MS,
        `${getProviderDisplayName(providerId)} resolution timeout for ${placeId}`
      );

      const { status, url, meta } = resolveResult;
      const updatedAt = new Date().toISOString();

      // Track CSE usage in metrics if CSE was used (L1 or L2)
      if (meta.source === 'cse') {
        const metricsCollector = getMetricsCollector();
        metricsCollector.recordCseCall(requestId);
        
        logger.debug(
          {
            event: 'provider_cse_call_tracked',
            providerId,
            requestId,
            placeId,
            layerUsed: meta.layerUsed,
          },
          `[ProviderWorker:${providerId}] CSE call tracked in metrics`
        );
      }

      logger.info(
        {
          event: 'provider_resolution_completed',
          providerId,
          requestId,
          placeId,
          status,
          url,
          layerUsed: meta.layerUsed,
          source: meta.source,
          attempt: attemptNumber + 1,
        },
        `[ProviderWorker:${providerId}] Resolution completed`
      );

      // Step 2: Write to Redis cache (with meta)
      await this.writeCacheEntry(providerId, placeId, url, status, meta);

      // Step 3: Publish WebSocket RESULT_PATCH event with meta
      await this.publishPatchEvent(providerId, requestId, placeId, status, url, updatedAt, meta);

      // Step 4: Clean up lock (optional, TTL already exists)
      await this.cleanupLock(providerId, placeId);

      logger.info(
        {
          event: 'provider_job_completed',
          providerId,
          requestId,
          placeId,
          status,
          attempts: attemptNumber + 1,
        },
        `[ProviderWorker:${providerId}] Job completed successfully`
      );

      return {
        success: true,
        url,
        status,
        updatedAt,
        meta,
        retries: attemptNumber,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes('timeout') || error.includes('Timeout');
      const isTransient = this.isTransientError(error);

      logger.warn(
        {
          event: 'provider_job_attempt_failed',
          providerId,
          requestId,
          placeId,
          error,
          attempt: attemptNumber + 1,
          maxRetries: PROVIDER_JOB_CONFIG.MAX_RETRIES,
          isTimeout,
          isTransient,
        },
        `[ProviderWorker:${providerId}] Job attempt failed`
      );

      // Retry logic
      if (isTransient && attemptNumber < PROVIDER_JOB_CONFIG.MAX_RETRIES) {
        const retryDelay = PROVIDER_JOB_CONFIG.RETRY_DELAY_MS * Math.pow(2, attemptNumber);
        
        logger.info(
          {
            event: 'provider_job_retrying',
            providerId,
            requestId,
            placeId,
            attempt: attemptNumber + 1,
            nextAttempt: attemptNumber + 2,
            retryDelayMs: retryDelay,
          },
          `[ProviderWorker:${providerId}] Retrying job after delay`
        );

        // Wait before retry (exponential backoff)
        await this.sleep(retryDelay);

        // Recursive retry
        return this.processJobInternal(job, attemptNumber + 1);
      }

      // No more retries or permanent error - throw to outer handler
      throw err;
    }
  }

  /**
   * Determine if error is transient (eligible for retry)
   * 
   * Transient errors:
   * - Network timeouts
   * - Connection errors
   * - 5xx server errors
   * - Rate limiting (429)
   * 
   * Permanent errors:
   * - 4xx client errors (except 429)
   * - Invalid data
   * - Authentication errors
   * 
   * @param error - Error message
   * @returns True if error is transient
   */
  private isTransientError(error: string): boolean {
    const transientPatterns = [
      'timeout',
      'Timeout',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
      'ENETUNREACH',
      '5xx',
      '500',
      '502',
      '503',
      '504',
      '429', // Rate limiting
      'network',
      'Network',
    ];

    return transientPatterns.some((pattern) => error.includes(pattern));
  }

  /**
   * Sleep helper for retry delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Write cache entry to Redis
   * 
   * @param providerId - Provider ID
   * @param placeId - Google Place ID
   * @param url - Provider URL (or null)
   * @param status - Match status
   * @param meta - Resolution metadata
   */
  private async writeCacheEntry(
    providerId: ProviderId,
    placeId: string,
    url: string | null,
    status: 'FOUND' | 'NOT_FOUND',
    meta?: { layerUsed: 1 | 2 | 3; source: 'cse' | 'internal' }
  ): Promise<void> {
    const cacheEntry: ProviderCacheEntry = {
      url,
      status,
      updatedAt: new Date().toISOString(),
      ...(meta && { meta }),
    };

    const ttl =
      status === 'FOUND'
        ? PROVIDER_CACHE_TTL_SECONDS.FOUND
        : PROVIDER_CACHE_TTL_SECONDS.NOT_FOUND;

    const key = PROVIDER_REDIS_KEYS.place(providerId, placeId);

    await this.redis.setex(key, ttl, JSON.stringify(cacheEntry));

    logger.info(
      {
        event: 'provider_cache_written',
        providerId,
        placeId,
        status,
        ttlSeconds: ttl,
        meta,
      },
      `[ProviderWorker:${providerId}] Cache entry written (TTL: ${ttl}s)`
    );
  }

  /**
   * Publish WebSocket RESULT_PATCH event with updatedAt and meta
   * 
   * Uses unified wsManager.publishProviderPatch() method.
   * 
   * @param providerId - Provider ID
   * @param requestId - Search request ID
   * @param placeId - Google Place ID
   * @param status - Match status
   * @param url - Provider URL (or null)
   * @param updatedAt - ISO timestamp of enrichment completion
   * @param meta - Resolution metadata
   */
  private async publishPatchEvent(
    providerId: ProviderId,
    requestId: string,
    placeId: string,
    status: 'FOUND' | 'NOT_FOUND',
    url: string | null,
    updatedAt: string,
    meta?: { layerUsed: 1 | 2 | 3; source: 'cse' | 'internal' }
  ): Promise<void> {
    // Use unified provider patch method (includes structured logging)
    wsManager.publishProviderPatch(providerId, placeId, requestId, status, url, updatedAt, meta);
  }

  /**
   * Clean up lock key (optional, TTL auto-expires)
   * 
   * @param providerId - Provider ID
   * @param placeId - Google Place ID
   */
  private async cleanupLock(providerId: ProviderId, placeId: string): Promise<void> {
    try {
      const lockKey = PROVIDER_REDIS_KEYS.lock(providerId, placeId);
      await this.redis.del(lockKey);

      logger.debug(
        {
          event: 'provider_lock_cleaned',
          providerId,
          placeId,
        },
        `[ProviderWorker:${providerId}] Lock key cleaned up`
      );
    } catch (err) {
      // Non-fatal: Lock will expire via TTL anyway
      logger.warn(
        {
          event: 'provider_lock_cleanup_failed',
          providerId,
          placeId,
          error: err instanceof Error ? err.message : String(err),
        },
        `[ProviderWorker:${providerId}] Lock cleanup failed (non-fatal)`
      );
    }
  }
}
