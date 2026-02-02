/**
 * Response Validator Tests
 * 
 * Tests all response validation invariants:
 * 1. CLARIFY responses must have empty results, no groups, no pagination
 * 2. STOPPED responses must have empty results, no groups, no pagination
 * 3. Backward compatibility with existing behavior
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseValidator } from '../response.validator.js';
import type { SearchResponse } from '../../../types/search-response.dto.js';

describe('ResponseValidator', () => {
  // Helper to create a base valid response
  const createBaseResponse = (overrides?: Partial<SearchResponse>): SearchResponse => ({
    requestId: 'test-req-123',
    sessionId: 'test-session-456',
    query: {
      original: 'test query',
      parsed: {
        query: 'test query',
        searchMode: 'textsearch' as const,
        filters: {},
        languageContext: {
          uiLanguage: 'he' as const,
          requestLanguage: 'he' as const,
          googleLanguage: 'he' as const
        },
        originalQuery: 'test query'
      },
      language: 'he'
    },
    results: [],
    chips: [],
    assist: { type: 'guide', message: '' },
    meta: {
      tookMs: 100,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence: 0.95,
      source: 'route2',
      failureReason: 'NONE'
    },
    ...overrides
  });

  describe('validateClarify', () => {
    it('should pass for valid CLARIFY response (empty results, no pagination)', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Can you clarify your location?' },
        results: [],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      const result = ResponseValidator.validateClarify(response);
      
      assert.strictEqual(result.valid, true, 'Valid CLARIFY response should pass');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should fail when CLARIFY response has results', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [
          { 
            placeId: 'place-1', 
            name: 'Restaurant 1',
            rating: 4.5,
            userRatingsTotal: 100,
            location: { lat: 32.0, lng: 34.0 },
            address: 'Address 1',
            types: ['restaurant'],
            priceLevel: 2,
            photos: []
          } as any
        ],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      const result = ResponseValidator.validateClarify(response);
      
      assert.strictEqual(result.valid, false, 'CLARIFY with results should fail');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].code, 'CLARIFY_HAS_RESULTS');
      assert.strictEqual(result.violations[0].context.resultCount, 1);
    });

    it('should fail when CLARIFY response has groups', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [],
        groups: [
          { type: 'exact', restaurants: [], count: 0 }
        ] as any,
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      const result = ResponseValidator.validateClarify(response);
      
      assert.strictEqual(result.valid, false, 'CLARIFY with groups should fail');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].code, 'CLARIFY_HAS_GROUPS');
      assert.strictEqual(result.violations[0].context.hasGroups, true);
    });

    it('should fail when CLARIFY response has pagination', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED',
          pagination: {
            shownNow: 10,
            totalPool: 20,
            offset: 0,
            hasMore: true
          }
        }
      });

      const result = ResponseValidator.validateClarify(response);
      
      assert.strictEqual(result.valid, false, 'CLARIFY with pagination should fail');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].code, 'CLARIFY_HAS_PAGINATION');
      assert.strictEqual(result.violations[0].context.hasPagination, true);
    });

    it('should fail with multiple violations when CLARIFY has results, groups, and pagination', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        groups: [{ type: 'exact', restaurants: [], count: 0 }] as any,
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const result = ResponseValidator.validateClarify(response);
      
      assert.strictEqual(result.valid, false, 'Should fail with multiple violations');
      assert.strictEqual(result.violations.length, 3, 'Should have 3 violations');
      
      const codes = result.violations.map(v => v.code);
      assert.ok(codes.includes('CLARIFY_HAS_RESULTS'), 'Should include CLARIFY_HAS_RESULTS');
      assert.ok(codes.includes('CLARIFY_HAS_GROUPS'), 'Should include CLARIFY_HAS_GROUPS');
      assert.ok(codes.includes('CLARIFY_HAS_PAGINATION'), 'Should include CLARIFY_HAS_PAGINATION');
    });

    it('should pass for non-CLARIFY response with results', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Here are some options' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE'
        }
      });

      const result = ResponseValidator.validateClarify(response);
      
      assert.strictEqual(result.valid, true, 'Non-CLARIFY response should not be validated');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });
  });

  describe('validateStopped', () => {
    it('should pass for valid STOPPED response (empty results, no pagination)', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'No results found' },
        results: [],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NO_RESULTS'
        }
      });

      const result = ResponseValidator.validateStopped(response);
      
      assert.strictEqual(result.valid, true, 'Valid STOPPED response should pass');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should fail when STOPPED response has results', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Error' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'GOOGLE_API_ERROR'
        }
      });

      const result = ResponseValidator.validateStopped(response);
      
      assert.strictEqual(result.valid, false, 'STOPPED with results should fail');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].code, 'STOPPED_HAS_RESULTS');
      assert.strictEqual(result.violations[0].context.failureReason, 'GOOGLE_API_ERROR');
    });

    it('should fail when STOPPED response has groups', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Error' },
        results: [],
        groups: [{ type: 'exact', restaurants: [], count: 0 }] as any,
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'TIMEOUT'
        }
      });

      const result = ResponseValidator.validateStopped(response);
      
      assert.strictEqual(result.valid, false, 'STOPPED with groups should fail');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].code, 'STOPPED_HAS_GROUPS');
    });

    it('should fail when STOPPED response has pagination', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Error' },
        results: [],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOW_CONFIDENCE',
          pagination: {
            shownNow: 0,
            totalPool: 0,
            offset: 0,
            hasMore: false
          }
        }
      });

      const result = ResponseValidator.validateStopped(response);
      
      assert.strictEqual(result.valid, false, 'STOPPED with pagination should fail');
      assert.strictEqual(result.violations.length, 1, 'Should have 1 violation');
      assert.strictEqual(result.violations[0].code, 'STOPPED_HAS_PAGINATION');
    });

    it('should pass for success response (failureReason = NONE) with results', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Found results' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const result = ResponseValidator.validateStopped(response);
      
      assert.strictEqual(result.valid, true, 'Success response should not be validated');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });
  });

  describe('checkInvariants', () => {
    it('should check both CLARIFY and STOPPED invariants', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const result = ResponseValidator.checkInvariants(response);
      
      assert.strictEqual(result.valid, false, 'Should fail with violations');
      // Should have violations from both CLARIFY and STOPPED checks
      assert.ok(result.violations.length >= 2, 'Should have multiple violations');
      
      const codes = result.violations.map(v => v.code);
      assert.ok(codes.includes('CLARIFY_HAS_RESULTS'), 'Should include CLARIFY violation');
      assert.ok(codes.includes('STOPPED_HAS_RESULTS'), 'Should include STOPPED violation');
    });

    it('should pass for valid success response', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Found results' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE'
        }
      });

      const result = ResponseValidator.checkInvariants(response);
      
      assert.strictEqual(result.valid, true, 'Valid response should pass');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });

    it('should pass for valid CLARIFY response', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      const result = ResponseValidator.checkInvariants(response);
      
      assert.strictEqual(result.valid, true, 'Valid CLARIFY should pass');
      assert.strictEqual(result.violations.length, 0, 'Should have no violations');
    });
  });

  describe('sanitize', () => {
    it('should sanitize invalid CLARIFY response', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        groups: [{ type: 'exact', restaurants: [], count: 0 }] as any,
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const sanitized = ResponseValidator.sanitize(response);
      
      // Should create a new object (not mutate)
      assert.notStrictEqual(sanitized, response, 'Should return new object');
      
      // Should sanitize all violations
      assert.strictEqual(sanitized.results.length, 0, 'Results should be empty');
      assert.strictEqual(sanitized.groups, undefined, 'Groups should be undefined');
      assert.strictEqual(sanitized.meta.pagination, undefined, 'Pagination should be undefined');
      
      // Should preserve other fields
      assert.strictEqual(sanitized.requestId, response.requestId);
      assert.strictEqual(sanitized.assist.type, 'clarify');
      assert.strictEqual(sanitized.assist.message, 'Where?');
    });

    it('should sanitize invalid STOPPED response', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Error' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'GOOGLE_API_ERROR',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const sanitized = ResponseValidator.sanitize(response);
      
      assert.strictEqual(sanitized.results.length, 0, 'Results should be empty');
      assert.strictEqual(sanitized.groups, undefined, 'Groups should be undefined');
      assert.strictEqual(sanitized.meta.pagination, undefined, 'Pagination should be undefined');
    });

    it('should return original response if already valid', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Found results' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE'
        }
      });

      const sanitized = ResponseValidator.sanitize(response);
      
      assert.strictEqual(sanitized, response, 'Should return same object if valid');
    });

    it('should not mutate original response', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      const originalResultCount = response.results.length;
      const sanitized = ResponseValidator.sanitize(response);
      
      // Original should be unchanged
      assert.strictEqual(response.results.length, originalResultCount, 'Original results should be unchanged');
      
      // Sanitized should be different
      assert.strictEqual(sanitized.results.length, 0, 'Sanitized results should be empty');
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for valid response', () => {
      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Found results' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE'
        }
      });

      assert.doesNotThrow(() => {
        ResponseValidator.validateOrThrow(response);
      }, 'Should not throw for valid response');
    });

    it('should throw for invalid CLARIFY response', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      assert.throws(
        () => ResponseValidator.validateOrThrow(response),
        /Invariant violation/,
        'Should throw for invalid response'
      );
    });

    it('should include violation details in error message', () => {
      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      try {
        ResponseValidator.validateOrThrow(response);
        assert.fail('Should have thrown');
      } catch (error: any) {
        assert.ok(error.message.includes('CLARIFY_HAS_RESULTS'), 'Error should include violation code');
        assert.ok(error.message.includes('STOPPED_HAS_RESULTS'), 'Error should include all violation codes');
      }
    });
  });

  describe('validateAndSanitize', () => {
    it('should sanitize and log violations', () => {
      const loggedErrors: any[] = [];
      const mockLogger = {
        error: (data: any, msg?: string) => {
          loggedErrors.push({ data, msg });
        }
      };

      const response = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED'
        }
      });

      const sanitized = ResponseValidator.validateAndSanitize(response, mockLogger);
      
      // Should sanitize
      assert.strictEqual(sanitized.results.length, 0, 'Should sanitize results');
      
      // Should log violations
      assert.ok(loggedErrors.length > 0, 'Should log violations');
      assert.ok(
        loggedErrors.some(e => e.data.code === 'CLARIFY_HAS_RESULTS'),
        'Should log CLARIFY_HAS_RESULTS violation'
      );
    });

    it('should return original response if valid (no logging)', () => {
      const loggedErrors: any[] = [];
      const mockLogger = {
        error: (data: any, msg?: string) => {
          loggedErrors.push({ data, msg });
        }
      };

      const response = createBaseResponse({
        assist: { type: 'guide', message: 'Found results' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE'
        }
      });

      const result = ResponseValidator.validateAndSanitize(response, mockLogger);
      
      assert.strictEqual(result, response, 'Should return original if valid');
      assert.strictEqual(loggedErrors.length, 0, 'Should not log anything');
    });
  });

  describe('Backward compatibility tests', () => {
    it('should match existing validateClarifyResponse behavior for CLARIFY', () => {
      const invalidClarify = createBaseResponse({
        assist: { type: 'clarify', message: 'Where?' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        groups: [{ type: 'exact', restaurants: [], count: 0 }] as any,
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'LOCATION_REQUIRED',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const sanitized = ResponseValidator.sanitize(invalidClarify);
      
      // Should match existing behavior: empty results, no groups, no pagination
      assert.strictEqual(sanitized.results.length, 0);
      assert.strictEqual(sanitized.groups, undefined);
      assert.strictEqual(sanitized.meta.pagination, undefined);
      
      // Should preserve other fields
      assert.strictEqual(sanitized.requestId, invalidClarify.requestId);
      assert.strictEqual(sanitized.assist.type, 'clarify');
    });

    it('should match existing validateClarifyResponse behavior for STOPPED', () => {
      const invalidStopped = createBaseResponse({
        assist: { type: 'guide', message: 'Error' },
        results: [{ placeId: 'place-1', name: 'Test' } as any],
        groups: [{ type: 'exact', restaurants: [], count: 0 }] as any,
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'GOOGLE_API_ERROR',
          pagination: {
            shownNow: 1,
            totalPool: 1,
            offset: 0,
            hasMore: false
          }
        }
      });

      const sanitized = ResponseValidator.sanitize(invalidStopped);
      
      // Should match existing behavior
      assert.strictEqual(sanitized.results.length, 0);
      assert.strictEqual(sanitized.groups, undefined);
      assert.strictEqual(sanitized.meta.pagination, undefined);
    });

    it('should pass through valid responses unchanged', () => {
      const validResponse = createBaseResponse({
        assist: { type: 'guide', message: 'Found results' },
        results: [
          { placeId: 'place-1', name: 'Test 1' } as any,
          { placeId: 'place-2', name: 'Test 2' } as any
        ],
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.95,
          source: 'route2',
          failureReason: 'NONE',
          pagination: {
            shownNow: 2,
            totalPool: 20,
            offset: 0,
            hasMore: true
          }
        }
      });

      const sanitized = ResponseValidator.sanitize(validResponse);
      
      // Should be identical (same reference)
      assert.strictEqual(sanitized, validResponse);
      assert.strictEqual(sanitized.results.length, 2);
      assert.ok(sanitized.meta.pagination);
    });
  });
});
