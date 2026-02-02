/**
 * Search Deduplication Service
 * 
 * Pure decision logic for determining whether to reuse existing search jobs.
 * Encapsulates the complete deduplication decision matrix.
 * 
 * DECISION MATRIX (Single Source of Truth):
 * 1. DONE_SUCCESS → REUSE (cached result)
 * 2. DONE_FAILED → NEW_JOB (previous job failed)
 * 3. RUNNING → Check staleness:
 *    - Fresh (updatedAt recent) → REUSE
 *    - Stale (updatedAt old) → NEW_JOB
 * 4. Other statuses (PENDING, DONE_CLARIFY, DONE_STOPPED) → REUSE
 * 
 * NO side effects - pure decision logic only.
 * NO mutations - read-only access to job store.
 * NO logging - caller handles observability.
 */

import type { SearchJob } from '../../services/search/job-store/job-store.interface.js';
import type { ISearchJobStore } from '../../services/search/job-store/job-store.interface.js';
import { DEDUP_SUCCESS_FRESH_WINDOW_MS, DEDUP_RUNNING_MAX_AGE_MS } from '../../config/deduplication.config.js';

/**
 * Deduplication decision result
 */
export interface DeduplicationDecision {
  shouldReuse: boolean;
  reason: string;
  existingJob: SearchJob | null;
  ageMs?: number;
  updatedAgeMs?: number;
}

/**
 * Reuse eligibility details
 */
export interface ReuseEligibility {
  eligible: boolean;
  reason: string;
  details?: {
    ageMs: number;
    updatedAgeMs: number;
    maxAgeMs: number;
    isStaleByUpdatedAt?: boolean;
    isStaleByAge?: boolean;
  };
}

/**
 * SearchDeduplicationService - Pure deduplication decision logic
 * 
 * Determines whether to reuse an existing search job or create a new one.
 * All decision matrix logic and staleness detection lives here.
 */
export class SearchDeduplicationService {
  constructor(private readonly jobStore: ISearchJobStore) {}

  /**
   * Find candidate job by idempotency key
   * 
   * @param idempotencyKey - Idempotency key for deduplication
   * @returns Candidate job or null if not found
   */
  async findCandidate(idempotencyKey: string): Promise<SearchJob | null> {
    try {
      return await this.jobStore.findByIdempotencyKey(idempotencyKey, DEDUP_SUCCESS_FRESH_WINDOW_MS);
    } catch (err) {
      // Non-fatal: if lookup fails, return null (caller will create new job)
      return null;
    }
  }

  /**
   * Decide whether to reuse candidate job
   * 
   * This is the main entry point for deduplication decisions.
   * Encapsulates the complete decision matrix.
   * 
   * @param candidate - Candidate job to evaluate
   * @param now - Current timestamp (for testing/determinism)
   * @returns Deduplication decision
   */
  decideReuse(candidate: SearchJob | null, now: number = Date.now()): DeduplicationDecision {
    // No candidate found - create new job
    if (!candidate) {
      return {
        shouldReuse: false,
        reason: 'NO_CANDIDATE',
        existingJob: null
      };
    }

    const ageMs = now - candidate.createdAt;
    const updatedAgeMs = now - candidate.updatedAt;

    // Apply decision matrix based on job status
    const eligibility = this.shouldReuse(candidate, now);

    return {
      shouldReuse: eligibility.eligible,
      reason: eligibility.reason,
      existingJob: eligibility.eligible ? candidate : null,
      ageMs,
      updatedAgeMs
    };
  }

