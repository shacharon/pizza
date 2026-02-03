/**
 * Wolt Worker - Background Job Processor (Enhanced)
 * 
 * Processes Wolt enrichment jobs with timeout/retry:
 * 1. Search for Wolt restaurant page (using search adapter) - with timeout
 * 2. Match best result (using matcher)
 * 3. Write to Redis cache provider:wolt:{placeId} with TTL
 * 4. Publish WebSocket RESULT_PATCH with providers.wolt + updatedAt
 * 
 * Error Handling:
 * - Timeout: Write NOT_FOUND, publish patch, log timeout
 * - Transient errors: Retry with exponential backoff (up to MAX_RETRIES)
 * - Permanent errors: Write NOT_FOUND, publish patch, no retry
 * 
 * Timeout Strategy:
 * - Overall job timeout: 30s (WOLT_JOB_CONFIG.JOB_TIMEOUT_MS)
 * - Search timeout: 20s (WOLT_JOB_CONFIG.SEARCH_TIMEOUT_MS)
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
  WOLT_REDIS_KEYS,
  WOLT_CACHE_TTL_SECONDS,
  WOLT_JOB_CONFIG,
  type WoltCacheEntry,
} from '../../../wolt/wolt-enrichment.contracts.js';
import type { WSServerResultPatch } from '../../../../../infra/websocket/websocket-protocol.js';
import { wsManager } from '../../../../../server.js';
import type { WoltSearchAdapter } from './wolt-search.adapter.js';
import { buildWoltSearchQuery } from './wolt-search.adapter.js';
import { findBestMatch } from './wolt-matcher.js';
import { withTimeout } from '../../../../../lib/reliability/timeout-guard.js';

/**
 * Wolt enrichment job
 */
export interface WoltEnrichmentJob {
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
   * Wolt URL (if found)
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
 * Wolt Worker - Processes enrichment jobs
 */
export class WoltWorker {
  constructor(
    private redis: RedisClient,
    private searchAdapter: WoltSearchAdapter
  ) {}

