/**
 * Job Store Heartbeat Tests
 * Tests for updateHeartbeat() method and heartbeat behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySearchJobStore } from '../inmemory-search-job.store.js';
import type { SearchJob } from '../job-store.interface.js';

describe('Job Store Heartbeat', () => {
  let store: InMemorySearchJobStore;
  const requestId = 'req-test-heartbeat';

  beforeEach(() => {
    store = new InMemorySearchJobStore();
  });

  describe('updateHeartbeat()', () => {
    it('should update updatedAt for RUNNING job without changing status or progress', async () => {
      // Create a RUNNING job
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query',
        ownerUserId: 'user-1',
        ownerSessionId: 'session-123'
      });

      // Set to RUNNING with progress
      store.setStatus(requestId, 'RUNNING', 30);
      
      const jobBefore = store.getJob(requestId);
      const updatedAtBefore = jobBefore?.updatedAt;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update heartbeat
      store.updateHeartbeat(requestId);

      const jobAfter = store.getJob(requestId);

      // Verify: updatedAt changed, status and progress unchanged
      expect(jobAfter?.status).toBe('RUNNING');
      expect(jobAfter?.progress).toBe(30);
      expect(jobAfter?.updatedAt).toBeGreaterThan(updatedAtBefore!);
    });

    it('should NOT update heartbeat for non-RUNNING jobs', async () => {
      // Create a DONE_SUCCESS job
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'DONE_SUCCESS', 100);
      
      const jobBefore = store.getJob(requestId);
      const updatedAtBefore = jobBefore?.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to update heartbeat (should be skipped)
      store.updateHeartbeat(requestId);

      const jobAfter = store.getJob(requestId);

      // Verify: updatedAt unchanged for terminal status
      expect(jobAfter?.status).toBe('DONE_SUCCESS');
      expect(jobAfter?.updatedAt).toBe(updatedAtBefore);
    });

    it('should handle heartbeat for non-existent job gracefully', () => {
      // Should not throw error
      expect(() => {
        store.updateHeartbeat('req-nonexistent');
      }).not.toThrow();
    });

    it('should NOT update heartbeat for PENDING job', async () => {
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      const jobBefore = store.getJob(requestId);
      const updatedAtBefore = jobBefore?.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      store.updateHeartbeat(requestId);

      const jobAfter = store.getJob(requestId);

      // Verify: updatedAt unchanged for PENDING status
      expect(jobAfter?.status).toBe('PENDING');
      expect(jobAfter?.updatedAt).toBe(updatedAtBefore);
    });

    it('should NOT update heartbeat for DONE_FAILED job', async () => {
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'RUNNING', 50);
      store.setError(requestId, 'ERROR', 'Test error', 'SEARCH_FAILED');
      
      const jobBefore = store.getJob(requestId);
      const updatedAtBefore = jobBefore?.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      store.updateHeartbeat(requestId);

      const jobAfter = store.getJob(requestId);

      // Verify: updatedAt unchanged for DONE_FAILED status
      expect(jobAfter?.status).toBe('DONE_FAILED');
      expect(jobAfter?.updatedAt).toBe(updatedAtBefore);
    });
  });

  describe('Heartbeat staleness detection', () => {
    it('should allow detection of stale job by comparing updatedAt', async () => {
      const RUNNING_MAX_AGE_MS = 90_000; // 90s

      // Create a job
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'RUNNING', 30);

      // Simulate job being stuck (no heartbeat updates)
      const job = store.getJob(requestId);
      const now = Date.now();
      const updatedAgeMs = now - job!.updatedAt;

      // Should be fresh initially
      expect(updatedAgeMs).toBeLessThan(RUNNING_MAX_AGE_MS);

      // Simulate 95s passing without heartbeat (manually adjust updatedAt for test)
      if (job) {
        job.updatedAt = now - 95_000;
      }

      const staleUpdatedAgeMs = now - job!.updatedAt;
      const isStale = staleUpdatedAgeMs > RUNNING_MAX_AGE_MS;

      expect(isStale).toBe(true);
      expect(staleUpdatedAgeMs).toBeGreaterThan(RUNNING_MAX_AGE_MS);
    });

    it('should prevent staleness with periodic heartbeat updates', async () => {
      const RUNNING_MAX_AGE_MS = 90_000; // 90s
      const HEARTBEAT_INTERVAL_MS = 15_000; // 15s

      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'RUNNING', 30);

      // Simulate periodic heartbeat updates
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        store.updateHeartbeat(requestId);
      }

      const job = store.getJob(requestId);
      const now = Date.now();
      const updatedAgeMs = now - job!.updatedAt;

      // Should still be fresh due to heartbeat
      expect(updatedAgeMs).toBeLessThan(HEARTBEAT_INTERVAL_MS);
      expect(updatedAgeMs).toBeLessThan(RUNNING_MAX_AGE_MS);
    });
  });

  describe('Heartbeat vs progress updates', () => {
    it('should differentiate heartbeat update from progress update', async () => {
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'RUNNING', 30);
      
      const job1 = store.getJob(requestId);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Heartbeat update (no progress change)
      store.updateHeartbeat(requestId);
      
      const job2 = store.getJob(requestId);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Progress update
      store.setStatus(requestId, 'RUNNING', 50);
      
      const job3 = store.getJob(requestId);

      // Verify timestamps increased for both updates
      expect(job2?.updatedAt).toBeGreaterThan(job1!.updatedAt);
      expect(job3?.updatedAt).toBeGreaterThan(job2!.updatedAt);

      // Verify progress only changed for progress update
      expect(job2?.progress).toBe(30); // Unchanged by heartbeat
      expect(job3?.progress).toBe(50); // Changed by setStatus
    });

    it('should update updatedAt without changing any other fields', async () => {
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query',
        ownerUserId: 'user-1',
        ownerSessionId: 'session-123'
      });

      store.setStatus(requestId, 'RUNNING', 75);
      store.setResult(requestId, { partial: 'result' });

      const jobBefore = store.getJob(requestId);
      await new Promise(resolve => setTimeout(resolve, 10));

      store.updateHeartbeat(requestId);

      const jobAfter = store.getJob(requestId);

      // Verify: Only updatedAt changed
      expect(jobAfter?.requestId).toBe(jobBefore?.requestId);
      expect(jobAfter?.sessionId).toBe(jobBefore?.sessionId);
      expect(jobAfter?.query).toBe(jobBefore?.query);
      expect(jobAfter?.status).toBe(jobBefore?.status);
      expect(jobAfter?.progress).toBe(jobBefore?.progress);
      expect(jobAfter?.result).toEqual(jobBefore?.result);
      expect(jobAfter?.ownerUserId).toBe(jobBefore?.ownerUserId);
      expect(jobAfter?.ownerSessionId).toBe(jobBefore?.ownerSessionId);
      expect(jobAfter?.createdAt).toBe(jobBefore?.createdAt);
      expect(jobAfter?.updatedAt).toBeGreaterThan(jobBefore!.updatedAt);
    });
  });

  describe('Multiple heartbeat updates', () => {
    it('should support multiple consecutive heartbeat updates', async () => {
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'RUNNING', 30);

      const timestamps: number[] = [];
      const job0 = store.getJob(requestId);
      timestamps.push(job0!.updatedAt);

      // Perform 5 heartbeat updates
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        store.updateHeartbeat(requestId);
        const job = store.getJob(requestId);
        timestamps.push(job!.updatedAt);
      }

      // Verify: Each timestamp is greater than the previous
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
      }

      // Verify: Status and progress unchanged
      const finalJob = store.getJob(requestId);
      expect(finalJob?.status).toBe('RUNNING');
      expect(finalJob?.progress).toBe(30);
    });

    it('should handle rapid heartbeat updates (stress test)', async () => {
      store.createJob(requestId, {
        sessionId: 'session-123',
        query: 'test query'
      });

      store.setStatus(requestId, 'RUNNING', 50);

      // Perform 50 rapid heartbeat updates
      for (let i = 0; i < 50; i++) {
        store.updateHeartbeat(requestId);
      }

      const job = store.getJob(requestId);

      // Verify: Job still valid and RUNNING
      expect(job).not.toBeNull();
      expect(job?.status).toBe('RUNNING');
      expect(job?.progress).toBe(50);
    });
  });
});
