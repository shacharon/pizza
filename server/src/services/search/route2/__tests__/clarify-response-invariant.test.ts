/**
 * CLARIFY Response Invariant Tests
 * Validates that CLARIFY/STOPPED responses never contain results or pagination
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEarlyExitResponse } from '../orchestrator.response.js';

describe('CLARIFY Response - Defensive Invariants', () => {
  const baseParams = {
    requestId: 'test-req-123',
    sessionId: 'test-session-456',
    query: 'מה לאכול',
    language: 'he' as const,
    confidence: 0.5,
    startTime: Date.now()
  };

  it('should return empty results array for CLARIFY response', () => {
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'clarify',
      assistMessage: 'Where are you looking?',
      source: 'route2_generic_query_guard',
      failureReason: 'LOW_CONFIDENCE'
    });

    // INVARIANT: CLARIFY must have empty results
    assert.strictEqual(response.results.length, 0, 'CLARIFY response must have empty results[]');
    assert.strictEqual(response.assist.type, 'clarify', 'Assist type should be clarify');
  });

  it('should not include pagination metadata for CLARIFY response', () => {
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'clarify',
      assistMessage: 'Where are you looking?',
      source: 'route2_generic_query_guard',
      failureReason: 'LOW_CONFIDENCE'
    });

    // INVARIANT: CLARIFY must have no pagination
    assert.strictEqual(response.meta.pagination, undefined, 'CLARIFY response must not have pagination');
  });

  it('should return empty results for DONE_STOPPED (gate stop)', () => {
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'guide',
      assistMessage: 'Not a food query',
      source: 'route2_gate_stop',
      failureReason: 'LOW_CONFIDENCE'
    });

    // INVARIANT: DONE_STOPPED must have empty results
    assert.strictEqual(response.results.length, 0, 'DONE_STOPPED response must have empty results[]');
    assert.notEqual(response.meta.failureReason, 'NONE', 'DONE_STOPPED must have failureReason !== NONE');
  });

  it('should have empty chips array for CLARIFY response', () => {
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'clarify',
      assistMessage: 'Where are you looking?',
      source: 'route2_generic_query_guard',
      failureReason: 'LOW_CONFIDENCE'
    });

    // CLARIFY responses should not suggest refinement chips
    assert.strictEqual(response.chips.length, 0, 'CLARIFY response should have no chips');
  });

  it('should preserve query text in response', () => {
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'clarify',
      assistMessage: 'Where are you looking?',
      source: 'route2_generic_query_guard',
      failureReason: 'LOW_CONFIDENCE'
    });

    // Query should be preserved for user context
    assert.strictEqual(response.query.original, 'מה לאכול', 'Original query should be preserved');
    assert.strictEqual(response.query.parsed.query, 'מה לאכול', 'Parsed query should match original');
  });

  it('should set correct failureReason for CLARIFY', () => {
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'clarify',
      assistMessage: 'Where are you looking?',
      source: 'route2_generic_query_guard',
      failureReason: 'LOW_CONFIDENCE'
    });

    // CLARIFY responses should indicate why search stopped
    assert.strictEqual(response.meta.failureReason, 'LOW_CONFIDENCE', 'Should have failureReason set');
    assert.notEqual(response.meta.failureReason, 'NONE', 'failureReason should not be NONE for CLARIFY');
  });

  it('should include assist message for CLARIFY', () => {
    const expectedMessage = 'Where are you looking?';
    const response = buildEarlyExitResponse({
      ...baseParams,
      assistType: 'clarify',
      assistMessage: expectedMessage,
      source: 'route2_generic_query_guard',
      failureReason: 'LOW_CONFIDENCE'
    });

    // Assist message should be present for HTTP fallback
    assert.strictEqual(response.assist.message, expectedMessage, 'Assist message should match');
  });
});

describe('CLARIFY Response - Invariant Enforcement (Defensive)', () => {
  // These tests verify the defensive sanitization logic
  // In normal operation, these violations should never occur
  // But the invariant checker will log errors and sanitize if they do

  it('should handle response structure correctly', () => {
    const response = buildEarlyExitResponse({
      requestId: 'test-defensive-1',
      sessionId: 'test-session-789',
      query: 'pizza',
      language: 'en' as const,
      confidence: 0.7,
      assistType: 'clarify',
      assistMessage: 'Need location',
      source: 'route2_test',
      failureReason: 'LOW_CONFIDENCE',
      startTime: Date.now()
    });

    // Verify all required fields are present
    assert.ok(response.requestId, 'requestId should be present');
    assert.ok(response.sessionId, 'sessionId should be present');
    assert.ok(response.query, 'query should be present');
    assert.ok(response.results, 'results should be present (empty array)');
    assert.ok(response.chips, 'chips should be present (empty array)');
    assert.ok(response.assist, 'assist should be present');
    assert.ok(response.meta, 'meta should be present');

    // Verify correct types
    assert.strictEqual(Array.isArray(response.results), true, 'results should be array');
    assert.strictEqual(Array.isArray(response.chips), true, 'chips should be array');
  });
});