  /**
   * Determine if job should be reused (core decision matrix)
   * 
   * DECISION MATRIX:
   * 1. DONE_SUCCESS → REUSE (cached result available)
   * 2. DONE_FAILED → NEW_JOB (previous job failed)
   * 3. RUNNING → Check staleness:
   *    - Fresh (updatedAgeMs < maxAge) → REUSE
   *    - Stale (updatedAgeMs > maxAge OR ageMs > maxAge) → NEW_JOB
   * 4. Other statuses (PENDING, DONE_CLARIFY, DONE_STOPPED) → REUSE
   * 
   * @param job - Job to evaluate
   * @param now - Current timestamp (for testing/determinism)
   * @returns Reuse eligibility with reason
   */
  shouldReuse(job: SearchJob, now: number = Date.now()): ReuseEligibility {
    const ageMs = now - job.createdAt;
    const updatedAgeMs = now - job.updatedAt;

    // Decision 1: DONE_SUCCESS → REUSE (cached result)
    if (job.status === 'DONE_SUCCESS') {
      return {
        eligible: true,
        reason: 'CACHED_RESULT_AVAILABLE'
      };
    }

    // Decision 2: DONE_FAILED → NEW_JOB (failed)
    if (job.status === 'DONE_FAILED') {
      return {
        eligible: false,
        reason: 'PREVIOUS_JOB_FAILED'
      };
    }

    // Decision 3: RUNNING → Check staleness
    if (job.status === 'RUNNING') {
      const isStaleByUpdatedAt = updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS;
      const isStaleByAge = ageMs > DEDUP_RUNNING_MAX_AGE_MS;

      if (isStaleByUpdatedAt || isStaleByAge) {
        // Stale RUNNING job - do not reuse
        const reason = isStaleByUpdatedAt
          ? `STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: ${updatedAgeMs}ms > ${DEDUP_RUNNING_MAX_AGE_MS}ms)`
          : `STALE_RUNNING_TOO_OLD (ageMs: ${ageMs}ms > ${DEDUP_RUNNING_MAX_AGE_MS}ms)`;

        return {
          eligible: false,
          reason,
          details: {
            ageMs,
            updatedAgeMs,
            maxAgeMs: DEDUP_RUNNING_MAX_AGE_MS,
            isStaleByUpdatedAt,
            isStaleByAge
          }
        };
      } else {
        // Fresh RUNNING job - reuse
        return {
          eligible: true,
          reason: `RUNNING_FRESH (updatedAgeMs: ${updatedAgeMs}ms < ${DEDUP_RUNNING_MAX_AGE_MS}ms)`,
          details: {
            ageMs,
            updatedAgeMs,
            maxAgeMs: DEDUP_RUNNING_MAX_AGE_MS
          }
        };
      }
    }

    // Decision 4: Other statuses (PENDING, DONE_CLARIFY, DONE_STOPPED) → REUSE
    return {
      eligible: true,
      reason: `STATUS_${job.status}`
    };
  }

  /**
   * Get deduplication configuration for observability
   */
  static getConfig() {
    return {
      runningMaxAgeMs: DEDUP_RUNNING_MAX_AGE_MS,
      successFreshWindowMs: DEDUP_SUCCESS_FRESH_WINDOW_MS
    };
  }

  /**
   * Check if a job is stale (utility for external consumers)
   * 
   * @param job - Job to check
   * @param now - Current timestamp
   * @returns True if job is stale
   */
  static isStale(job: SearchJob, now: number = Date.now()): boolean {
    if (job.status !== 'RUNNING') {
      return false;
    }

    const ageMs = now - job.createdAt;
    const updatedAgeMs = now - job.updatedAt;

    return updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS || ageMs > DEDUP_RUNNING_MAX_AGE_MS;
  }

  /**
   * Get human-readable summary of decision
   * 
   * @param decision - Deduplication decision
   * @returns Summary string
   */
  static summarize(decision: DeduplicationDecision): string {
    const action = decision.shouldReuse ? 'REUSE' : 'NEW_JOB';
    const age = decision.ageMs !== undefined ? `, ageMs: ${decision.ageMs}` : '';
    const updatedAge = decision.updatedAgeMs !== undefined ? `, updatedAgeMs: ${decision.updatedAgeMs}` : '';
    
    return `Decision: ${action} - ${decision.reason}${age}${updatedAge}`;
  }
}
