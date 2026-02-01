/**
 * Provider Error Sanitization Tests
 * Verifies that provider error messages are sanitized before sending to client
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { classifyPipelineError, sanitizeErrorMessage, PipelineErrorKind } from '../pipeline-error-kinds.js';

describe('Provider Error Sanitization', () => {
  it('should sanitize OpenAI schema errors for client', () => {
    // Simulate OpenAI schema validation error
    const rawError = new Error(
      "400 Invalid schema for response_format 'response': In context=('properties', 'resolvedLatLng', 'type', '0'), 'additionalProperties' is required to be supplied and to be false."
    );

    const { kind } = classifyPipelineError(rawError, 'landmark_mapper');
    const sanitizedMessage = sanitizeErrorMessage(kind, rawError.message);

    // Verify classification
    assert.strictEqual(kind, PipelineErrorKind.INTERNAL_ERROR, 'Should classify as INTERNAL_ERROR');

    // Verify sanitization
    assert.strictEqual(
      sanitizedMessage,
      'An internal error occurred',
      'Should return generic message for INTERNAL_ERROR'
    );

    // Verify raw error is NOT in sanitized message
    assert.ok(
      !sanitizedMessage.includes('Invalid schema'),
      'Sanitized message should NOT contain provider error details'
    );
    assert.ok(
      !sanitizedMessage.includes('OpenAI'),
      'Sanitized message should NOT contain provider name'
    );
  });

  it('should sanitize provider timeout errors', () => {
    const rawError = new Error('timeout exceeded');
    const { kind } = classifyPipelineError(rawError, 'gate2');
    const sanitizedMessage = sanitizeErrorMessage(kind, rawError.message);

    assert.strictEqual(kind, PipelineErrorKind.GATE_LLM_TIMEOUT);
    assert.strictEqual(sanitizedMessage, 'Gate analysis timed out');
    assert.ok(!sanitizedMessage.includes('timeout exceeded'), 'Should not leak raw error');
  });

  it('should sanitize generic provider errors', () => {
    const rawError = new Error('OpenAI API key invalid: sk-proj-...');
    const { kind } = classifyPipelineError(rawError, undefined);
    const sanitizedMessage = sanitizeErrorMessage(kind, rawError.message);

    // Should be classified as VALIDATION_ERROR but still sanitized
    assert.strictEqual(sanitizedMessage, 'An internal error occurred');
    assert.ok(!sanitizedMessage.includes('API key'), 'Should not leak API key details');
    assert.ok(!sanitizedMessage.includes('sk-proj'), 'Should not leak API key prefix');
  });

  it('should allow safe error messages for client-actionable errors', () => {
    const rawError = new Error('no location');
    const { kind } = classifyPipelineError(rawError, undefined);
    const sanitizedMessage = sanitizeErrorMessage(kind, rawError.message);

    assert.strictEqual(kind, PipelineErrorKind.NEARME_NO_LOCATION);
    // This error is safe to show to users
    assert.strictEqual(sanitizedMessage, 'Location required for nearby search');
  });

  it('should sanitize LLM provider errors', () => {
    const rawError = new Error('LLM provider unavailable: connection refused');
    const { kind } = classifyPipelineError(rawError, undefined);
    const sanitizedMessage = sanitizeErrorMessage(kind, rawError.message);

    assert.strictEqual(kind, PipelineErrorKind.INTERNAL_ERROR);
    assert.strictEqual(sanitizedMessage, 'An internal error occurred');
    assert.ok(!sanitizedMessage.includes('connection refused'), 'Should not leak infrastructure details');
  });
});
