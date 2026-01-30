/**
 * Redis-backed Search Job Store
 * Persistent storage that survives server restarts
 */

import type { Redis as RedisClient } from 'ioredis';
import { logger } from '../../../lib/logger/structured-logger.js';
import type { ISearchJobStore, SearchJob, JobStatus } from './job-store.interface.js';

const KEY_PREFIX = 'search:job:';
const IDEMPOTENCY_PREFIX = 'search:idempotency:';
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export class RedisSearchJobStore implements ISearchJobStore {
  private redis: RedisClient;
  private ttlSeconds: number;

  constructor(redisClient: RedisClient, ttlSeconds: number = DEFAULT_TTL_SECONDS) {
    this.redis = redisClient;
    this.ttlSeconds = ttlSeconds;

    logger.info({
      ttlSeconds: this.ttlSeconds,
      msg: '[RedisJobStore] Initialized with shared Redis client'
    });
  }

  private getKey(requestId: string): string {
    return `${KEY_PREFIX}${requestId}`;
  }

  private getIdempotencyKey(idempotencyKey: string): string {
    return `${IDEMPOTENCY_PREFIX}${idempotencyKey}`;
  }

  async createJob(requestId: string, params: { sessionId: string; query: string; ownerUserId?: string | null; ownerSessionId?: string | null; idempotencyKey?: string }): Promise<void> {
    const now = Date.now();
    const job: SearchJob = {
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      ownerUserId: params.ownerUserId ?? null,
      ownerSessionId: params.ownerSessionId ?? null,
      idempotencyKey: params.idempotencyKey
    };

    const key = this.getKey(requestId);
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(job));

    // Index by idempotency key if provided
    if (params.idempotencyKey) {
      const idempotencyKey = this.getIdempotencyKey(params.idempotencyKey);
      await this.redis.setex(idempotencyKey, this.ttlSeconds, requestId);
    }

    logger.info({
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      hasOwner: !!(params.ownerUserId || params.ownerSessionId),
      hasIdempotencyKey: !!params.idempotencyKey,
      msg: '[RedisJobStore] Job created'
    });
  }

  async setStatus(requestId: string, status: JobStatus, progress?: number): Promise<void> {
    const job = await this.getJob(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[RedisJobStore] setStatus called but job not found' });
      return;
    }

    job.status = status;
    job.updatedAt = Date.now();

    if (progress !== undefined) {
      job.progress = progress;
    }

    const key = this.getKey(requestId);
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(job));

    logger.info({
      requestId,
      status,
      progress,
      msg: '[RedisJobStore] Status updated'
    });
  }

  async setResult(requestId: string, result: unknown): Promise<void> {
    const job = await this.getJob(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[RedisJobStore] setResult called but job not found' });
      return;
    }

    job.result = result;
    job.updatedAt = Date.now();

    const key = this.getKey(requestId);
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(job));

    logger.info({
      requestId,
      hasResult: !!result,
      msg: '[RedisJobStore] Result stored'
    });
  }

  async setError(requestId: string, code: string, message: string, errorType?: 'LLM_TIMEOUT' | 'GATE_ERROR' | 'SEARCH_FAILED'): Promise<void> {
    const job = await this.getJob(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[RedisJobStore] setError called but job not found' });
      return;
    }

    job.error = { code, message, errorType: errorType || 'UNKNOWN' };
    job.status = 'DONE_FAILED';
    job.updatedAt = Date.now();

    const key = this.getKey(requestId);
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(job));

    logger.warn({
      requestId,
      code,
      message,
      errorType: errorType || 'UNKNOWN',
      msg: '[RedisJobStore] Error set'
    });
  }

  async getStatus(requestId: string): Promise<{ status: JobStatus; progress?: number; error?: SearchJob['error'] } | null> {
    const job = await this.getJob(requestId);
    if (!job) {
      return null;
    }

    return {
      status: job.status,
      ...(job.progress !== undefined && { progress: job.progress }),
      ...(job.error && { error: job.error })
    };
  }

  async getResult(requestId: string): Promise<unknown | null> {
    const job = await this.getJob(requestId);
    if (!job) {
      return null;
    }

    return job.result ?? null;
  }

  async getJob(requestId: string): Promise<SearchJob | null> {
    const key = this.getKey(requestId);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as SearchJob;
    } catch (err) {
      logger.error({ requestId, error: (err as Error).message, msg: '[RedisJobStore] Failed to parse job' });
      return null;
    }
  }

  async deleteJob(requestId: string): Promise<void> {
    const job = await this.getJob(requestId);

    // Clean up idempotency index if key exists
    if (job?.idempotencyKey) {
      const idempotencyKey = this.getIdempotencyKey(job.idempotencyKey);
      await this.redis.del(idempotencyKey);
    }

    const key = this.getKey(requestId);
    await this.redis.del(key);
    logger.info({ requestId, msg: '[RedisJobStore] Job deleted' });
  }

  /**
   * Find existing job by idempotency key
   * Returns job if found with status RUNNING or DONE_SUCCESS (within fresh window)
   * @param idempotencyKey - The idempotency key to search for
   * @param freshWindowMs - Time window (ms) for DONE_SUCCESS jobs to be considered fresh (default: 5000ms)
   */
  async findByIdempotencyKey(idempotencyKey: string, freshWindowMs: number = 5000): Promise<SearchJob | null> {
    const key = this.getIdempotencyKey(idempotencyKey);
    const requestId = await this.redis.get(key);

    if (!requestId) {
      return null;
    }

    const job = await this.getJob(requestId);
    if (!job) {
      // Cleanup stale index entry
      await this.redis.del(key);
      return null;
    }

    const now = Date.now();
    const validStatuses: JobStatus[] = ['RUNNING', 'DONE_SUCCESS'];

    // For RUNNING jobs, return immediately
    if (job.status === 'RUNNING') {
      return job;
    }

    // For DONE_SUCCESS, check if within fresh window
    if (job.status === 'DONE_SUCCESS' && (now - job.updatedAt) <= freshWindowMs) {
      return job;
    }

    return null;
  }

  /**
   * Store candidate pool for local soft-filter requery
   */
  async setCandidatePool(requestId: string, pool: SearchJob['candidatePool']): Promise<void> {
    const job = await this.getJob(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[RedisJobStore] setCandidatePool called but job not found' });
      return;
    }

    job.candidatePool = pool;
    job.updatedAt = Date.now();

    const key = this.getKey(requestId);
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(job));

    logger.info({
      requestId,
      candidateCount: pool?.candidates.length ?? 0,
      route: pool?.route,
      msg: '[RedisJobStore] Candidate pool stored'
    });
  }

  /**
   * Get candidate pool (IDOR-protected: validates sessionId ownership)
   * Returns null if not found or if requestor is not the owner
   */
  async getCandidatePool(requestId: string, sessionId: string): Promise<SearchJob['candidatePool'] | null> {
    const job = await this.getJob(requestId);
    if (!job) {
      return null;
    }

    // IDOR Protection: Verify ownership via sessionId
    if (job.sessionId !== sessionId) {
      logger.warn({
        requestId,
        jobSessionId: job.sessionId,
        requestSessionId: sessionId,
        event: 'candidate_pool_access_denied',
        msg: '[RedisJobStore] IDOR protection: sessionId mismatch'
      });
      return null;
    }

    return job.candidatePool ?? null;
  }

  /**
   * Get all running jobs (for shutdown cleanup)
   * Note: Redis doesn't support scanning by status efficiently, so this scans all job keys
   */
  async getRunningJobs(): Promise<SearchJob[]> {
    const runningJobs: SearchJob[] = [];
    
    try {
      // Scan for all job keys
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${KEY_PREFIX}*`,
          'COUNT',
          100
        );
        cursor = nextCursor;

        // Fetch jobs in parallel
        const jobs = await Promise.all(
          keys.map(async (key) => {
            const data = await this.redis.get(key);
            if (!data) return null;
            try {
              return JSON.parse(data) as SearchJob;
            } catch {
              return null;
            }
          })
        );

        // Filter for running jobs
        for (const job of jobs) {
          if (job && job.status === 'RUNNING') {
            runningJobs.push(job);
          }
        }
      } while (cursor !== '0');

      return runningJobs;
    } catch (err) {
      logger.error({
        error: (err as Error).message,
        msg: '[RedisJobStore] Failed to get running jobs'
      });
      return [];
    }
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info({ msg: '[RedisJobStore] Connection closed' });
  }
}
