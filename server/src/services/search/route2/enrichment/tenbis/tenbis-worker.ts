/**
 * 10bis Worker - Background Job Processor (Enhanced)
 * 
 * Processes 10bis enrichment jobs with timeout/retry:
 * 1. Search for 10bis restaurant page (using search adapter) - with timeout
 * 2. Match best result (using matcher)
 * 3. Write to Redis cache provider:tenbis:{placeId} with TTL
 * 4. Publish WebSocket RESULT_PATCH with providers.tenbis + updatedAt
 * 
 * Error Handling:
 * - Timeout: Write NOT_FOUND, publish patch, log timeout
 * - Transient errors: Retry with exponential backoff (up to MAX_RETRIES)
 * - Permanent errors: Write NOT_FOUND, publish patch, no retry
 * 
 * Timeout Strategy:
 * - Overall job timeout: 30s (TENBIS_JOB_CONFIG.JOB_TIMEOUT_MS)
 * - Search timeout: 20s (TENBIS_JOB_CONFIG.SEARCH_TIMEOUT_MS)
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
  TENBIS_REDIS_KEYS,
  TENBIS_CACHE_TTL_SECONDS,
  TENBIS_JOB_CONFIG,
  type TenbisCacheEntry,
} from './tenbis-enrichment.contracts.js';
import { wsManager } from '../../../../../server.js';
import type { TenbisSearchAdapter } from './tenbis-search.adapter.js';
import { buildTenbisSearchQuery } from './tenbis-search.adapter.js';
import { findBestMatch } from './tenbis-matcher.js';
import { withTimeout } from '../../../../../lib/reliability/timeout-guard.js';

/**
 * 10bis enrichment job
 */
export interface TenbisEnrichmentJob {
  /**
   * Search request ID (for WS patch event)
   */
  requestId: string;

  /**
   * Google Place ID (cache key)
   */
  placeId: string;

  /**
   * Restaurant name
   */
  name: string;

  /**
   * City name (optional, from intent stage)
   */
  cityText?: string | null;

  /**
   * Address text (optional, for future use)
   */
  addressText?: string | null;
}

/**
 * Job processing result
 */
export interface JobResult {
  /**
   * Job succeeded
   */
  success: boolean;

  /**
   * 10bis URL (if found)
   */
  url: string | null;

  /**
   * Status
   */
  status: 'FOUND' | 'NOT_FOUND';

  /**
   * Timestamp when result was determined
   */
  updatedAt: string;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Number of retry attempts made
   */
  retries?: number;
}

/**
 * 10bis Worker - Processes enrichment jobs
 */
export class TenbisWorker {
  constructor(
    private redis: RedisClient,
    private searchAdapter: TenbisSearchAdapter
  ) {}

