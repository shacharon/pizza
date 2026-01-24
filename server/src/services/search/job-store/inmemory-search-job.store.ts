/**
 * In-Memory Search Job Store
 * Tracks async search job status and results with TTL-based cleanup
 */

import { logger } from '../../../lib/logger/structured-logger.js';
import type { ISearchJobStore, SearchJob, JobStatus } from './job-store.interface.js';

export class InMemorySearchJobStore implements ISearchJobStore {
  private jobs = new Map<string, SearchJob>();
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Auto-cleanup every minute
    setInterval(() => this.sweep(), 60_000).unref?.();
    logger.info({ ttlMs: this.ttlMs, msg: '[JobStore] Initialized' });
  }

  /**
   * Create a new search job with explicit requestId
   */
  createJob(requestId: string, params: { sessionId: string; query: string; ownerUserId?: string | null; ownerSessionId?: string | null }): void {
    const now = Date.now();

    this.jobs.set(requestId, {
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      ownerUserId: params.ownerUserId ?? null,
      ownerSessionId: params.ownerSessionId ?? null
    });

    logger.info({
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      hasOwner: !!(params.ownerUserId || params.ownerSessionId),
      msg: '[InMemoryJobStore] Job created'
    });
  }

  /**
   * Update job status and optional progress
   */
  setStatus(requestId: string, status: JobStatus, progress?: number): void {
    const startTime = performance.now();
    const job = this.jobs.get(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[JobStore] setStatus called but job not found' });
      return;
    }

    job.status = status;
    job.updatedAt = Date.now();
    
    if (progress !== undefined) {
      job.progress = progress;
    }

    const durationMs = Math.round(performance.now() - startTime);

    logger.info({
      requestId,
      status,
      progress,
      durationMs,
      msg: '[JobStore] Status updated'
    });
  }

  /**
   * Store job result
   */
  setResult(requestId: string, result: unknown): void {
    const startTime = performance.now();
    const job = this.jobs.get(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[JobStore] setResult called but job not found' });
      return;
    }

    job.result = result;
    job.updatedAt = Date.now();

    const durationMs = Math.round(performance.now() - startTime);

    logger.info({
      requestId,
      hasResult: !!result,
      durationMs,
      msg: '[JobStore] Result stored'
    });
  }

  /**
   * Set job error with errorType for better UX
   */
  setError(requestId: string, code: string, message: string, errorType?: 'LLM_TIMEOUT' | 'GATE_ERROR' | 'SEARCH_FAILED'): void {
    const job = this.jobs.get(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[JobStore] setError called but job not found' });
      return;
    }

    job.error = { code, message, errorType: errorType || 'UNKNOWN' };
    job.status = 'DONE_FAILED';
    job.updatedAt = Date.now();

    logger.warn({
      requestId,
      code,
      message,
      errorType: errorType || 'UNKNOWN',
      msg: '[JobStore] Error set'
    });
  }

  /**
   * Get full job details
   */
  getJob(requestId: string): SearchJob | null {
    const job = this.jobs.get(requestId);
    if (!job) {
      return null;
    }

    // Check TTL
    if (Date.now() - job.createdAt > this.ttlMs) {
      this.jobs.delete(requestId);
      return null;
    }

    return job;
  }

  /**
   * Delete a job
   */
  deleteJob(requestId: string): void {
    this.jobs.delete(requestId);
    logger.info({ requestId, msg: '[JobStore] Job deleted' });
  }

  /**
   * Get job status and progress
   */
  getStatus(requestId: string): { status: JobStatus; progress?: number; error?: { code: string; message: string } } | null {
    const job = this.jobs.get(requestId);
    if (!job) {
      return null;
    }

    // Check TTL
    if (Date.now() - job.createdAt > this.ttlMs) {
      this.jobs.delete(requestId);
      return null;
    }

    return {
      status: job.status,
      ...(job.progress !== undefined && { progress: job.progress }),
      ...(job.error && { error: job.error })
    };
  }

  /**
   * Get job result
   */
  getResult(requestId: string): unknown | null {
    const job = this.jobs.get(requestId);
    if (!job) {
      return null;
    }

    // Check TTL
    if (Date.now() - job.createdAt > this.ttlMs) {
      this.jobs.delete(requestId);
      return null;
    }

    return job.result ?? null;
  }


  /**
   * Auto-cleanup expired jobs
   */
  private sweep(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, job] of this.jobs.entries()) {
      if (now - job.createdAt > this.ttlMs) {
        this.jobs.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned, total: this.jobs.size, msg: '[JobStore] Sweep completed' });
    }
  }
}

