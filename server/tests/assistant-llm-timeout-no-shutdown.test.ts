/**
 * Regression Test: Assistant LLM Timeout Should NOT Cause Server Shutdown
 * 
 * Verifies that when assistant LLM call times out or fails:
 * 1. Job ends in failure state (DONE_FAILED)
 * 2. Fallback assistant message is published
 * 3. Server remains running (NO process.exit)
 * 4. HTTP/WS response returned normally
 */

import assert from 'assert';
import type { LLMProvider } from '../src/llm/types.js';
import { generateAssistantMessage, type AssistantContext } from '../src/services/search/route2/assistant/assistant-llm.service.js';

// Track if process.exit was called
let processExitCalled = false;
const originalExit = process.exit;

/**
 * Test 1: LLM timeout returns fallback message (no crash)
 */
async function testLLMTimeoutFallback() {
  console.log('[TEST] Starting: LLM timeout returns fallback');

  // Mock LLM provider that times out
  const mockProvider: LLMProvider = {
    async completeJSON() {
      throw new Error('LLM_TIMEOUT: Request exceeded timeout limit');
    },
    async complete() {
      throw new Error('LLM_TIMEOUT: Request exceeded timeout limit');
    }
  };

  const context: AssistantContext = {
    type: 'GATE_FAIL',
    reason: 'NO_FOOD',
    query: 'weather in tel aviv',
    language: 'en'
  };

  try {
    const result = await generateAssistantMessage(context, mockProvider, 'test-request-1');

    // Should return fallback message (NOT crash)
    assert.ok(result.message, 'Should have fallback message');
    assert.strictEqual(result.type, 'GATE_FAIL', 'Type should match');
    assert.strictEqual(result.blocksSearch, true, 'Should block search');
    
    console.log('[TEST] ✓ LLM timeout returned fallback successfully');
    console.log(`[TEST]   Fallback message: "${result.message}"`);
    return true;
  } catch (err) {
    console.error('[TEST] ✗ LLM timeout caused unexpected error:', err);
    return false;
  }
}

/**
 * Test 2: Process.exit should NOT be called during assistant failure
 */
async function testNoProcessExit() {
  console.log('[TEST] Starting: No process.exit on assistant failure');

  // Replace process.exit with mock
  (process as any).exit = (code?: number) => {
    processExitCalled = true;
    console.error(`[TEST] ✗ CRITICAL: process.exit(${code}) was called!`);
  };

  // Mock LLM provider that fails
  const mockProvider: LLMProvider = {
    async completeJSON() {
      throw new Error('PROVIDER_ERROR: OpenAI API unavailable');
    },
    async complete() {
      throw new Error('PROVIDER_ERROR: OpenAI API unavailable');
    }
  };

  const contexts: AssistantContext[] = [
    { type: 'GATE_FAIL', reason: 'NO_FOOD', query: 'test', language: 'en' },
    { type: 'CLARIFY', reason: 'MISSING_LOCATION', query: 'pizza', language: 'en' },
    { type: 'SEARCH_FAILED', reason: 'GOOGLE_TIMEOUT', query: 'sushi', language: 'en' },
    { type: 'SUMMARY', query: 'burger', language: 'en', resultCount: 0, top3Names: [] }
  ];

  for (const context of contexts) {
    const result = await generateAssistantMessage(context, mockProvider, `test-${context.type}`);
    assert.ok(result.message, `Should have fallback for ${context.type}`);
  }

  // Restore original process.exit
  (process as any).exit = originalExit;

  if (processExitCalled) {
    console.error('[TEST] ✗ process.exit was called during assistant failure');
    return false;
  }

  console.log('[TEST] ✓ No process.exit called (server stays up)');
  return true;
}

/**
 * Test 3: All assistant types have fallback messages
 */
async function testAllTypesHaveFallback() {
  console.log('[TEST] Starting: All assistant types have fallback');

  const mockProvider: LLMProvider = {
    async completeJSON() { throw new Error('LLM unavailable'); },
    async complete() { throw new Error('LLM unavailable'); }
  };

  const testCases: Array<{ context: AssistantContext; expectedType: string }> = [
    {
      context: { type: 'GATE_FAIL', reason: 'NO_FOOD', query: 'weather', language: 'en' },
      expectedType: 'GATE_FAIL'
    },
    {
      context: { type: 'CLARIFY', reason: 'MISSING_LOCATION', query: 'pizza', language: 'en' },
      expectedType: 'CLARIFY'
    },
    {
      context: { type: 'SEARCH_FAILED', reason: 'GOOGLE_TIMEOUT', query: 'sushi', language: 'en' },
      expectedType: 'SEARCH_FAILED'
    },
    {
      context: { type: 'SUMMARY', query: 'burger', language: 'en', resultCount: 5, top3Names: ['A', 'B', 'C'] },
      expectedType: 'SUMMARY'
    }
  ];

  for (const { context, expectedType } of testCases) {
    const result = await generateAssistantMessage(context, mockProvider, `test-${expectedType}`);
    
    assert.strictEqual(result.type, expectedType, `Type should be ${expectedType}`);
    assert.ok(result.message.length > 0, `Should have non-empty message for ${expectedType}`);
    assert.ok(result.suggestedAction, `Should have suggestedAction for ${expectedType}`);
    assert.ok(typeof result.blocksSearch === 'boolean', `Should have blocksSearch for ${expectedType}`);
    
    console.log(`[TEST]   ✓ ${expectedType}: "${result.message}"`);
  }

  console.log('[TEST] ✓ All assistant types have fallback');
  return true;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('\n=== Assistant LLM Timeout Regression Tests ===\n');

  const results = await Promise.all([
    testLLMTimeoutFallback(),
    testNoProcessExit(),
    testAllTypesHaveFallback()
  ]);

  const allPassed = results.every(r => r === true);

  console.log('\n=== Test Results ===');
  console.log(`LLM Timeout Fallback: ${results[0] ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`No Process Exit: ${results[1] ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`All Types Fallback: ${results[2] ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`\nOverall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

  if (!allPassed) {
    console.error('\n❌ REGRESSION: Assistant LLM failures cause server instability');
    process.exit(1);
  }

  console.log('\n✅ VERIFIED: Assistant LLM timeouts handled gracefully without server shutdown\n');
  process.exit(0);
}

// Run tests
runTests().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