  /**
   * Process a single Wolt enrichment job (with timeout and retry)
   * 
   * Steps:
   * 1. Search for Wolt restaurant page (with timeout)
   * 2. Match best result
   * 3. Write to Redis cache provider:wolt:{placeId}
   * 4. Publish WebSocket RESULT_PATCH with updatedAt
   * 
   * Retry Strategy:
   * - Retries on: timeout, network errors, transient failures
   * - No retry on: 4xx errors, invalid data, permanent failures
   * - Exponential backoff: 1s → 2s → 4s
   * 
   * @param job - Wolt enrichment job
   * @returns Job result with updatedAt
   */
  async processJob(job: WoltEnrichmentJob): Promise<JobResult> {
    const { requestId, placeId, name, cityText } = job;

    logger.info(
      {
        event: 'wolt_job_started',
        requestId,
        placeId,
        restaurantName: name,
        cityText,
        timeout: WOLT_JOB_CONFIG.JOB_TIMEOUT_MS,
        maxRetries: WOLT_JOB_CONFIG.MAX_RETRIES,
      },
      '[WoltWorker] Processing job'
    );

    // Wrap entire job with timeout guard
    try {
      const result = await withTimeout(
        this.processJobInternal(job, 0),
        WOLT_JOB_CONFIG.JOB_TIMEOUT_MS,
        `Wolt job timeout for ${placeId}`
      );

      return result;
    } catch (err) {
      // Overall timeout or unrecoverable error
      const error = err instanceof Error ? err.message : String(err);
      const isTimeout = error.includes('timeout') || error.includes('Timeout');

      logger.error(
        {
          event: 'wolt_job_failed',
          requestId,
          placeId,
          error,
          isTimeout,
        },
        '[WoltWorker] Job failed (final)'
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
            event: 'wolt_error_cleanup_failed',
            requestId,
            placeId,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          },
          '[WoltWorker] Failed to write NOT_FOUND on error (non-fatal)'
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
   * @param job - Wolt enrichment job
   * @param attemptNumber - Current attempt (0-indexed)
   * @returns Job result
   */
  private async processJobInternal(
    job: WoltEnrichmentJob,
    attemptNumber: number
  ): Promise<JobResult> {
    const { requestId, placeId, name, cityText } = job;

    try {
      // Step 1: Search for Wolt restaurant page (with search-specific timeout)
      const searchQuery = buildWoltSearchQuery(name, cityText ?? null);
      
      logger.debug(
        {
          event: 'wolt_search_started',
          requestId,
          placeId,
          query: searchQuery,
          attempt: attemptNumber + 1,
        },
        '[WoltWorker] Starting search'
      );

      const searchResults = await withTimeout(
        this.searchAdapter.searchWeb(searchQuery, 5),
        WOLT_JOB_CONFIG.SEARCH_TIMEOUT_MS,
        `Wolt search timeout for ${placeId}`
      );

      logger.debug(
        {
          event: 'wolt_search_completed',
          requestId,
          placeId,
          query: searchQuery,
          resultCount: searchResults.length,
          attempt: attemptNumber + 1,
        },
        '[WoltWorker] Search completed'
      );

      // Step 2: Match best result
      const matchResult = findBestMatch(searchResults, name, cityText ?? null);

      const status: 'FOUND' | 'NOT_FOUND' = matchResult.found ? 'FOUND' : 'NOT_FOUND';
      const url = matchResult.url;
      const updatedAt = new Date().toISOString();

      logger.info(
        {
          event: 'wolt_match_completed',
          requestId,
          placeId,
          status,
          url,
          bestScore: matchResult.bestScore?.score,
          attempt: attemptNumber + 1,
        },
        '[WoltWorker] Match completed'
      );

      // Step 3: Write to Redis cache
      await this.writeCacheEntry(placeId, url, status);

      // Step 4: Publish WebSocket RESULT_PATCH event with updatedAt
      await this.publishPatchEvent(requestId, placeId, status, url, updatedAt);

      // Step 5: Clean up lock (optional, TTL already exists)
      await this.cleanupLock(placeId);

      logger.info(
        {
          event: 'wolt_job_completed',
          requestId,
          placeId,
          status,
          attempts: attemptNumber + 1,
        },
        '[WoltWorker] Job completed successfully'
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
          event: 'wolt_job_attempt_failed',
          requestId,
          placeId,
          error,
          attempt: attemptNumber + 1,
          maxRetries: WOLT_JOB_CONFIG.MAX_RETRIES,
          isTimeout,
          isTransient,
        },
        '[WoltWorker] Job attempt failed'
      );

      // Retry logic
      if (isTransient && attemptNumber < WOLT_JOB_CONFIG.MAX_RETRIES) {
        const retryDelay = WOLT_JOB_CONFIG.RETRY_DELAY_MS * Math.pow(2, attemptNumber);
        
        logger.info(
          {
            event: 'wolt_job_retrying',
            requestId,
            placeId,
            attempt: attemptNumber + 1,
            nextAttempt: attemptNumber + 2,
            retryDelayMs: retryDelay,
          },
          '[WoltWorker] Retrying job after delay'
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
   * @param url - Wolt URL (or null)
   * @param status - Match status
   */
  private async writeCacheEntry(
    placeId: string,
    url: string | null,
    status: 'FOUND' | 'NOT_FOUND'
  ): Promise<void> {
    const cacheEntry: WoltCacheEntry = {
      url,
      status,
      updatedAt: new Date().toISOString(),
    };

    const ttl =
      status === 'FOUND'
        ? WOLT_CACHE_TTL_SECONDS.FOUND
        : WOLT_CACHE_TTL_SECONDS.NOT_FOUND;

    const key = WOLT_REDIS_KEYS.place(placeId);

    await this.redis.setex(key, ttl, JSON.stringify(cacheEntry));

    logger.debug(
      {
        event: 'wolt_cache_written',
        placeId,
        status,
        ttl,
      },
      '[WoltWorker] Cache entry written'
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
   * @param url - Wolt URL (or null)
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
    wsManager.publishProviderPatch('wolt', placeId, requestId, status, url, updatedAt);
  }

  /**
   * Clean up lock key (optional, TTL auto-expires)
   * 
   * @param placeId - Google Place ID
   */
  private async cleanupLock(placeId: string): Promise<void> {
    try {
      const lockKey = WOLT_REDIS_KEYS.lock(placeId);
      await this.redis.del(lockKey);

      logger.debug(
        {
          event: 'wolt_lock_cleaned',
          placeId,
        },
        '[WoltWorker] Lock key cleaned up'
      );
    } catch (err) {
      // Non-fatal: Lock will expire via TTL anyway
      logger.warn(
        {
          event: 'wolt_lock_cleanup_failed',
          placeId,
          error: err instanceof Error ? err.message : String(err),
        },
        '[WoltWorker] Lock cleanup failed (non-fatal)'
      );
    }
  }
}
