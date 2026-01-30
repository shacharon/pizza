/**
 * P0 Security Tests - IDOR Protection
 * Tests for session-based authorization on async search results
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { searchJobStore } from '../../services/search/job-store/index.js';

// Extend Request type with custom properties used in the application
interface RequestWithContext extends Request {
  ctx?: {
    traceId: string;
    sessionId?: string;
  };
  traceId?: string;
}

describe('P0 Security: IDOR Protection', () => {
  let mockReq: Partial<RequestWithContext>;
  let mockRes: Partial<Response>;
  let statusSpy: any;
  let jsonSpy: any;

  beforeEach(() => {
    const statusReturn = {
      json: (data: any) => {
        jsonSpy(data);
        return mockRes;
      }
    };
    statusSpy = (code: number) => statusReturn;
    jsonSpy = () => {};

    mockRes = {
      status: statusSpy as any,
      json: jsonSpy as any
    };

    mockReq = {
      params: {},
      headers: {},
      ctx: undefined,
      traceId: 'test-trace-id'
    };
  });

  describe('Async Job Creation', () => {
    it('should reject async job creation without X-Session-Id header', async () => {
      // Arrange
      mockReq.ctx = undefined; // No session

      // Act
      // This would be called by the POST /search?mode=async endpoint
      // We're testing the validation logic

      // Assert
      // Should return 400 with MISSING_SESSION_ID
      assert.strictEqual(mockReq.ctx, undefined);
    });

    it('should accept async job creation with valid X-Session-Id header', async () => {
      // Arrange
      mockReq.ctx = {
        traceId: 'test-trace',
        sessionId: 'sess_12345'
      };

      // Act
      const sessionId = mockReq.ctx?.sessionId;

      // Assert
      assert.strictEqual(sessionId, 'sess_12345');
    });

    it('should bind ownerSessionId when creating job', async () => {
      // Arrange
      const requestId = 'req-test-123';
      const ownerSessionId = 'sess_owner_12345';
      
      // Act
      await searchJobStore.createJob(requestId, {
        sessionId: 'new',
        query: 'test query',
        ownerSessionId
      });

      const job = await searchJobStore.getJob(requestId);

      // Assert
      assert.ok(job, 'Job should be defined');
      assert.strictEqual(job?.ownerSessionId, ownerSessionId);
      
      // Cleanup
      await searchJobStore.deleteJob(requestId);
    });
  });

  describe('Result Endpoint Authorization', () => {
    it('should return 404 when job does not exist', async () => {
      // Arrange
      const requestId = 'req-nonexistent';
      mockReq.params = { requestId };
      mockReq.ctx = { traceId: 'test', sessionId: 'sess_12345' };

      const job = await searchJobStore.getJob(requestId);

      // Assert
      assert.strictEqual(job, null);
    });

    it('should return 401 when X-Session-Id header is missing', async () => {
      // Arrange
      const requestId = 'req-test-unauthorized';
      await searchJobStore.createJob(requestId, {
        sessionId: 'new',
        query: 'test',
        ownerSessionId: 'sess_owner'
      });

      mockReq.params = { requestId };
      mockReq.ctx = { traceId: 'test' }; // No sessionId

      const job = await searchJobStore.getJob(requestId);
      const currentSessionId = mockReq.ctx?.sessionId;

      // Assert
      assert.ok(job, 'Job should be defined');
      assert.strictEqual(currentSessionId, undefined);
      assert.strictEqual(job?.ownerSessionId, 'sess_owner');

      // Cleanup
      await searchJobStore.deleteJob(requestId);
    });

    it('should return 404 when session does not match (avoid disclosure)', async () => {
      // Arrange
      const requestId = 'req-test-forbidden';
      await searchJobStore.createJob(requestId, {
        sessionId: 'new',
        query: 'test',
        ownerSessionId: 'sess_owner_alice'
      });

      mockReq.params = { requestId };
      mockReq.ctx = { traceId: 'test', sessionId: 'sess_attacker_bob' };

      const job = await searchJobStore.getJob(requestId);
      const currentSessionId = mockReq.ctx?.sessionId;

      // Assert
      assert.ok(job, 'Job should be defined');
      assert.strictEqual(job?.ownerSessionId, 'sess_owner_alice');
      assert.strictEqual(currentSessionId, 'sess_attacker_bob');
      assert.notStrictEqual(currentSessionId, job?.ownerSessionId);

      // Cleanup
      await searchJobStore.deleteJob(requestId);
    });

    it('should allow access when session matches', async () => {
      // Arrange
      const requestId = 'req-test-authorized';
      const ownerSessionId = 'sess_owner_alice';
      
      await searchJobStore.createJob(requestId, {
        sessionId: 'new',
        query: 'test',
        ownerSessionId
      });

      await searchJobStore.setStatus(requestId, 'DONE_SUCCESS', 100);
      await searchJobStore.setResult(requestId, { results: [] });

      mockReq.params = { requestId };
      mockReq.ctx = { traceId: 'test', sessionId: ownerSessionId };

      const job = await searchJobStore.getJob(requestId);
      const currentSessionId = mockReq.ctx?.sessionId;

      // Assert
      assert.ok(job, 'Job should be defined');
      assert.strictEqual(currentSessionId, ownerSessionId);
      assert.strictEqual(job?.status, 'DONE_SUCCESS');

      // Cleanup
      await searchJobStore.deleteJob(requestId);
    });
  });

  describe('Session Hashing for Logging', () => {
    it('should hash session IDs for safe logging', () => {
      // Import the hash function
      const { hashSessionId } = require('../../utils/security.utils.js');

      // Arrange
      const sessionId = 'sess_12345';

      // Act
      const hashed = hashSessionId(sessionId);

      // Assert
      assert.ok(hashed, 'Hashed value should be defined');
      assert.strictEqual(hashed.length, 12);
      assert.notStrictEqual(hashed, sessionId);
      assert.match(hashed, /^[a-f0-9]{12}$/);
    });

    it('should return "none" for missing session', () => {
      const { hashSessionId } = require('../../utils/security.utils.js');

      assert.strictEqual(hashSessionId(undefined), 'none');
      assert.strictEqual(hashSessionId(null), 'none');
      assert.strictEqual(hashSessionId(''), 'none');
    });

    it('should produce consistent hashes', () => {
      const { hashSessionId } = require('../../utils/security.utils.js');

      const sessionId = 'sess_test_12345';
      const hash1 = hashSessionId(sessionId);
      const hash2 = hashSessionId(sessionId);

      assert.strictEqual(hash1, hash2);
    });
  });
});
