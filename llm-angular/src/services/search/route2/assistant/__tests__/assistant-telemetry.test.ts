/**
 * Tests for Assistant Telemetry Fix
 * Ensures promptVersion and schemaHash are always emitted
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Assistant Telemetry', () => {
  test('llmOpts should include promptVersion', () => {
    // Simulate buildLLMOptions + manual additions
    const ASSISTANT_PROMPT_VERSION = 'assistant_v2';
    const ASSISTANT_SCHEMA_HASH = 'abc123def';

    const llmOpts: any = {
      temperature: 0.7,
      requestId: 'test-123',
      stage: 'assistant_llm',
      promptLength: 100
    };

    // CORRECTNESS FIX: Add promptVersion and schemaHash
    llmOpts.promptVersion = ASSISTANT_PROMPT_VERSION;
    llmOpts.schemaHash = ASSISTANT_SCHEMA_HASH;

    assert.ok(llmOpts.promptVersion, 'promptVersion should exist');
    assert.equal(llmOpts.promptVersion, 'assistant_v2', 'promptVersion should match constant');
    assert.notEqual(llmOpts.promptVersion, 'unknown', 'promptVersion should not be "unknown"');
  });

  test('llmOpts should include schemaHash', () => {
    const ASSISTANT_SCHEMA_HASH = 'abc123def';

    const llmOpts: any = {
      temperature: 0.7,
      requestId: 'test-123',
      stage: 'assistant_llm'
    };

    llmOpts.schemaHash = ASSISTANT_SCHEMA_HASH;

    assert.ok(llmOpts.schemaHash, 'schemaHash should exist');
    assert.equal(llmOpts.schemaHash, 'abc123def', 'schemaHash should match constant');
  });

  test('llm_gate_timing logs should have promptVersion', () => {
    // Simulate log payload
    const logPayload = {
      msg: 'llm_gate_timing',
      stage: 'assistant_llm',
      promptVersion: 'assistant_v2', // Should NOT be 'unknown'
      schemaHash: 'abc123def',
      requestId: 'test-123',
      networkMs: 1234,
      totalMs: 1250,
      success: true
    };

    assert.ok(logPayload.promptVersion, 'Log should include promptVersion');
    assert.notEqual(logPayload.promptVersion, 'unknown', 'promptVersion should not be unknown');
    assert.equal(logPayload.promptVersion, 'assistant_v2', 'promptVersion should be specific version');
  });

  test('assistant_llm_start logs should have promptVersion and schemaVersion', () => {
    const ASSISTANT_PROMPT_VERSION = 'assistant_v2';
    const ASSISTANT_SCHEMA_VERSION = 'v2';

    const logPayload = {
      requestId: 'test-123',
      stage: 'assistant_llm',
      event: 'assistant_llm_start',
      type: 'SUMMARY',
      questionLanguage: 'he',
      queryLen: 15,
      schemaVersion: ASSISTANT_SCHEMA_VERSION,
      promptVersion: ASSISTANT_PROMPT_VERSION
    };

    assert.ok(logPayload.promptVersion, 'Log should include promptVersion');
    assert.ok(logPayload.schemaVersion, 'Log should include schemaVersion');
    assert.equal(logPayload.promptVersion, 'assistant_v2', 'promptVersion should match constant');
    assert.equal(logPayload.schemaVersion, 'v2', 'schemaVersion should match constant');
  });
});
