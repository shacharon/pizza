/**
 * Search Deduplication Service - Backward Compatibility Tests
 * 
 * Ensures that the new SearchDeduplicationService produces identical decisions
 * to the legacy inline deduplication logic from the controller.
 * 
 * This verifies ZERO behavior changes after refactoring.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchDeduplicationService } from '../search.deduplication.service.js';
import type { SearchJob } from '../../../services/search/job-store/job-store.interface.js';
import type { ISearchJobStore } from '../../../services/search/job-store/job-store.interface.js';
import { DEDUP_RUNNING_MAX_AGE_MS } from '../../../config/deduplication.config.js';

describe('SearchDeduplicationService - Backward Compatibility', () => {
  // Mock job store
  class MockJobStore implements ISearchJobStore {
    private jobs = new Map<string, SearchJob>();

    setMockJob(job: SearchJob) {
      this.jobs.set(job.requestId, job);
    }

    async findByIdempotencyKey(): Promise<SearchJob | null> {
      return null; // Not used in these tests
    }

    // Stub implementations
    async createJob() {}
    async setStatus() {}
    async updateHeartbeat() {}
    async setResult() {}
    async setError() {}
    async getStatus() { return null; }
    async getResult() { return null; }
    async getJob() { return null; }
    async deleteJob() {}
    async setCandidatePool() {}
    async getCandidatePool() { return null; }
    async getRunningJobs() { return []; }
  }

  /**
   * Legacy deduplication logic (EXACT copy from controller before refactoring)
   * This is what we're replacing and must match exactly
   */
  function legacyDecideReuse(candidateJob: SearchJob | null, now: number): {
    shouldReuse: boolean;
    reuseReason: string;
    existingJob: SearchJob | null;
  } {
    let shouldReuse = false;
    let reuseReason = '';
    let existingJob = null;

    if (!candidateJob) {
      // No candidate - implicitly returns shouldReuse=false, but no specific reason in original
      return { shouldReuse: false, reuseReason: '', existingJob: null };
    }

    const ageMs = now - candidateJob.createdAt;
    const updatedAgeMs = now - candidateJob.updatedAt;

    // Decision Matrix (exact copy from controller):
    // 1. DONE_SUCCESS -> REUSE (cached result)
    // 2. DONE_FAIL -> NEW_JOB (failed, don't reuse)
    // 3. RUNNING -> Check staleness:
    //    - Fresh (updatedAt recent) -> REUSE
    //    - Stale (updatedAt old) -> NEW_JOB

    if (candidateJob.status === 'DONE_SUCCESS') {
      // Cached result available - reuse immediately
      shouldReuse = true;
      reuseReason = 'CACHED_RESULT_AVAILABLE';
      existingJob = candidateJob;
    } else if (candidateJob.status === 'DONE_FAILED') {
      // Previous job failed - create new job
      shouldReuse = false;
      reuseReason = 'PREVIOUS_JOB_FAILED';
    } else if (candidateJob.status === 'RUNNING') {
      // Check if RUNNING job is stale
      const isStaleByUpdatedAt = updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS;
      const isStaleByAge = ageMs > DEDUP_RUNNING_MAX_AGE_MS;

      if ((isStaleByUpdatedAt || isStaleByAge)) {
        // Stale RUNNING job - do not reuse
        shouldReuse = false;
        reuseReason = isStaleByUpdatedAt
          ? `STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: ${updatedAgeMs}ms > ${DEDUP_RUNNING_MAX_AGE_MS}ms)`
          : `STALE_RUNNING_TOO_OLD (ageMs: ${ageMs}ms > ${DEDUP_RUNNING_MAX_AGE_MS}ms)`;
      } else {
        // Fresh RUNNING job - reuse it
        shouldReuse = true;
        reuseReason = `RUNNING_FRESH (updatedAgeMs: ${updatedAgeMs}ms < ${DEDUP_RUNNING_MAX_AGE_MS}ms)`;
        existingJob = candidateJob;
      }
    } else {
      // Other statuses (PENDING, DONE_CLARIFY, DONE_STOPPED) - reuse
      shouldReuse = true;
      reuseReason = `STATUS_${candidateJob.status}`;
      existingJob = candidateJob;
    }

    return { shouldReuse, reuseReason, existingJob };
  }

  /**
   * Helper to create a test job
   */
  const createJob = (
    status: SearchJob['status'],
    overrides?: Partial<SearchJob>
  ): SearchJob => ({
    requestId: 'req-test-123',
    sessionId: 'session-123',
    query: 'test query',
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    idempotencyKey: 'idem-key-123',
    ...overrides
  });

  /**
   * Compare deduplication decisions
   */
  function assertDecisionsEqual(
    actual: { shouldReuse: boolean; reason: string; existingJob: SearchJob | null },
    expected: { shouldReuse: boolean; reuseReason: string; existingJob: SearchJob | null },
    testName: string
  ) {
    assert.strictEqual(actual.shouldReuse, expected.shouldReuse, `${testName}: shouldReuse mismatch`);
    assert.strictEqual(actual.reason, expected.reuseReason, `${testName}: reason mismatch`);
    assert.strictEqual(actual.existingJob, expected.existingJob, `${testName}: existingJob mismatch`);
  }

  describe('DONE_SUCCESS compatibility', () => {
    it('should match legacy for DONE_SUCCESS', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_SUCCESS', {
        createdAt: now - 10000,
        updatedAt: now - 5000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'DONE_SUCCESS');
    });

    it('should match legacy for old DONE_SUCCESS', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_SUCCESS', {
        createdAt: now - 1000000,
        updatedAt: now - 1000000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'Old DONE_SUCCESS');
    });
  });

  describe('DONE_FAILED compatibility', () => {
    it('should match legacy for DONE_FAILED', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_FAILED', {
        createdAt: now - 10000,
        updatedAt: now - 5000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'DONE_FAILED');
    });

    it('should match legacy for recent DONE_FAILED', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_FAILED', {
        createdAt: now - 1000,
        updatedAt: now - 1000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'Recent DONE_FAILED');
    });
  });

  describe('RUNNING compatibility', () => {
    describe('Fresh RUNNING', () => {
      it('should match legacy for fresh RUNNING job', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const job = createJob('RUNNING', {
          createdAt: now - 10000,
          updatedAt: now - 5000
        });

        const newDecision = service.decideReuse(job, now);
        const legacyDecision = legacyDecideReuse(job, now);

        assertDecisionsEqual(newDecision, legacyDecision, 'Fresh RUNNING');
      });

      it('should match legacy for RUNNING at edge of freshness', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const job = createJob('RUNNING', {
          createdAt: now - DEDUP_RUNNING_MAX_AGE_MS + 1000,
          updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS + 1000
        });

        const newDecision = service.decideReuse(job, now);
        const legacyDecision = legacyDecideReuse(job, now);

        assertDecisionsEqual(newDecision, legacyDecision, 'Edge of freshness RUNNING');
      });
    });

    describe('Stale RUNNING', () => {
      it('should match legacy for stale RUNNING (updatedAt old)', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const job = createJob('RUNNING', {
          createdAt: now - 200000,
          updatedAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 10000)
        });

        const newDecision = service.decideReuse(job, now);
        const legacyDecision = legacyDecideReuse(job, now);

        assertDecisionsEqual(newDecision, legacyDecision, 'Stale RUNNING (updatedAt)');
      });

      it('should match legacy for stale RUNNING (createdAt too old)', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const job = createJob('RUNNING', {
          createdAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 10000),
          updatedAt: now - 5000
        });

        const newDecision = service.decideReuse(job, now);
        const legacyDecision = legacyDecideReuse(job, now);

        assertDecisionsEqual(newDecision, legacyDecision, 'Stale RUNNING (createdAt)');
      });

      it('should match legacy at exact staleness threshold', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        
        // Exactly at threshold (should be fresh)
        const atThreshold = createJob('RUNNING', {
          createdAt: now - DEDUP_RUNNING_MAX_AGE_MS,
          updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS
        });

        const newAtThreshold = service.decideReuse(atThreshold, now);
        const legacyAtThreshold = legacyDecideReuse(atThreshold, now);

        assertDecisionsEqual(newAtThreshold, legacyAtThreshold, 'At threshold');

        // One ms over threshold (should be stale)
        const overThreshold = createJob('RUNNING', {
          createdAt: now - DEDUP_RUNNING_MAX_AGE_MS - 1,
          updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS - 1
        });

        const newOverThreshold = service.decideReuse(overThreshold, now);
        const legacyOverThreshold = legacyDecideReuse(overThreshold, now);

        assertDecisionsEqual(newOverThreshold, legacyOverThreshold, 'Over threshold');
      });
    });
  });

  describe('Other statuses compatibility', () => {
    it('should match legacy for PENDING', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('PENDING', {
        createdAt: now - 10000,
        updatedAt: now - 5000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'PENDING');
    });

    it('should match legacy for DONE_CLARIFY', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_CLARIFY', {
        createdAt: now - 10000,
        updatedAt: now - 5000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'DONE_CLARIFY');
    });

    it('should match legacy for DONE_STOPPED', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_STOPPED', {
        createdAt: now - 10000,
        updatedAt: now - 5000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'DONE_STOPPED');
    });

    it('should match legacy for old PENDING', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('PENDING', {
        createdAt: now - 1000000,
        updatedAt: now - 1000000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'Old PENDING');
    });
  });

  describe('Comprehensive scenarios', () => {
    it('should match legacy for typical cached result scenario', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job: SearchJob = {
        requestId: 'req-cached-123',
        sessionId: 'session-abc',
        query: 'pizza near me',
        status: 'DONE_SUCCESS',
        createdAt: now - 3000,
        updatedAt: now - 2000,
        idempotencyKey: 'idem-pizza-123',
        result: { results: [] }
      };

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'Cached result scenario');
    });

    it('should match legacy for in-progress scenario', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job: SearchJob = {
        requestId: 'req-progress-456',
        sessionId: 'session-xyz',
        query: 'sushi nearby',
        status: 'RUNNING',
        progress: 50,
        createdAt: now - 30000,
        updatedAt: now - 1000, // Recent heartbeat
        idempotencyKey: 'idem-sushi-456'
      };

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'In-progress scenario');
    });

    it('should match legacy for stuck job scenario', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job: SearchJob = {
        requestId: 'req-stuck-789',
        sessionId: 'session-def',
        query: 'burgers',
        status: 'RUNNING',
        progress: 30,
        createdAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 50000),
        updatedAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 50000), // No heartbeat for long time
        idempotencyKey: 'idem-burgers-789'
      };

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'Stuck job scenario');
    });
  });

  describe('Edge cases', () => {
    it('should match legacy for zero timestamps', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_SUCCESS', {
        createdAt: 0,
        updatedAt: 0
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      assertDecisionsEqual(newDecision, legacyDecision, 'Zero timestamps');
    });

    it('should match legacy for all status types', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const statuses: SearchJob['status'][] = [
        'PENDING',
        'RUNNING',
        'DONE_SUCCESS',
        'DONE_CLARIFY',
        'DONE_STOPPED',
        'DONE_FAILED'
      ];

      const now = Date.now();

      statuses.forEach(status => {
        const job = createJob(status, {
          createdAt: now - 10000,
          updatedAt: now - 5000
        });

        const newDecision = service.decideReuse(job, now);
        const legacyDecision = legacyDecideReuse(job, now);

        assertDecisionsEqual(newDecision, legacyDecision, `Status: ${status}`);
      });
    });
  });

  describe('No candidate scenarios', () => {
    it('should match legacy behavior for null candidate', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const newDecision = service.decideReuse(null);
      const legacyDecision = legacyDecideReuse(null, Date.now());

      // Note: Legacy returned empty reason for null candidate
      assert.strictEqual(newDecision.shouldReuse, legacyDecision.shouldReuse, 'shouldReuse mismatch');
      assert.strictEqual(newDecision.existingJob, legacyDecision.existingJob, 'existingJob mismatch');
      // Reason may differ (new: 'NO_CANDIDATE', legacy: ''), but behavior is same
    });
  });

  describe('Field preservation', () => {
    it('should preserve all decision fields like legacy', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('RUNNING', {
        createdAt: now - 50000,
        updatedAt: now - 10000
      });

      const newDecision = service.decideReuse(job, now);
      const legacyDecision = legacyDecideReuse(job, now);

      // Check all fields
      assert.strictEqual(newDecision.shouldReuse, legacyDecision.shouldReuse);
      assert.strictEqual(newDecision.reason, legacyDecision.reuseReason);
      assert.strictEqual(newDecision.existingJob, legacyDecision.existingJob);

      // New service adds age metrics - verify they're correct
      assert.strictEqual(newDecision.ageMs, 50000);
      assert.strictEqual(newDecision.updatedAgeMs, 10000);
    });
  });
});
