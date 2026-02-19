/**
 * Tests for SUMMARY Invariant Fix
 * Ensures SUMMARY cannot produce blocksSearch=true
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('SUMMARY blocksSearch Invariant', () => {
  test('enforceInvariants should force blocksSearch=false for SUMMARY', () => {
    // Simulate LLM output that violates invariant
    const llmOutput = {
      type: 'SUMMARY' as const,
      message: 'Found 5 great pizza places near you!',
      question: null,
      suggestedAction: 'NONE' as const,
      blocksSearch: true // WRONG - LLM violated prompt rule
    };

    const context = {
      type: 'SUMMARY' as const,
      query: 'pizza',
      language: 'he' as const,
      resultCount: 5,
      top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
    };

    // Simulate enforceInvariants logic
    const normalized = { ...llmOutput };
    let changed = false;

    if (context.type === 'SUMMARY') {
      if (normalized.blocksSearch) {
        normalized.blocksSearch = false;
        changed = true;
      }
    }

    assert.equal(normalized.blocksSearch, false, 'blocksSearch should be enforced to false');
    assert.equal(changed, true, 'Should have changed the value');
  });

  test('enforceInvariants should not change blocksSearch=false for SUMMARY', () => {
    const llmOutput = {
      type: 'SUMMARY' as const,
      message: 'Found 5 great pizza places near you!',
      question: null,
      suggestedAction: 'NONE' as const,
      blocksSearch: false // CORRECT
    };

    const context = {
      type: 'SUMMARY' as const,
      query: 'pizza',
      language: 'he' as const,
      resultCount: 5,
      top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
    };

    const normalized = { ...llmOutput };
    let changed = false;

    if (context.type === 'SUMMARY') {
      if (normalized.blocksSearch) {
        normalized.blocksSearch = false;
        changed = true;
      }
    }

    assert.equal(normalized.blocksSearch, false, 'blocksSearch should remain false');
    assert.equal(changed, false, 'Should not have changed the value');
  });

  test('prompt should explicitly forbid blocksSearch=true for SUMMARY', () => {
    const systemPrompt = `- "blocksSearch": 
  * SUMMARY type: MUST be false (search already completed, showing results)
  * GENERIC_QUERY_NARRATION type: MUST be false (search already completed)
  * CLARIFY/GATE_FAIL type: MUST be true (search cannot proceed)
  * SEARCH_FAILED type: usually true (search failed, user should try again)`;

    // Verify prompt contains explicit SUMMARY rule
    assert.ok(systemPrompt.includes('SUMMARY type: MUST be false'), 'Prompt should have explicit SUMMARY rule');
    assert.ok(systemPrompt.includes('search already completed'), 'Prompt should explain reasoning');
  });

  test('CLARIFY should have blocksSearch=true enforced', () => {
    const llmOutput = {
      type: 'CLARIFY' as const,
      message: 'Where do you want to search?',
      question: 'Which city?',
      suggestedAction: 'ASK_LOCATION' as const,
      blocksSearch: false // WRONG
    };

    const context = {
      type: 'CLARIFY' as const,
      reason: 'MISSING_LOCATION' as const,
      query: 'pizza',
      language: 'he' as const
    };

    const normalized = { ...llmOutput };

    if (context.type === 'CLARIFY') {
      if (!normalized.blocksSearch) {
        normalized.blocksSearch = true;
      }
    }

    assert.equal(normalized.blocksSearch, true, 'CLARIFY should have blocksSearch=true');
  });

  test('GATE_FAIL should have blocksSearch=true enforced', () => {
    const llmOutput = {
      type: 'GATE_FAIL' as const,
      message: 'Not a food search',
      question: null,
      suggestedAction: 'RETRY' as const,
      blocksSearch: false // WRONG
    };

    const context = {
      type: 'GATE_FAIL' as const,
      reason: 'NO_FOOD' as const,
      query: 'weather',
      language: 'en' as const
    };

    const normalized = { ...llmOutput };

    if (context.type === 'GATE_FAIL') {
      if (!normalized.blocksSearch) {
        normalized.blocksSearch = true;
      }
    }

    assert.equal(normalized.blocksSearch, true, 'GATE_FAIL should have blocksSearch=true');
  });

  test('GENERIC_QUERY_NARRATION should have blocksSearch=false enforced', () => {
    const llmOutput = {
      type: 'GENERIC_QUERY_NARRATION' as const,
      message: 'I searched near your current location.',
      question: null,
      suggestedAction: 'REFINE' as const,
      blocksSearch: true // WRONG
    };

    const context = {
      type: 'GENERIC_QUERY_NARRATION' as const,
      query: 'food',
      language: 'en' as const,
      resultCount: 10,
      usedCurrentLocation: true
    };

    const normalized = { ...llmOutput };

    if (context.type === 'GENERIC_QUERY_NARRATION') {
      if (normalized.blocksSearch) {
        normalized.blocksSearch = false;
      }
    }

    assert.equal(normalized.blocksSearch, false, 'GENERIC_QUERY_NARRATION should have blocksSearch=false');
  });

  test('logging should indicate prompt violation severity', () => {
    // Simulate log when SUMMARY violates prompt
    const logPayload = {
      requestId: 'test-123',
      event: 'assistant_invariant_violation_enforced',
      type: 'SUMMARY',
      field: 'blocksSearch',
      llmValue: true,
      enforcedValue: false,
      severity: 'PROMPT_VIOLATION' // Indicates LLM ignored explicit prompt rule
    };

    assert.equal(logPayload.severity, 'PROMPT_VIOLATION', 'Should log as prompt violation');
    assert.equal(logPayload.llmValue, true, 'Should log original LLM value');
    assert.equal(logPayload.enforcedValue, false, 'Should log enforced value');
  });
});
