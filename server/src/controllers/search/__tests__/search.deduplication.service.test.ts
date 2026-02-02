/**
 * Search Deduplication Service Tests
 * 
 * Tests the pure deduplication decision logic that determines
 * whether to reuse existing search jobs or create new ones.
 * 
 * Decision Matrix:
 * 1. DONE_SUCCESS → REUSE (cached result)
 * 2. DONE_FAILED → NEW_JOB (previous job failed)
 * 3. RUNNING → Check staleness:
 *    - Fresh → REUSE
 *    - Stale → NEW_JOB
 * 4. Other statuses (PENDING, DONE_CLARIFY, DONE_STOPPED) → REUSE
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchDeduplicationService } from '../search.deduplication.service.js';
import type { SearchJob } from '../../../services/search/job-store/job-store.interface.js';
import type { ISearchJobStore } from '../../../services/search/job-store/job-store.interface.js';
import { DEDUP_RUNNING_MAX_AGE_MS, DEDUP_SUCCESS_FRESH_WINDOW_MS } from '../../../config/deduplication.config.js';

describe('SearchDeduplicationService', () => {
  // Mock job store
  class MockJobStore implements ISearchJobStore {
    private jobs = new Map<string, SearchJob>();
    private idempotencyMap = new Map<string, string>(); // idempotency key -> requestId

    setMockJob(job: SearchJob) {
      this.jobs.set(job.requestId, job);
      if (job.idempotencyKey) {
        this.idempotencyMap.set(job.idempotencyKey, job.requestId);
      }
    }

    async findByIdempotencyKey(key: string, freshWindowMs?: number): Promise<SearchJob | null> {
      const requestId = this.idempotencyMap.get(key);
      if (!requestId) return null;
      
      const job = this.jobs.get(requestId);
      return job || null;
    }

    // Stub implementations for required interface methods
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

  describe('Decision Matrix - Core Routing Logic', () => {
    describe('DONE_SUCCESS → REUSE', () => {
      it('should reuse DONE_SUCCESS job (cached result)', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_SUCCESS');
        const result = service.shouldReuse(job);

        assert.strictEqual(result.eligible, true, 'Should reuse DONE_SUCCESS');
        assert.strictEqual(result.reason, 'CACHED_RESULT_AVAILABLE');
      });

      it('should reuse DONE_SUCCESS job regardless of age', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const oldJob = createJob('DONE_SUCCESS', {
          createdAt: now - 1000000, // Very old
          updatedAt: now - 1000000
        });

        const result = service.shouldReuse(oldJob, now);

        assert.strictEqual(result.eligible, true, 'Should reuse old DONE_SUCCESS');
        assert.strictEqual(result.reason, 'CACHED_RESULT_AVAILABLE');
      });

      it('should include DONE_SUCCESS in decideReuse full flow', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_SUCCESS');
        const decision = service.decideReuse(job);

        assert.strictEqual(decision.shouldReuse, true);
        assert.strictEqual(decision.reason, 'CACHED_RESULT_AVAILABLE');
        assert.strictEqual(decision.existingJob, job);
      });
    });

    describe('DONE_FAILED → NEW_JOB', () => {
      it('should NOT reuse DONE_FAILED job', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_FAILED');
        const result = service.shouldReuse(job);

        assert.strictEqual(result.eligible, false, 'Should NOT reuse DONE_FAILED');
        assert.strictEqual(result.reason, 'PREVIOUS_JOB_FAILED');
      });

      it('should reject DONE_FAILED even if recent', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const recentFailed = createJob('DONE_FAILED', {
          createdAt: now - 1000, // 1 second ago
          updatedAt: now - 1000
        });

        const result = service.shouldReuse(recentFailed, now);

        assert.strictEqual(result.eligible, false, 'Should NOT reuse recent DONE_FAILED');
        assert.strictEqual(result.reason, 'PREVIOUS_JOB_FAILED');
      });

      it('should include DONE_FAILED in decideReuse full flow', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_FAILED');
        const decision = service.decideReuse(job);

        assert.strictEqual(decision.shouldReuse, false);
        assert.strictEqual(decision.reason, 'PREVIOUS_JOB_FAILED');
        assert.strictEqual(decision.existingJob, null, 'Should not return job');
      });
    });

    describe('RUNNING → Check Staleness', () => {
      describe('Fresh RUNNING → REUSE', () => {
        it('should reuse fresh RUNNING job (updatedAt recent)', () => {
          const mockStore = new MockJobStore();
          const service = new SearchDeduplicationService(mockStore);

          const now = Date.now();
          const freshJob = createJob('RUNNING', {
            createdAt: now - 10000, // 10s ago
            updatedAt: now - 5000   // 5s ago (fresh)
          });

          const result = service.shouldReuse(freshJob, now);

          assert.strictEqual(result.eligible, true, 'Should reuse fresh RUNNING');
          assert.ok(result.reason.includes('RUNNING_FRESH'), 'Reason should indicate fresh');
          assert.ok(result.details, 'Should have details');
          assert.strictEqual(result.details!.updatedAgeMs, 5000);
        });

        it('should reuse RUNNING job at edge of freshness', () => {
          const mockStore = new MockJobStore();
          const service = new SearchDeduplicationService(mockStore);

          const now = Date.now();
          const edgeJob = createJob('RUNNING', {
            createdAt: now - DEDUP_RUNNING_MAX_AGE_MS + 1000,
            updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS + 1000 // Just under threshold
          });

          const result = service.shouldReuse(edgeJob, now);

          assert.strictEqual(result.eligible, true, 'Should reuse at edge of freshness');
          assert.ok(result.reason.includes('RUNNING_FRESH'));
        });
      });

      describe('Stale RUNNING → NEW_JOB', () => {
        it('should NOT reuse stale RUNNING job (updatedAt old)', () => {
          const mockStore = new MockJobStore();
          const service = new SearchDeduplicationService(mockStore);

          const now = Date.now();
          const staleJob = createJob('RUNNING', {
            createdAt: now - 200000,
            updatedAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 10000) // Stale by updatedAt
          });

          const result = service.shouldReuse(staleJob, now);

          assert.strictEqual(result.eligible, false, 'Should NOT reuse stale RUNNING');
          assert.ok(result.reason.includes('STALE_RUNNING_NO_HEARTBEAT'), 'Should indicate no heartbeat');
          assert.ok(result.details, 'Should have staleness details');
          assert.strictEqual(result.details!.isStaleByUpdatedAt, true);
        });

        it('should NOT reuse stale RUNNING job (createdAt too old)', () => {
          const mockStore = new MockJobStore();
          const service = new SearchDeduplicationService(mockStore);

          const now = Date.now();
          const staleJob = createJob('RUNNING', {
            createdAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 10000), // Stale by age
            updatedAt: now - 5000 // Updated recently, but created too long ago
          });

          const result = service.shouldReuse(staleJob, now);

          assert.strictEqual(result.eligible, false, 'Should NOT reuse old RUNNING');
          assert.ok(result.reason.includes('STALE_RUNNING_TOO_OLD'), 'Should indicate too old');
          assert.ok(result.details, 'Should have staleness details');
          assert.strictEqual(result.details!.isStaleByAge, true);
        });

        it('should detect staleness at exact threshold', () => {
          const mockStore = new MockJobStore();
          const service = new SearchDeduplicationService(mockStore);

          const now = Date.now();
          const thresholdJob = createJob('RUNNING', {
            createdAt: now - DEDUP_RUNNING_MAX_AGE_MS - 1, // Exactly 1ms over
            updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS - 1
          });

          const result = service.shouldReuse(thresholdJob, now);

          assert.strictEqual(result.eligible, false, 'Should be stale at threshold');
        });
      });
    });

    describe('Other Statuses → REUSE', () => {
      it('should reuse PENDING job', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('PENDING');
        const result = service.shouldReuse(job);

        assert.strictEqual(result.eligible, true, 'Should reuse PENDING');
        assert.strictEqual(result.reason, 'STATUS_PENDING');
      });

      it('should reuse DONE_CLARIFY job', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_CLARIFY');
        const result = service.shouldReuse(job);

        assert.strictEqual(result.eligible, true, 'Should reuse DONE_CLARIFY');
        assert.strictEqual(result.reason, 'STATUS_DONE_CLARIFY');
      });

      it('should reuse DONE_STOPPED job', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_STOPPED');
        const result = service.shouldReuse(job);

        assert.strictEqual(result.eligible, true, 'Should reuse DONE_STOPPED');
        assert.strictEqual(result.reason, 'STATUS_DONE_STOPPED');
      });

      it('should reuse other statuses regardless of age', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const oldPending = createJob('PENDING', {
          createdAt: now - 1000000,
          updatedAt: now - 1000000
        });

        const result = service.shouldReuse(oldPending, now);

        assert.strictEqual(result.eligible, true, 'Should reuse old PENDING');
      });
    });
  });

  describe('decideReuse - Full Decision Flow', () => {
    it('should handle null candidate (no job found)', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const decision = service.decideReuse(null);

      assert.strictEqual(decision.shouldReuse, false);
      assert.strictEqual(decision.reason, 'NO_CANDIDATE');
      assert.strictEqual(decision.existingJob, null);
    });

    it('should include age metrics in decision', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_SUCCESS', {
        createdAt: now - 10000,
        updatedAt: now - 5000
      });

      const decision = service.decideReuse(job, now);

      assert.strictEqual(decision.ageMs, 10000);
      assert.strictEqual(decision.updatedAgeMs, 5000);
    });

    it('should return existing job only when reusing', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const successJob = createJob('DONE_SUCCESS');
      const failedJob = createJob('DONE_FAILED');

      const successDecision = service.decideReuse(successJob);
      const failedDecision = service.decideReuse(failedJob);

      assert.strictEqual(successDecision.existingJob, successJob, 'Should return job when reusing');
      assert.strictEqual(failedDecision.existingJob, null, 'Should NOT return job when not reusing');
    });
  });

  describe('findCandidate', () => {
    it('should find candidate by idempotency key', async () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const job = createJob('DONE_SUCCESS', { idempotencyKey: 'test-key' });
      mockStore.setMockJob(job);

      const candidate = await service.findCandidate('test-key');

      assert.strictEqual(candidate, job);
    });

    it('should return null when no candidate found', async () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const candidate = await service.findCandidate('non-existent-key');

      assert.strictEqual(candidate, null);
    });

    it('should handle store errors gracefully', async () => {
      // Mock store that throws
      class ErrorStore extends MockJobStore {
        async findByIdempotencyKey(): Promise<SearchJob | null> {
          throw new Error('Store error');
        }
      }

      const errorStore = new ErrorStore();
      const service = new SearchDeduplicationService(errorStore);

      const candidate = await service.findCandidate('test-key');

      assert.strictEqual(candidate, null, 'Should return null on error');
    });
  });

  describe('Utility Methods', () => {
    describe('isStale', () => {
      it('should detect stale RUNNING job', () => {
        const now = Date.now();
        const staleJob = createJob('RUNNING', {
          createdAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 10000),
          updatedAt: now - (DEDUP_RUNNING_MAX_AGE_MS + 10000)
        });

        const isStale = SearchDeduplicationService.isStale(staleJob, now);

        assert.strictEqual(isStale, true);
      });

      it('should NOT mark fresh RUNNING job as stale', () => {
        const now = Date.now();
        const freshJob = createJob('RUNNING', {
          createdAt: now - 10000,
          updatedAt: now - 5000
        });

        const isStale = SearchDeduplicationService.isStale(freshJob, now);

        assert.strictEqual(isStale, false);
      });

      it('should NOT mark non-RUNNING jobs as stale', () => {
        const now = Date.now();
        const successJob = createJob('DONE_SUCCESS', {
          createdAt: now - 1000000,
          updatedAt: now - 1000000
        });

        const isStale = SearchDeduplicationService.isStale(successJob, now);

        assert.strictEqual(isStale, false, 'Non-RUNNING jobs are never stale');
      });
    });

    describe('summarize', () => {
      it('should summarize REUSE decision', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_SUCCESS');
        const decision = service.decideReuse(job);
        const summary = SearchDeduplicationService.summarize(decision);

        assert.ok(summary.includes('REUSE'), 'Should include REUSE');
        assert.ok(summary.includes('CACHED_RESULT_AVAILABLE'), 'Should include reason');
      });

      it('should summarize NEW_JOB decision', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const job = createJob('DONE_FAILED');
        const decision = service.decideReuse(job);
        const summary = SearchDeduplicationService.summarize(decision);

        assert.ok(summary.includes('NEW_JOB'), 'Should include NEW_JOB');
        assert.ok(summary.includes('PREVIOUS_JOB_FAILED'), 'Should include reason');
      });

      it('should include age metrics when available', () => {
        const mockStore = new MockJobStore();
        const service = new SearchDeduplicationService(mockStore);

        const now = Date.now();
        const job = createJob('DONE_SUCCESS', {
          createdAt: now - 10000,
          updatedAt: now - 5000
        });

        const decision = service.decideReuse(job, now);
        const summary = SearchDeduplicationService.summarize(decision);

        assert.ok(summary.includes('ageMs: 10000'), 'Should include ageMs');
        assert.ok(summary.includes('updatedAgeMs: 5000'), 'Should include updatedAgeMs');
      });
    });

    describe('getConfig', () => {
      it('should return deduplication configuration', () => {
        const config = SearchDeduplicationService.getConfig();

        assert.ok(config.runningMaxAgeMs > 0);
        assert.ok(config.successFreshWindowMs > 0);
        assert.strictEqual(config.runningMaxAgeMs, DEDUP_RUNNING_MAX_AGE_MS);
        assert.strictEqual(config.successFreshWindowMs, DEDUP_SUCCESS_FRESH_WINDOW_MS);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle job with missing timestamps', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('DONE_SUCCESS', {
        createdAt: 0,
        updatedAt: 0
      });

      const result = service.shouldReuse(job, now);

      assert.strictEqual(result.eligible, true, 'Should still apply decision matrix');
    });

    it('should handle negative timestamps (clock skew)', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const job = createJob('RUNNING', {
        createdAt: now + 10000, // Future timestamp (clock skew)
        updatedAt: now + 10000
      });

      const result = service.shouldReuse(job, now);

      // With negative age, staleness checks will fail (not > maxAge)
      // So job will be considered fresh
      assert.strictEqual(result.eligible, true, 'Should handle clock skew gracefully');
    });

    it('should handle exactly at staleness threshold', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const now = Date.now();
      const thresholdJob = createJob('RUNNING', {
        createdAt: now - DEDUP_RUNNING_MAX_AGE_MS,
        updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS
      });

      const result = service.shouldReuse(thresholdJob, now);

      // At exactly threshold (not > threshold), should still be fresh
      assert.strictEqual(result.eligible, true, 'At threshold should be fresh');

      // One ms over threshold
      const overThresholdJob = createJob('RUNNING', {
        createdAt: now - DEDUP_RUNNING_MAX_AGE_MS - 1,
        updatedAt: now - DEDUP_RUNNING_MAX_AGE_MS - 1
      });

      const overResult = service.shouldReuse(overThresholdJob, now);

      assert.strictEqual(overResult.eligible, false, 'Over threshold should be stale');
    });
  });

  describe('No Mutation Guarantee', () => {
    it('should not mutate input job', () => {
      const mockStore = new MockJobStore();
      const service = new SearchDeduplicationService(mockStore);

      const job = createJob('RUNNING', {
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 5000
      });

      const originalCopy = JSON.parse(JSON.stringify(job));

      service.shouldReuse(job);
      service.decideReuse(job);

      // Job should be unchanged
      assert.deepStrictEqual(job, originalCopy, 'Input job should not be mutated');
    });
  });
});