  /**
   * Process a single 10bis enrichment job (with timeout and retry)
   * 
   * Steps:
   * 1. Search for 10bis restaurant page (with timeout)
   * 2. Match best result
   * 3. Write to Redis cache provider:tenbis:{placeId}
   * 4. Publish WebSocket RESULT_PATCH with updatedAt
   * 
   * Retry Strategy:
   * - Retries on: timeout, network errors, transient failures
   * - No retry on: 4xx errors, invalid data, permanent failures
   * - Exponential backoff: 1s → 2s → 4s
   * 
   * @param job - 10bis enrichment job
   * @returns Job result with updatedAt
   */
  async processJob(job: TenbisEnrichmentJob): Promise<JobResult> {
    const { requestId, placeId, name, cityText } = job;

    logger.info(
      {
        event: 'tenbis_job_started',
        requestId,
        placeId,
        restaurantName: name,
        cityText,
        timeout: TENBIS_JOB_CONFIG.JOB_TIMEOUT_MS,
        maxRetries: TENBIS_JOB_CONFIG.MAX_RETRIES,
      },
      '[TenbisWorker] Processing job'
    );

    // Wrap entire job with timeout guard
    try {
      const result = await withTimeout(
        this.processJobInternal(job, 0),
        TENBIS_JOB_CONFIG.JOB_TIMEOUT_MS,
        `10bis job timeout for ${placeId}`
      );

      return result;
    } catch (err) {
      // Overall timeout or unrecoverable error
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes('timeout') || error.includes('Timeout');

      logger.error(
        {
          event: 'tenbis_job_failed',
          requestId,
          placeId,
          error,
          isTimeout,
        },
        '[TenbisWorker] Job failed (final)'
      );

      // Write NOT_FOUND and publish patch
      const updatedAt = new Date().toISOString();
      try {
        await this.writeCacheEntry(placeId, null, 'NOT_FOUND');
        await this.publishPatchEvent(requestId, placeId, 'NOT_FOUND', null, updatedAt);
        await this.cleanupLock(placeId);
      } catch (cleanupErr) {
        logger.warn(
          {
            event: 'tenbis_error_cleanup_failed',
            requestId,
            placeId,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          },
          '[TenbisWorker] Failed to write NOT_FOUND on error (non-fatal)'
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
   * @param job - 10bis enrichment job
   * @param attemptNumber - Current attempt (0-indexed)
   * @returns Job result
   */
  private async processJobInternal(
    job: TenbisEnrichmentJob,
    attemptNumber: number
  ): Promise<JobResult> {
    const { requestId, placeId, name, cityText } = job;

    try {
      // Step 1: Search for 10bis restaurant page (with search-specific timeout)
      const searchQuery = buildTenbisSearchQuery(name, cityText ?? null);
      
      logger.debug(
        {
          event: 'tenbis_search_started',
          requestId,
          placeId,
          query: searchQuery,
          attempt: attemptNumber + 1,
        },
        '[TenbisWorker] Starting search'
      );

      const searchResults = await withTimeout(
        this.searchAdapter.searchWeb(searchQuery, 5),
        TENBIS_JOB_CONFIG.SEARCH_TIMEOUT_MS,
        `10bis search timeout for ${placeId}`
      );

      logger.debug(
        {
          event: 'tenbis_search_completed',
          requestId,
          placeId,
          query: searchQuery,
          resultCount: searchResults.length,
          attempt: attemptNumber + 1,
        },
        '[TenbisWorker] Search completed'
      );

      // Step 2: Match best result
      const matchResult = findBestMatch(searchResults, name, cityText ?? null);

      const status: 'FOUND' | 'NOT_FOUND' = matchResult.found ? 'FOUND' : 'NOT_FOUND';
      const url = matchResult.url;
      const updatedAt = new Date().toISOString();

      logger.info(
        {
          event: 'tenbis_match_completed',
          requestId,
          placeId,
          status,
          url,
          bestScore: matchResult.bestScore?.score,
          attempt: attemptNumber + 1,
        },
        '[TenbisWorker] Match completed'
      );

      // Step 3: Write to Redis cache
      await this.writeCacheEntry(placeId, url, status);

      // Step 4: Publish WebSocket RESULT_PATCH event with updatedAt
      await this.publishPatchEvent(requestId, placeId, status, url, updatedAt);

      // Step 5: Clean up lock (optional, TTL already exists)
      await this.cleanupLock(placeId);

      logger.info(
        {
          event: 'tenbis_job_completed',
          requestId,
          placeId,
          status,
          attempts: attemptNumber + 1,
        },
        '[TenbisWorker] Job completed successfully'
      );

      return {
        success: true,
        url,
        status,
        updatedAt,
        retries: attemptNumber,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes('timeout') || error.includes('Timeout');
      const isTransient = this.isTransientError(error);

      logger.warn(
        {
          event: 'tenbis_job_attempt_failed',
          requestId,
          placeId,
          error,
          attempt: attemptNumber + 1,
          maxRetries: TENBIS_JOB_CONFIG.MAX_RETRIES,
          isTimeout,
          isTransient,
        },
        '[TenbisWorker] Job attempt failed'
      );

      // Retry logic
      if (isTransient && attemptNumber < TENBIS_JOB_CONFIG.MAX_RETRIES) {
        const retryDelay = TENBIS_JOB_CONFIG.RETRY_DELAY_MS * Math.pow(2, attemptNumber);
        
        logger.info(
          {
            event: 'tenbis_job_retrying',
            requestId,
            placeId,
            attempt: attemptNumber + 1,
            nextAttempt: attemptNumber + 2,
            retryDelayMs: retryDelay,
          },
          '[TenbisWorker] Retrying job after delay'
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
   * @param placeId - Google Place ID
   * @param url - 10bis URL (or null)
   * @param status - Match status
   */
  private async writeCacheEntry(
    placeId: string,
    url: string | null,
    status: 'FOUND' | 'NOT_FOUND'
  ): Promise<void> {
    const cacheEntry: TenbisCacheEntry = {
      url,
      status,
      updatedAt: new Date().toISOString(),
    };

    const ttl =
      status === 'FOUND'
        ? TENBIS_CACHE_TTL_SECONDS.FOUND
        : TENBIS_CACHE_TTL_SECONDS.NOT_FOUND;

    const key = TENBIS_REDIS_KEYS.place(placeId);

    await this.redis.setex(key, ttl, JSON.stringify(cacheEntry));

    logger.debug(
      {
        event: 'tenbis_cache_written',
        placeId,
        status,
        ttl,
      },
      '[TenbisWorker] Cache entry written'
    );
  }

  /**
   * Publish WebSocket RESULT_PATCH event with updatedAt
   * 
   * Uses unified wsManager.publishProviderPatch() method.
   * 
   * @param requestId - Search request ID
   * @param placeId - Google Place ID
   * @param status - Match status
   * @param url - 10bis URL (or null)
   * @param updatedAt - ISO timestamp of enrichment completion
   */
  private async publishPatchEvent(
    requestId: string,
    placeId: string,
    status: 'FOUND' | 'NOT_FOUND',
    url: string | null,
    updatedAt: string
  ): Promise<void> {
    // Use unified provider patch method (includes structured logging)
    wsManager.publishProviderPatch('tenbis', placeId, requestId, status, url, updatedAt);
  }

  /**
   * Clean up lock key (optional, TTL auto-expires)
   * 
   * @param placeId - Google Place ID
   */
  private async cleanupLock(placeId: string): Promise<void> {
    try {
      const lockKey = TENBIS_REDIS_KEYS.lock(placeId);
      await this.redis.del(lockKey);

      logger.debug(
        {
          event: 'tenbis_lock_cleaned',
          placeId,
        },
        '[TenbisWorker] Lock key cleaned up'
      );
    } catch (err) {
      // Non-fatal: Lock will expire via TTL anyway
      logger.warn(
        {
          event: 'tenbis_lock_cleanup_failed',
          placeId,
          error: err instanceof Error ? err.message : String(err),
        },
        '[TenbisWorker] Lock cleanup failed (non-fatal)'
      );
    }
  }
}
