/**
 * Redis-backed Search Job Store
 * Persistent storage that survives server restarts
 */

import type { Redis as RedisClient } from 'ioredis';
import { logger } from '../../../lib/logger/structured-logger.js';
import type { ISearchJobStore, SearchJob, JobStatus } from './job-store.interface.js';

const KEY_PREFIX = 'search:job:';
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

  async createJob(requestId: string, params: { sessionId: string; query: string; ownerUserId?: string | null; ownerSessionId?: string | null }): Promise<void> {
    const now = Date.now();
    const job: SearchJob = {
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      ownerUserId: params.ownerUserId ?? null,
      ownerSessionId: params.ownerSessionId ?? null
    };

    const key = this.getKey(requestId);
    await this.redis.setex(key, this.ttlSeconds, JSON.stringify(job));

    logger.info({
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      hasOwner: !!(params.ownerUserId || params.ownerSessionId),
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
    const key = this.getKey(requestId);
    await this.redis.del(key);
    logger.info({ requestId, msg: '[RedisJobStore] Job deleted' });
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info({ msg: '[RedisJobStore] Connection closed' });
  }
}
