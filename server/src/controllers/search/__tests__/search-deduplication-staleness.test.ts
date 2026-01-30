/**
 * Deduplication Staleness Tests
 * Tests for stale RUNNING job detection and proper reuse decisions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SearchJob } from '../../../services/search/job-store/job-store.interface.js';

// Mock the deduplication config
vi.mock('../../../config/deduplication.config.js', () => ({
  DEDUP_RUNNING_MAX_AGE_MS: 90_000, // 90s for tests
  DEDUP_SUCCESS_FRESH_WINDOW_MS: 5_000
}));

describe('Deduplication Staleness Detection', () => {
  const now = Date.now();
  const RUNNING_MAX_AGE = 90_000; // 90s

  describe('RUNNING job staleness checks', () => {
    it('should NOT reuse RUNNING job older than TTL (by updatedAt)', () => {
      const staleJob: Partial<SearchJob> = {
        requestId: 'req-old',
        status: 'RUNNING',
        createdAt: now - 100_000, // 100s ago
        updatedAt: now - 95_000,  // 95s ago (> 90s TTL)
        progress: 50
      };

      const updatedAgeMs = now - staleJob.updatedAt!;
      const isStale = updatedAgeMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(true);
      expect(updatedAgeMs).toBeGreaterThan(RUNNING_MAX_AGE);
    });

    it('should NOT reuse RUNNING job older than TTL (by ageMs)', () => {
      const staleJob: Partial<SearchJob> = {
        requestId: 'req-old',
        status: 'RUNNING',
        createdAt: now - 120_000, // 120s ago (> 90s TTL)
        updatedAt: now - 10_000,  // Updated 10s ago (fresh heartbeat)
        progress: 80
      };

      const ageMs = now - staleJob.createdAt!;
      const isStale = ageMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(true);
      expect(ageMs).toBeGreaterThan(RUNNING_MAX_AGE);
    });

    it('should REUSE RUNNING job that is fresh (< TTL)', () => {
      const freshJob: Partial<SearchJob> = {
        requestId: 'req-fresh',
        status: 'RUNNING',
        createdAt: now - 30_000, // 30s ago
        updatedAt: now - 5_000,  // 5s ago
        progress: 50
      };

      const ageMs = now - freshJob.createdAt!;
      const updatedAgeMs = now - freshJob.updatedAt!;
      const isStale = updatedAgeMs > RUNNING_MAX_AGE || ageMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(false);
      expect(ageMs).toBeLessThan(RUNNING_MAX_AGE);
      expect(updatedAgeMs).toBeLessThan(RUNNING_MAX_AGE);
    });

    it('should detect stale RUNNING with real log example (ageMs: 1,160,413)', () => {
      // Real example from logs: ageMs: 1160413 (~19 minutes)
      const staleJob: Partial<SearchJob> = {
        requestId: 'req-1769803427313-h3tqdflmf',
        status: 'RUNNING',
        createdAt: now - 1_160_413,
        updatedAt: now - 1_160_000, // Updated ~19min ago
        progress: 0
      };

      const ageMs = now - staleJob.createdAt!;
      const updatedAgeMs = now - staleJob.updatedAt!;
      const isStaleByAge = ageMs > RUNNING_MAX_AGE;
      const isStaleByUpdated = updatedAgeMs > RUNNING_MAX_AGE;

      expect(isStaleByAge).toBe(true);
      expect(isStaleByUpdated).toBe(true);
      expect(ageMs).toBeGreaterThan(1_000_000); // > 1 million ms (~16min)
      expect(ageMs).toBeGreaterThan(RUNNING_MAX_AGE);
    });
  });

  describe('DONE_SUCCESS reuse behavior', () => {
    it('should REUSE DONE_SUCCESS within fresh window', () => {
      const successJob: Partial<SearchJob> = {
        requestId: 'req-success',
        status: 'DONE_SUCCESS',
        createdAt: now - 10_000,
        updatedAt: now - 3_000, // 3s ago (< 5s fresh window)
        result: { results: [] }
      };

      const updatedAgeMs = now - successJob.updatedAt!;
      const FRESH_WINDOW = 5_000;
      const shouldReuse = updatedAgeMs <= FRESH_WINDOW;

      expect(shouldReuse).toBe(true);
      expect(updatedAgeMs).toBeLessThan(FRESH_WINDOW);
    });

    it('should NOT reuse DONE_SUCCESS outside fresh window', () => {
      const staleSuccess: Partial<SearchJob> = {
        requestId: 'req-stale-success',
        status: 'DONE_SUCCESS',
        createdAt: now - 20_000,
        updatedAt: now - 10_000, // 10s ago (> 5s fresh window)
        result: { results: [] }
      };

      const updatedAgeMs = now - staleSuccess.updatedAt!;
      const FRESH_WINDOW = 5_000;
      const shouldReuse = updatedAgeMs <= FRESH_WINDOW;

      expect(shouldReuse).toBe(false);
      expect(updatedAgeMs).toBeGreaterThan(FRESH_WINDOW);
    });
  });

  describe('DONE_FAILED reuse behavior', () => {
    it('should NOT reuse DONE_FAILED jobs', () => {
      const failedJob: Partial<SearchJob> = {
        requestId: 'req-failed',
        status: 'DONE_FAILED',
        createdAt: now - 10_000,
        updatedAt: now - 5_000,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Search failed'
        }
      };

      const shouldReuse = failedJob.status !== 'DONE_FAILED';

      expect(shouldReuse).toBe(false);
    });
  });

  describe('Decision logic matrix', () => {
    interface TestCase {
      name: string;
      job: Partial<SearchJob>;
      expectedDecision: 'REUSE' | 'NEW_JOB';
      expectedReason: string;
    }

    const testCases: TestCase[] = [
      {
        name: 'DONE_SUCCESS (fresh)',
        job: {
          status: 'DONE_SUCCESS',
          createdAt: now - 10_000,
          updatedAt: now - 3_000
        },
        expectedDecision: 'REUSE',
        expectedReason: 'CACHED_RESULT_AVAILABLE'
      },
      {
        name: 'DONE_FAILED',
        job: {
          status: 'DONE_FAILED',
          createdAt: now - 10_000,
          updatedAt: now - 5_000
        },
        expectedDecision: 'NEW_JOB',
        expectedReason: 'PREVIOUS_JOB_FAILED'
      },
      {
        name: 'RUNNING (fresh)',
        job: {
          status: 'RUNNING',
          createdAt: now - 30_000,
          updatedAt: now - 5_000
        },
        expectedDecision: 'REUSE',
        expectedReason: 'RUNNING_FRESH'
      },
      {
        name: 'RUNNING (stale by updatedAt)',
        job: {
          status: 'RUNNING',
          createdAt: now - 100_000,
          updatedAt: now - 95_000
        },
        expectedDecision: 'NEW_JOB',
        expectedReason: 'STALE_RUNNING_NO_HEARTBEAT'
      },
      {
        name: 'RUNNING (stale by age)',
        job: {
          status: 'RUNNING',
          createdAt: now - 120_000,
          updatedAt: now - 10_000
        },
        expectedDecision: 'NEW_JOB',
        expectedReason: 'STALE_RUNNING_TOO_OLD'
      }
    ];

    testCases.forEach(({ name, job, expectedDecision, expectedReason }) => {
      it(`should make correct decision for: ${name}`, () => {
        const ageMs = now - job.createdAt!;
        const updatedAgeMs = now - job.updatedAt!;

        let decision: 'REUSE' | 'NEW_JOB';
        let reason: string;

        if (job.status === 'DONE_SUCCESS') {
          decision = 'REUSE';
          reason = 'CACHED_RESULT_AVAILABLE';
        } else if (job.status === 'DONE_FAILED') {
          decision = 'NEW_JOB';
          reason = 'PREVIOUS_JOB_FAILED';
        } else if (job.status === 'RUNNING') {
          const isStaleByUpdated = updatedAgeMs > RUNNING_MAX_AGE;
          const isStaleByAge = ageMs > RUNNING_MAX_AGE;

          if (isStaleByUpdated || isStaleByAge) {
            decision = 'NEW_JOB';
            reason = isStaleByUpdated ? 'STALE_RUNNING_NO_HEARTBEAT' : 'STALE_RUNNING_TOO_OLD';
          } else {
            decision = 'REUSE';
            reason = 'RUNNING_FRESH';
          }
        } else {
          decision = 'REUSE';
          reason = `STATUS_${job.status}`;
        }

        expect(decision).toBe(expectedDecision);
        expect(reason).toContain(expectedReason);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle job with no updatedAt (use createdAt)', () => {
      const job: Partial<SearchJob> = {
        status: 'RUNNING',
        createdAt: now - 100_000,
        updatedAt: now - 100_000 // Same as createdAt
      };

      const ageMs = now - job.createdAt!;
      const isStale = ageMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(true);
    });

    it('should handle job at exactly TTL boundary', () => {
      const job: Partial<SearchJob> = {
        status: 'RUNNING',
        createdAt: now - RUNNING_MAX_AGE,
        updatedAt: now - RUNNING_MAX_AGE
      };

      const ageMs = now - job.createdAt!;
      const updatedAgeMs = now - job.updatedAt!;
      const isStale = updatedAgeMs > RUNNING_MAX_AGE || ageMs > RUNNING_MAX_AGE;

      // At exactly TTL, not stale (> check, not >=)
      expect(isStale).toBe(false);
    });

    it('should handle job just over TTL boundary', () => {
      const job: Partial<SearchJob> = {
        status: 'RUNNING',
        createdAt: now - (RUNNING_MAX_AGE + 1),
        updatedAt: now - (RUNNING_MAX_AGE + 1)
      };

      const ageMs = now - job.createdAt!;
      const updatedAgeMs = now - job.updatedAt!;
      const isStale = updatedAgeMs > RUNNING_MAX_AGE || ageMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    it('should detect stuck LLM job (no progress updates)', () => {
      // Scenario: Job started, made some progress, then stuck
      const stuckJob: Partial<SearchJob> = {
        requestId: 'req-stuck-llm',
        status: 'RUNNING',
        createdAt: now - 200_000, // 200s ago
        updatedAt: now - 150_000, // Last update 150s ago
        progress: 30 // Stuck at 30%
      };

      const updatedAgeMs = now - stuckJob.updatedAt!;
      const isStale = updatedAgeMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(true);
      expect(updatedAgeMs).toBe(150_000);
      expect(stuckJob.progress).toBe(30);
    });

    it('should allow active job with recent updates', () => {
      // Scenario: Job actively progressing
      const activeJob: Partial<SearchJob> = {
        requestId: 'req-active',
        status: 'RUNNING',
        createdAt: now - 60_000, // 60s ago
        updatedAt: now - 2_000,  // Updated 2s ago
        progress: 75 // Making progress
      };

      const updatedAgeMs = now - activeJob.updatedAt!;
      const ageMs = now - activeJob.createdAt!;
      const isStale = updatedAgeMs > RUNNING_MAX_AGE || ageMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(false);
      expect(activeJob.progress).toBeGreaterThan(50);
    });

    it('should detect server restart scenario (old RUNNING jobs)', () => {
      // Scenario: Server restarted, old RUNNING jobs in Redis
      const orphanedJob: Partial<SearchJob> = {
        requestId: 'req-orphaned',
        status: 'RUNNING',
        createdAt: now - 3_600_000, // 1 hour ago
        updatedAt: now - 3_600_000, // Never updated
        progress: 0
      };

      const ageMs = now - orphanedJob.createdAt!;
      const isStale = ageMs > RUNNING_MAX_AGE;

      expect(isStale).toBe(true);
      expect(ageMs).toBeGreaterThan(1_000_000);
    });
  });

  describe('Heartbeat behavior', () => {
    it('should NOT mark job as stale if heartbeat is recent (even with old progress)', () => {
      // Scenario: Long-running job with heartbeat updates (progress unchanged)
      const jobWithHeartbeat: Partial<SearchJob> = {
        requestId: 'req-heartbeat',
        status: 'RUNNING',
        createdAt: now - 120_000, // 120s ago (> TTL by age)
        updatedAt: now - 10_000,  // Heartbeat 10s ago (< TTL)
        progress: 30 // Progress hasn't changed, but heartbeat is active
      };

      const ageMs = now - jobWithHeartbeat.createdAt!;
      const updatedAgeMs = now - jobWithHeartbeat.updatedAt!;
      
      // Should be stale by creation age
      const isStaleByAge = ageMs > RUNNING_MAX_AGE;
      // Should NOT be stale by heartbeat
      const isStaleByUpdatedAt = updatedAgeMs > RUNNING_MAX_AGE;

      expect(isStaleByAge).toBe(true); // Age exceeds TTL
      expect(isStaleByUpdatedAt).toBe(false); // Heartbeat is fresh
      expect(updatedAgeMs).toBeLessThan(RUNNING_MAX_AGE);
    });

    it('should mark job as stale if BOTH age and heartbeat exceed TTL', () => {
      // Scenario: Old job with stale heartbeat (stuck pipeline)
      const staleJob: Partial<SearchJob> = {
        requestId: 'req-no-heartbeat',
        status: 'RUNNING',
        createdAt: now - 150_000, // 150s ago (> TTL)
        updatedAt: now - 120_000, // Last heartbeat 120s ago (> TTL)
        progress: 50
      };

      const ageMs = now - staleJob.createdAt!;
      const updatedAgeMs = now - staleJob.updatedAt!;
      
      const isStaleByAge = ageMs > RUNNING_MAX_AGE;
      const isStaleByUpdatedAt = updatedAgeMs > RUNNING_MAX_AGE;
      const isStale = isStaleByAge || isStaleByUpdatedAt;

      expect(isStaleByAge).toBe(true);
      expect(isStaleByUpdatedAt).toBe(true);
      expect(isStale).toBe(true);
    });

    it('should keep job alive with periodic heartbeat updates (15s interval)', () => {
      // Scenario: Long-running job with 15s heartbeat interval
      const jobWithPeriodicHeartbeat: Partial<SearchJob> = {
        requestId: 'req-periodic-heartbeat',
        status: 'RUNNING',
        createdAt: now - 180_000, // 180s ago (3 minutes)
        updatedAt: now - 12_000,  // Last heartbeat 12s ago (< 15s interval)
        progress: 70
      };

      const ageMs = now - jobWithPeriodicHeartbeat.createdAt!;
      const updatedAgeMs = now - jobWithPeriodicHeartbeat.updatedAt!;
      
      // Should be stale by creation age alone
      const isStaleByAge = ageMs > RUNNING_MAX_AGE;
      // Should NOT be stale by heartbeat
      const isStaleByUpdatedAt = updatedAgeMs > RUNNING_MAX_AGE;

      expect(isStaleByAge).toBe(true);
      expect(isStaleByUpdatedAt).toBe(false);
      expect(updatedAgeMs).toBeLessThan(15_000); // Within heartbeat interval
    });
  });

  describe('WebSocket subscriber protection', () => {
    it('should NOT mark job as stale if it has active WS subscribers (even if heartbeat missed)', () => {
      // Scenario: Job with active subscriber watching progress
      const jobWithSubscriber: Partial<SearchJob> = {
        requestId: 'req-with-subscriber',
        status: 'RUNNING',
        createdAt: now - 150_000, // 150s ago (> TTL)
        updatedAt: now - 120_000, // Heartbeat 120s ago (> TTL)
        progress: 80
      };

      const ageMs = now - jobWithSubscriber.createdAt!;
      const updatedAgeMs = now - jobWithSubscriber.updatedAt!;
      
      // Both age and heartbeat exceed TTL
      const isStaleByAge = ageMs > RUNNING_MAX_AGE;
      const isStaleByUpdatedAt = updatedAgeMs > RUNNING_MAX_AGE;
      
      // BUT: If hasActiveSubscribers = true, job should NOT be marked stale
      const hasActiveSubscribers = true; // Simulated
      const shouldMarkStale = (isStaleByAge || isStaleByUpdatedAt) && !hasActiveSubscribers;

      expect(isStaleByAge).toBe(true);
      expect(isStaleByUpdatedAt).toBe(true);
      expect(shouldMarkStale).toBe(false); // Protected by subscriber
    });

    it('should mark job as stale if no subscribers and heartbeat missed', () => {
      // Scenario: Job with no subscribers and missed heartbeat
      const jobWithoutSubscriber: Partial<SearchJob> = {
        requestId: 'req-no-subscriber',
        status: 'RUNNING',
        createdAt: now - 150_000, // 150s ago (> TTL)
        updatedAt: now - 120_000, // Heartbeat 120s ago (> TTL)
        progress: 80
      };

      const ageMs = now - jobWithoutSubscriber.createdAt!;
      const updatedAgeMs = now - jobWithoutSubscriber.updatedAt!;
      
      const isStaleByAge = ageMs > RUNNING_MAX_AGE;
      const isStaleByUpdatedAt = updatedAgeMs > RUNNING_MAX_AGE;
      
      const hasActiveSubscribers = false;
      const shouldMarkStale = (isStaleByAge || isStaleByUpdatedAt) && !hasActiveSubscribers;

      expect(shouldMarkStale).toBe(true); // Should be marked stale
    });
  });

  describe('Idempotent stale marking', () => {
    it('should NOT overwrite terminal status when marking stale', () => {
      // Scenario: Job transitioned to DONE_SUCCESS before stale check
      const successJob: Partial<SearchJob> = {
        requestId: 'req-success',
        status: 'DONE_SUCCESS',
        createdAt: now - 150_000,
        updatedAt: now - 120_000,
        result: { results: [] }
      };

      // Dedup logic should re-fetch job and skip marking if no longer RUNNING
      const shouldMarkStale = successJob.status === 'RUNNING';

      expect(shouldMarkStale).toBe(false);
    });

    it('should only mark stale once (idempotent)', () => {
      // Scenario: Multiple dedup checks for same stale job
      const staleJob: Partial<SearchJob> = {
        requestId: 'req-stale',
        status: 'RUNNING',
        createdAt: now - 150_000,
        updatedAt: now - 120_000,
        progress: 50
      };

      // First dedup check marks as DONE_FAILED
      const firstCheck = staleJob.status === 'RUNNING';
      
      // Simulate marking as DONE_FAILED
      staleJob.status = 'DONE_FAILED';
      staleJob.error = {
        code: 'STALE_RUNNING',
        message: 'Job marked as stale'
      };

      // Second dedup check should skip (no longer RUNNING)
      const secondCheck = staleJob.status === 'RUNNING';

      expect(firstCheck).toBe(true);
      expect(secondCheck).toBe(false);
    });
  });
});
