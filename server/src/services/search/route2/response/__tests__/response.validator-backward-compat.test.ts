/**
 * Response Validator Backward Compatibility Tests
 * 
 * Ensures that the new ResponseValidator produces identical output
 * to the legacy validateClarifyResponse function
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseValidator } from '../response.validator.js';
import type { SearchResponse } from '../../../types/search-response.dto.js';
import type { FailureReason } from '../../../types/domain.types.js';

describe('ResponseValidator - Backward Compatibility', () => {
  /**
   * Legacy validateClarifyResponse implementation (for comparison)
   * This is the EXACT behavior from orchestrator.response.ts
   */
  function legacyValidateClarifyResponse(response: SearchResponse): SearchResponse {
    const isClarify = response.assist.type === 'clarify';
    const isDoneStopped = response.meta.failureReason !== 'NONE';

    if (isClarify || isDoneStopped) {
      // INVARIANT VIOLATION: CLARIFY/STOPPED must have empty results
      if (response.results.length > 0) {
        // FAIL-SAFE: Force empty results (MUTATION)
        response.results = [];
        delete response.groups;
      }

      // INVARIANT VIOLATION: CLARIFY/STOPPED must have no pagination
      if (response.meta.pagination) {
        // FAIL-SAFE: Remove pagination (MUTATION)
        delete response.meta.pagination;
      }
    }

    return response;
  }

  /**
   * Helper to create test response
   */
  const createTestResponse = (
    assistType: 'guide' | 'clarify',
    failureReason: FailureReason,
    hasResults: boolean,
    hasGroups: boolean,
    hasPagination: boolean
  ): SearchResponse => ({
    requestId: 'test-req',
    sessionId: 'test-session',
    query: {
      original: 'test',
      parsed: {
        query: 'test',
        searchMode: 'textsearch' as const,
        filters: {},
        languageContext: {
          uiLanguage: 'he' as const,
          requestLanguage: 'he' as const,
          googleLanguage: 'he' as const
        },
        originalQuery: 'test'
      },
      language: 'he'
    },
    results: hasResults ? [{ placeId: 'place-1', name: 'Test' } as any] : [],
    groups: hasGroups ? [{ type: 'exact', restaurants: [], count: 0 }] as any : undefined,
    chips: [],
    assist: { type: assistType, message: 'Test message' },
    meta: {
      tookMs: 100,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence: 0.95,
      source: 'route2',
      failureReason,
      pagination: hasPagination ? {
        shownNow: 1,
        totalPool: 1,
        offset: 0,
        hasMore: false
      } : undefined
    }
  });

  /**
   * Deep compare response shapes
   */
  function assertResponsesEqual(actual: SearchResponse, expected: SearchResponse, testName: string) {
    assert.strictEqual(actual.requestId, expected.requestId, `${testName}: requestId mismatch`);
    assert.strictEqual(actual.sessionId, expected.sessionId, `${testName}: sessionId mismatch`);
    assert.strictEqual(actual.results.length, expected.results.length, `${testName}: results length mismatch`);
    
    // Deep compare groups (both undefined or both same structure)
    if (actual.groups === undefined && expected.groups === undefined) {
      // Both undefined - OK
    } else if (actual.groups === undefined || expected.groups === undefined) {
      assert.fail(`${testName}: groups mismatch - one is undefined, other is not`);
    } else {
      assert.deepStrictEqual(actual.groups, expected.groups, `${testName}: groups mismatch`);
    }
    
    assert.strictEqual(actual.assist.type, expected.assist.type, `${testName}: assist.type mismatch`);
    assert.strictEqual(actual.assist.message, expected.assist.message, `${testName}: assist.message mismatch`);
    assert.strictEqual(actual.meta.failureReason, expected.meta.failureReason, `${testName}: failureReason mismatch`);
    
    // Deep compare pagination (both undefined or both same structure)
    if (actual.meta.pagination === undefined && expected.meta.pagination === undefined) {
      // Both undefined - OK
    } else if (actual.meta.pagination === undefined || expected.meta.pagination === undefined) {
      assert.fail(`${testName}: pagination mismatch - one is undefined, other is not`);
    } else {
      assert.deepStrictEqual(actual.meta.pagination, expected.meta.pagination, `${testName}: pagination mismatch`);
    }
  }

  describe('CLARIFY responses', () => {
    it('should match legacy behavior for invalid CLARIFY with all violations', () => {
      // Create two identical responses
      const legacyInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);
      const newInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);

      // Apply transformations
      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      // Should produce identical output
      assertResponsesEqual(newOutput, legacyOutput, 'CLARIFY with all violations');
      
      // Verify sanitization
      assert.strictEqual(newOutput.results.length, 0, 'Results should be empty');
      assert.strictEqual(newOutput.groups, undefined, 'Groups should be undefined');
      assert.strictEqual(newOutput.meta.pagination, undefined, 'Pagination should be undefined');
    });

    it('should match legacy behavior for invalid CLARIFY with only results', () => {
      const legacyInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, false, false);
      const newInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, false, false);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'CLARIFY with results only');
      assert.strictEqual(newOutput.results.length, 0);
    });

    it('should match legacy behavior for invalid CLARIFY with only pagination', () => {
      const legacyInput = createTestResponse('clarify', 'LOCATION_REQUIRED', false, false, true);
      const newInput = createTestResponse('clarify', 'LOCATION_REQUIRED', false, false, true);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'CLARIFY with pagination only');
      assert.strictEqual(newOutput.meta.pagination, undefined);
    });

    it('should match legacy behavior for valid CLARIFY', () => {
      const legacyInput = createTestResponse('clarify', 'LOCATION_REQUIRED', false, false, false);
      const newInput = createTestResponse('clarify', 'LOCATION_REQUIRED', false, false, false);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'Valid CLARIFY');
      assert.strictEqual(newOutput.results.length, 0);
      assert.strictEqual(newOutput.groups, undefined);
      assert.strictEqual(newOutput.meta.pagination, undefined);
    });
  });

  describe('STOPPED responses', () => {
    it('should match legacy behavior for STOPPED with all violations', () => {
      const legacyInput = createTestResponse('guide', 'NO_RESULTS', true, true, true);
      const newInput = createTestResponse('guide', 'NO_RESULTS', true, true, true);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'STOPPED with all violations');
      assert.strictEqual(newOutput.results.length, 0);
      assert.strictEqual(newOutput.groups, undefined);
      assert.strictEqual(newOutput.meta.pagination, undefined);
    });

    it('should match legacy behavior for STOPPED with GOOGLE_API_ERROR', () => {
      const legacyInput = createTestResponse('guide', 'GOOGLE_API_ERROR', true, false, true);
      const newInput = createTestResponse('guide', 'GOOGLE_API_ERROR', true, false, true);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'STOPPED with API error');
      assert.strictEqual(newOutput.results.length, 0);
      assert.strictEqual(newOutput.meta.pagination, undefined);
    });

    it('should match legacy behavior for STOPPED with TIMEOUT', () => {
      const legacyInput = createTestResponse('guide', 'TIMEOUT', true, true, false);
      const newInput = createTestResponse('guide', 'TIMEOUT', true, true, false);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'STOPPED with timeout');
      assert.strictEqual(newOutput.results.length, 0);
      assert.strictEqual(newOutput.groups, undefined);
    });

    it('should match legacy behavior for valid STOPPED (empty results)', () => {
      const legacyInput = createTestResponse('guide', 'LOW_CONFIDENCE', false, false, false);
      const newInput = createTestResponse('guide', 'LOW_CONFIDENCE', false, false, false);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'Valid STOPPED');
      assert.strictEqual(newOutput.results.length, 0);
    });
  });

  describe('SUCCESS responses', () => {
    it('should match legacy behavior for valid success response', () => {
      const legacyInput = createTestResponse('guide', 'NONE', true, false, true);
      const newInput = createTestResponse('guide', 'NONE', true, false, true);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'Valid success response');
      
      // Should NOT sanitize success responses
      assert.strictEqual(newOutput.results.length, 1, 'Results should be preserved');
      assert.ok(newOutput.meta.pagination, 'Pagination should be preserved');
    });

    it('should match legacy behavior for success with groups', () => {
      const legacyInput = createTestResponse('guide', 'NONE', true, true, true);
      const newInput = createTestResponse('guide', 'NONE', true, true, true);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'Success with groups');
      assert.strictEqual(newOutput.results.length, 1);
      assert.ok(newOutput.groups, 'Groups should be preserved');
      assert.ok(newOutput.meta.pagination, 'Pagination should be preserved');
    });

    it('should match legacy behavior for empty success (no results but NONE failure)', () => {
      const legacyInput = createTestResponse('guide', 'NONE', false, false, false);
      const newInput = createTestResponse('guide', 'NONE', false, false, false);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'Empty success');
      assert.strictEqual(newOutput.results.length, 0);
      assert.strictEqual(newOutput.groups, undefined);
      assert.strictEqual(newOutput.meta.pagination, undefined);
    });
  });

  describe('Edge cases', () => {
    it('should handle CLARIFY + STOPPED combination (both conditions true)', () => {
      const legacyInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);
      const newInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      assertResponsesEqual(newOutput, legacyOutput, 'CLARIFY + STOPPED');
      assert.strictEqual(newOutput.results.length, 0);
      assert.strictEqual(newOutput.groups, undefined);
      assert.strictEqual(newOutput.meta.pagination, undefined);
    });

    it('should preserve non-sanitized fields', () => {
      const legacyInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);
      const newInput = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);

      // Add extra fields to test preservation
      legacyInput.chips = [{ type: 'filter', label: 'test', query: 'test' } as any];
      newInput.chips = [{ type: 'filter', label: 'test', query: 'test' } as any];
      
      legacyInput.meta.confidence = 0.75;
      newInput.meta.confidence = 0.75;

      const legacyOutput = legacyValidateClarifyResponse(legacyInput);
      const newOutput = ResponseValidator.sanitize(newInput);

      // Verify non-sanitized fields are preserved
      assert.strictEqual(newOutput.chips.length, legacyOutput.chips.length);
      assert.strictEqual(newOutput.meta.confidence, legacyOutput.meta.confidence);
    });
  });

  describe('Non-mutation verification', () => {
    it('should NOT mutate original response (unlike legacy)', () => {
      const response = createTestResponse('clarify', 'LOCATION_REQUIRED', true, true, true);
      
      const originalResultCount = response.results.length;
      const originalHasGroups = !!response.groups;
      const originalHasPagination = !!response.meta.pagination;

      // New validator should NOT mutate
      const sanitized = ResponseValidator.sanitize(response);

      // Original should be unchanged
      assert.strictEqual(response.results.length, originalResultCount, 'Original results should be unchanged');
      assert.strictEqual(!!response.groups, originalHasGroups, 'Original groups should be unchanged');
      assert.strictEqual(!!response.meta.pagination, originalHasPagination, 'Original pagination should be unchanged');

      // Sanitized should be different
      assert.strictEqual(sanitized.results.length, 0, 'Sanitized results should be empty');
      assert.strictEqual(sanitized.groups, undefined, 'Sanitized groups should be undefined');
      assert.strictEqual(sanitized.meta.pagination, undefined, 'Sanitized pagination should be undefined');

      // Should be different objects
      assert.notStrictEqual(sanitized, response, 'Should return new object');
    });

    it('should return same reference for valid responses (optimization)', () => {
      const response = createTestResponse('guide', 'NONE', true, false, true);
      
      const sanitized = ResponseValidator.sanitize(response);

      // Should return same reference (no need to create new object)
      assert.strictEqual(sanitized, response, 'Should return same object for valid response');
    });
  });

  describe('Pipeline integration tests', () => {
    it('should produce identical output for typical CLARIFY pipeline', () => {
      // Simulate orchestrator building a CLARIFY response
      const buildClarifyResponse = () => createTestResponse('clarify', 'LOCATION_REQUIRED', false, false, false);

      const legacyFlow = legacyValidateClarifyResponse(buildClarifyResponse());
      const newFlow = ResponseValidator.sanitize(buildClarifyResponse());

      assertResponsesEqual(newFlow, legacyFlow, 'CLARIFY pipeline');
    });

    it('should produce identical output for typical NO_RESULTS pipeline', () => {
      const buildNoResultsResponse = () => createTestResponse('guide', 'NO_RESULTS', false, false, false);

      const legacyFlow = legacyValidateClarifyResponse(buildNoResultsResponse());
      const newFlow = ResponseValidator.sanitize(buildNoResultsResponse());

      assertResponsesEqual(newFlow, legacyFlow, 'NO_RESULTS pipeline');
    });

    it('should produce identical output for typical SUCCESS pipeline', () => {
      const buildSuccessResponse = () => createTestResponse('guide', 'NONE', true, false, true);

      const legacyFlow = legacyValidateClarifyResponse(buildSuccessResponse());
      const newFlow = ResponseValidator.sanitize(buildSuccessResponse());

      assertResponsesEqual(newFlow, legacyFlow, 'SUCCESS pipeline');
    });

    it('should produce identical output for buggy SUCCESS with violations (defensive)', () => {
      // Edge case: success response with violations (should never happen but validator should handle)
      const buildBuggySuccess = () => createTestResponse('guide', 'NONE', true, true, true);

      const legacyFlow = legacyValidateClarifyResponse(buildBuggySuccess());
      const newFlow = ResponseValidator.sanitize(buildBuggySuccess());

      assertResponsesEqual(newFlow, legacyFlow, 'Buggy SUCCESS (defensive)');
      // Should NOT sanitize because failureReason = NONE
      assert.strictEqual(newFlow.results.length, 1);
      assert.ok(newFlow.groups);
    });
  });
});
