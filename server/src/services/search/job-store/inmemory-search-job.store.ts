/**
 * In-Memory Search Job Store
 * Tracks async search job status and results with TTL-based cleanup
 */

import { logger } from '../../../lib/logger/structured-logger.js';
import type { ISearchJobStore, SearchJob, JobStatus } from './job-store.interface.js';

export class InMemorySearchJobStore implements ISearchJobStore {
  private jobs = new Map<string, SearchJob>();
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes
  // Idempotency index: idempotencyKey -> requestId
  private idempotencyIndex = new Map<string, string>();

  constructor() {
    // Auto-cleanup every minute
    setInterval(() => this.sweep(), 60_000).unref?.();
    logger.info({ ttlMs: this.ttlMs, msg: '[JobStore] Initialized' });
  }

  /**
   * Create a new search job with explicit requestId
   */
  createJob(requestId: string, params: { sessionId: string; query: string; ownerUserId?: string | null; ownerSessionId?: string | null; idempotencyKey?: string }): void {
    const now = Date.now();

    this.jobs.set(requestId, {
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      ownerUserId: params.ownerUserId ?? null,
      ownerSessionId: params.ownerSessionId ?? null,
      idempotencyKey: params.idempotencyKey
    });

    // Index by idempotency key if provided
    if (params.idempotencyKey) {
      this.idempotencyIndex.set(params.idempotencyKey, requestId);
    }

    logger.info({
      requestId,
      sessionId: params.sessionId,
      query: params.query,
      status: 'PENDING',
      hasOwner: !!(params.ownerUserId || params.ownerSessionId),
      hasIdempotencyKey: !!params.idempotencyKey,
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

    // MONOTONIC INVARIANT: Progress never decreases
    if (progress !== undefined) {
      const currentProgress = job.progress ?? 0;
      job.progress = Math.max(currentProgress, progress);
    }

    const durationMs = Math.round(performance.now() - startTime);

    logger.info({
      requestId,
      status,
      progress: job.progress,
      durationMs,
      msg: '[JobStore] Status updated'
    });
  }

  /**
   * Update job heartbeat (only updates updatedAt timestamp)
   * Used to keep RUNNING jobs "alive" without changing status/progress
   */
  updateHeartbeat(requestId: string): void {
    const job = this.jobs.get(requestId);
    if (!job) {
      logger.debug({ requestId, msg: '[InMemoryJobStore] updateHeartbeat called but job not found' });
      return;
    }

    // Only update heartbeat for RUNNING jobs
    if (job.status !== 'RUNNING') {
      logger.debug({ 
        requestId, 
        status: job.status,
        msg: '[InMemoryJobStore] updateHeartbeat skipped - job not RUNNING' 
      });
      return;
    }

    job.updatedAt = Date.now();

    logger.debug({
      requestId,
      status: job.status,
      progress: job.progress,
      msg: '[InMemoryJobStore] Heartbeat updated'
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
    const job = this.jobs.get(requestId);

    // Clean up idempotency index if key exists
    if (job?.idempotencyKey) {
      this.idempotencyIndex.delete(job.idempotencyKey);
    }

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
   * Find existing job by idempotency key
   * Returns job if found with status RUNNING or DONE_SUCCESS (within fresh window)
   * @param idempotencyKey - The idempotency key to search for
   * @param freshWindowMs - Time window (ms) for DONE_SUCCESS jobs to be considered fresh (default: 5000ms)
   */
  findByIdempotencyKey(idempotencyKey: string, freshWindowMs: number = 5000): SearchJob | null {
    const requestId = this.idempotencyIndex.get(idempotencyKey);
    if (!requestId) {
      return null;
    }

    const job = this.jobs.get(requestId);
    if (!job) {
      // Cleanup stale index entry
      this.idempotencyIndex.delete(idempotencyKey);
      return null;
    }

    // Check TTL
    if (Date.now() - job.createdAt > this.ttlMs) {
      this.jobs.delete(requestId);
      this.idempotencyIndex.delete(idempotencyKey);
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
  setCandidatePool(requestId: string, pool: SearchJob['candidatePool']): void {
    const job = this.jobs.get(requestId);
    if (!job) {
      logger.warn({ requestId, msg: '[JobStore] setCandidatePool called but job not found' });
      return;
    }

    job.candidatePool = pool;
    job.updatedAt = Date.now();

    logger.info({
      requestId,
      candidateCount: pool?.candidates.length ?? 0,
      route: pool?.route,
      msg: '[JobStore] Candidate pool stored'
    });
  }

  /**
   * Get candidate pool (IDOR-protected: validates sessionId ownership)
   * Returns null if not found or if requestor is not the owner
   */
  getCandidatePool(requestId: string, sessionId: string): SearchJob['candidatePool'] | null {
    const job = this.jobs.get(requestId);
    if (!job) {
      return null;
    }

    // Check TTL
    if (Date.now() - job.createdAt > this.ttlMs) {
      this.jobs.delete(requestId);
      return null;
    }

    // IDOR Protection: Verify ownership via sessionId
    if (job.sessionId !== sessionId) {
      logger.warn({
        requestId,
        jobSessionId: job.sessionId,
        requestSessionId: sessionId,
        event: 'candidate_pool_access_denied',
        msg: '[JobStore] IDOR protection: sessionId mismatch'
      });
      return null;
    }

    return job.candidatePool ?? null;
  }

  /**
   * Get all running jobs (for shutdown cleanup)
   */
  getRunningJobs(): SearchJob[] {
    const runningJobs: SearchJob[] = [];
    const now = Date.now();

    for (const [_, job] of this.jobs.entries()) {
      // Skip expired jobs
      if (now - job.createdAt > this.ttlMs) {
        continue;
      }

      if (job.status === 'RUNNING') {
        runningJobs.push(job);
      }
    }

    return runningJobs;
  }

  /**
   * Auto-cleanup expired jobs
   */
  private sweep(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [requestId, job] of this.jobs.entries()) {
      if (now - job.createdAt > this.ttlMs) {
        // Clean up both job and idempotency index
        if (job.idempotencyKey) {
          this.idempotencyIndex.delete(job.idempotencyKey);
        }
        this.jobs.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info({ cleaned, total: this.jobs.size, msg: '[JobStore] Sweep completed' });
    }
  }
}

