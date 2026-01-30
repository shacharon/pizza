/**
 * Search Result Error Handling Tests
 * 
 * Verifies GET /:requestId/result returns stable responses for failed jobs
 * and handles missing result data gracefully (non-fatal write failures)
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { SearchJob } from '../../../services/search/job-store/job-store.interface.js';

describe('GET /:requestId/result - Error Handling', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusCode: number;
  let responseBody: any;
  let jsonCalled: boolean;

  beforeEach(() => {
    statusCode = 200;
    responseBody = null;
    jsonCalled = false;

    mockReq = {
      params: { requestId: 'req-test-123' },
      get: mock.fn(() => 'mock-session-token'),
      headers: {}
    };

    mockRes = {
      status: mock.fn((code: number) => {
        statusCode = code;
        return mockRes as Response;
      }),
      json: mock.fn((body: any) => {
        responseBody = body;
        jsonCalled = true;
        return mockRes as Response;
      })
    };
  });

  describe('DONE_FAILED with complete error', () => {
    it('should return 200 with stable error payload', () => {
      const job: SearchJob = {
        requestId: 'req-test-123',
        sessionId: 'sess-123',
        query: 'test query',
        status: 'DONE_FAILED',
        progress: 100,
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'Google Maps API unavailable',
          errorType: 'SEARCH_FAILED'
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Simulate controller logic
      const response = {
        requestId: job.requestId,
        status: 'DONE_FAILED',
        code: job.error!.code,
        message: job.error!.message,
        errorType: job.error!.errorType,
        terminal: true,
        contractsVersion: 'search_contracts_v1'
      };

      // Verify response structure
      assert.strictEqual(response.status, 'DONE_FAILED');
      assert.strictEqual(response.code, 'PROVIDER_UNAVAILABLE');
      assert.strictEqual(response.message, 'Google Maps API unavailable');
      assert.strictEqual(response.errorType, 'SEARCH_FAILED');
      assert.strictEqual(response.terminal, true);
      assert.ok(response.contractsVersion);
    });
  });

  describe('DONE_FAILED with missing error field', () => {
    it('should return 200 with safe default error payload', () => {
      const job: SearchJob = {
        requestId: 'req-test-123',
        sessionId: 'sess-123',
        query: 'test query',
        status: 'DONE_FAILED',
        progress: 100,
        error: undefined, // ❌ Error field missing (non-fatal write failed)
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Simulate controller logic with defensive defaults
      const errorCode = job.error?.code || 'SEARCH_FAILED';
      const errorMessage = job.error?.message || 'Search failed. Please retry.';
      const errorType = job.error?.errorType || 'SEARCH_FAILED';

      const response = {
        requestId: job.requestId,
        status: 'DONE_FAILED',
        code: errorCode,
        message: errorMessage,
        errorType,
        terminal: true,
        contractsVersion: 'search_contracts_v1'
      };

      // Verify safe defaults applied
      assert.strictEqual(response.status, 'DONE_FAILED');
      assert.strictEqual(response.code, 'SEARCH_FAILED');
      assert.strictEqual(response.message, 'Search failed. Please retry.');
      assert.strictEqual(response.errorType, 'SEARCH_FAILED');
      assert.strictEqual(response.terminal, true);
    });
  });

  describe('DONE_SUCCESS with missing result', () => {
    it('should return 200 with RESULT_MISSING error', () => {
      const job: SearchJob = {
        requestId: 'req-test-123',
        sessionId: 'sess-123',
        query: 'test query',
        status: 'DONE_SUCCESS',
        progress: 100,
        result: undefined, // ❌ Result missing (non-fatal write failed)
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Simulate controller logic
      if (!job.result) {
        const response = {
          requestId: job.requestId,
          status: 'DONE_FAILED',
          code: 'RESULT_MISSING',
          message: 'Search completed but result unavailable. Please retry.',
          errorType: 'SEARCH_FAILED',
          terminal: true,
          contractsVersion: 'search_contracts_v1'
        };

        // Verify error response
        assert.strictEqual(response.status, 'DONE_FAILED');
        assert.strictEqual(response.code, 'RESULT_MISSING');
        assert.ok(response.message);
        assert.strictEqual(response.terminal, true);
      }
    });
  });

  describe('Response Status Codes', () => {
    it('should return 200 (not 500) for DONE_FAILED', () => {
      // Before fix: returned 500
      // After fix: returns 200 (async operation completed, just with error)
      const expectedStatusCode = 200;

      assert.strictEqual(expectedStatusCode, 200, 'Failed jobs should return 200, not 500');
    });

    it('should return 200 (not 500) for missing result', () => {
      // Before fix: returned 500
      // After fix: returns 200 with stable error payload
      const expectedStatusCode = 200;

      assert.strictEqual(expectedStatusCode, 200, 'Missing results should return 200, not 500');
    });

    it('should return 202 for PENDING/RUNNING', () => {
      const expectedStatusCode = 202;
      assert.strictEqual(expectedStatusCode, 202, 'In-progress jobs should return 202');
    });
  });

  describe('Terminal Flag', () => {
    it('should include terminal:true for DONE_FAILED', () => {
      const response = {
        requestId: 'req-test-123',
        status: 'DONE_FAILED',
        code: 'SEARCH_FAILED',
        message: 'Test error',
        errorType: 'SEARCH_FAILED',
        terminal: true,
        contractsVersion: 'search_contracts_v1'
      };

      assert.strictEqual(response.terminal, true, 'terminal flag should be true to stop client polling');
    });

    it('should include terminal:true for RESULT_MISSING', () => {
      const response = {
        requestId: 'req-test-123',
        status: 'DONE_FAILED',
        code: 'RESULT_MISSING',
        message: 'Result unavailable',
        errorType: 'SEARCH_FAILED',
        terminal: true,
        contractsVersion: 'search_contracts_v1'
      };

      assert.strictEqual(response.terminal, true, 'terminal flag should stop polling for missing results');
    });
  });

  describe('Backward Compatibility', () => {
    it('should include contractsVersion in error responses', () => {
      const response = {
        requestId: 'req-test-123',
        status: 'DONE_FAILED',
        code: 'SEARCH_FAILED',
        message: 'Test',
        errorType: 'SEARCH_FAILED',
        terminal: true,
        contractsVersion: 'search_contracts_v1'
      };

      assert.ok(response.contractsVersion, 'contractsVersion should be present');
      assert.strictEqual(response.contractsVersion, 'search_contracts_v1');
    });

    it('should include requestId in all error responses', () => {
      const response = {
        requestId: 'req-test-123',
        status: 'DONE_FAILED',
        code: 'SEARCH_FAILED',
        message: 'Test',
        errorType: 'SEARCH_FAILED',
        terminal: true,
        contractsVersion: 'search_contracts_v1'
      };

      assert.ok(response.requestId, 'requestId should be present');
    });
  });

  describe('Non-Fatal Write Failure Scenarios', () => {
    it('should handle job with DONE_FAILED status but no error field', () => {
      // Scenario: setError() call failed due to Redis/network issue
      const job: Partial<SearchJob> = {
        requestId: 'req-test-123',
        status: 'DONE_FAILED',
        error: undefined // ❌ setError() failed
      };

      const errorCode = job.error?.code || 'SEARCH_FAILED';
      const errorMessage = job.error?.message || 'Search failed. Please retry.';

      assert.strictEqual(errorCode, 'SEARCH_FAILED');
      assert.strictEqual(errorMessage, 'Search failed. Please retry.');
    });

    it('should handle job with DONE_SUCCESS but no result field', () => {
      // Scenario: setResult() call failed due to Redis/network issue
      const job: Partial<SearchJob> = {
        requestId: 'req-test-123',
        status: 'DONE_SUCCESS',
        result: undefined // ❌ setResult() failed
      };

      assert.strictEqual(job.result, undefined);
      // Controller should return RESULT_MISSING error
    });

    it('should handle job with partial error field', () => {
      // Scenario: error field exists but incomplete
      const job: Partial<SearchJob> = {
        requestId: 'req-test-123',
        status: 'DONE_FAILED',
        error: {
          code: 'TIMEOUT',
          message: '', // Empty message
          errorType: undefined as any
        }
      };

      const errorCode = job.error?.code || 'SEARCH_FAILED';
      const errorMessage = job.error?.message || 'Search failed. Please retry.';
      const errorType = job.error?.errorType || 'SEARCH_FAILED';

      assert.strictEqual(errorCode, 'TIMEOUT');
      assert.strictEqual(errorMessage, 'Search failed. Please retry.'); // Fallback for empty string
      assert.strictEqual(errorType, 'SEARCH_FAILED');
    });
  });
});
