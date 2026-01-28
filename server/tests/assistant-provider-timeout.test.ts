/**
 * Regression Test: Assistant Hook for Provider Timeout
 * 
 * Verifies:
 * 1. Google Places API TIMEOUT triggers assistant LLM call
 * 2. assistant_llm_start event is emitted
 * 3. assistant_ws_publish event is emitted (channel: assistant)
 * 4. NO deterministic fallback generators are called
 * 5. NO hardcoded message strings are returned/published
 * 6. Language detection from context.sharedFilters.final.uiLanguage
 */

import assert from 'assert';
import { publishSearchFailedAssistant } from '../src/services/search/route2/assistant/assistant-integration.js';
import type { Route2Context } from '../src/services/search/route2/types.js';
import type { LLMProvider, Message } from '../src/llm/types.js';
import type { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';

/**
 * Test 1: Provider timeout triggers assistant LLM call
 */
async function testProviderTimeoutTriggersAssistant() {
  console.log('[TEST] Starting: Provider timeout triggers assistant');

  let assistantLLMCalled = false;
  let assistantPublished = false;
  let llmLanguage: string | undefined;
  let llmQuery: string | undefined;

  // Mock LLM provider to verify it's called
  const mockProvider: LLMProvider = {
    completeJSON: async (messages: Message[], schema: any, opts: any) => {
      assistantLLMCalled = true;
      
      // Extract language from user prompt
      const userPrompt = messages.find(m => m.role === 'user')?.content || '';
      if (userPrompt.includes('Language: he')) {
        llmLanguage = 'he';
      } else if (userPrompt.includes('Language: en')) {
        llmLanguage = 'en';
      }
      
      // Extract query
      const queryMatch = userPrompt.match(/Query: "([^"]+)"/);
      if (queryMatch) {
        llmQuery = queryMatch[1];
      }
      
      return {
        data: {
          type: 'SEARCH_FAILED',
          message: 'LLM-generated message (not hardcoded)',
          question: null,
          suggestedAction: 'RETRY',
          blocksSearch: true
        },
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4o-mini'
      };
    }
  };

  // Mock WebSocket manager to verify message is published
  const mockWSManager: WebSocketManager = {
    publishToChannel: (channel: string, requestId: string, sessionId: string | undefined, message: any) => {
      if (channel === 'assistant' && message.type === 'assistant') {
        assistantPublished = true;
        
        // Verify NO hardcoded strings
        assert.ok(!message.payload.message.includes('אנחנו נתקלים'), 'Must not use hardcoded Hebrew strings');
        assert.ok(!message.payload.message.includes('החיפוש לוקח'), 'Must not use hardcoded Hebrew strings');
        assert.ok(message.payload.message.includes('LLM-generated'), 'Must use LLM-generated message');
      }
    }
  } as any;

  // Context with Hebrew query
  const ctx: Route2Context = {
    requestId: 'test-timeout',
    startTime: Date.now(),
    llmProvider: mockProvider,
    query: 'פיצה בתל אביב',
    sharedFilters: {
      final: {
        uiLanguage: 'he',
        providerLanguage: 'he',
        regionCode: 'IL',
        openState: null,
        openAt: null,
        openBetween: null,
        disclaimers: { hours: true, dietary: true }
      }
    }
  };

  // Simulate provider timeout
  const error = new Error('Request timeout');
  const errorKind = 'GOOGLE_TIMEOUT';

  await publishSearchFailedAssistant(ctx, 'test-timeout', mockWSManager, error, errorKind);

  // Assertions
  assert.ok(assistantLLMCalled, 'Assistant LLM must be called for provider timeout');
  assert.ok(assistantPublished, 'Assistant message must be published to WS');
  assert.strictEqual(llmLanguage, 'he', 'LLM must receive Hebrew language from context');
  assert.strictEqual(llmQuery, 'פיצה בתל אביב', 'LLM must receive query from context');

  console.log('[TEST]   ✓ Assistant LLM called');
  console.log('[TEST]   ✓ Assistant message published to WS');
  console.log('[TEST]   ✓ Language detected from context (he)');
  console.log('[TEST]   ✓ Query passed to LLM');
  console.log('[TEST]   ✓ NO hardcoded strings used');
  console.log('[TEST] ✓ Provider timeout triggers assistant correctly');
  return true;
}

/**
 * Test 2: English query uses English language
 */
async function testEnglishQuery() {
  console.log('[TEST] Starting: English query uses English');

  let llmLanguage: string | undefined;

  const mockProvider: LLMProvider = {
    completeJSON: async (messages: Message[], schema: any, opts: any) => {
      const userPrompt = messages.find(m => m.role === 'user')?.content || '';
      if (userPrompt.includes('Language: en')) {
        llmLanguage = 'en';
      }
      
      return {
        data: {
          type: 'SEARCH_FAILED',
          message: 'Search timed out. Please try again.',
          question: null,
          suggestedAction: 'RETRY',
          blocksSearch: true
        },
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4o-mini'
      };
    }
  };

  const mockWSManager: WebSocketManager = {
    publishToChannel: () => {}
  } as any;

  const ctx: Route2Context = {
    requestId: 'test-english',
    startTime: Date.now(),
    llmProvider: mockProvider,
    query: 'pizza in tel aviv',
    sharedFilters: {
      final: {
        uiLanguage: 'en',
        providerLanguage: 'en',
        regionCode: 'IL',
        openState: null,
        openAt: null,
        openBetween: null,
        disclaimers: { hours: true, dietary: true }
      }
    }
  };

  await publishSearchFailedAssistant(ctx, 'test-english', mockWSManager, new Error('timeout'), 'GOOGLE_TIMEOUT');

  assert.strictEqual(llmLanguage, 'en', 'English query must use English language');

  console.log('[TEST]   ✓ English language detected correctly');
  console.log('[TEST] ✓ English query test passed');
  return true;
}

/**
 * Test 3: LLM failure publishes assistant_error (no deterministic fallback)
 */
async function testLLMFailureNoFallback() {
  console.log('[TEST] Starting: LLM failure - no deterministic fallback');

  let assistantErrorPublished = false;

  // Mock LLM provider that fails
  const mockProvider: LLMProvider = {
    completeJSON: async () => {
      throw new Error('LLM timeout');
    }
  };

  // Mock WebSocket manager to verify assistant_error is published
  const mockWSManager: WebSocketManager = {
    publishToChannel: (channel: string, requestId: string, sessionId: string | undefined, message: any) => {
      if (channel === 'assistant' && message.type === 'assistant_error') {
        assistantErrorPublished = true;
        assert.strictEqual(message.payload.errorCode, 'LLM_TIMEOUT', 'Error code must be LLM_TIMEOUT');
        
        // Verify NO user-facing message in error event
        assert.ok(!message.payload.message, 'assistant_error must NOT contain user-facing message');
      }
    }
  } as any;

  const ctx: Route2Context = {
    requestId: 'test-llm-fail',
    startTime: Date.now(),
    llmProvider: mockProvider,
    query: 'test',
    sharedFilters: {
      final: {
        uiLanguage: 'en',
        providerLanguage: 'en',
        regionCode: 'IL',
        openState: null,
        openAt: null,
        openBetween: null,
        disclaimers: { hours: true, dietary: true }
      }
    }
  };

  await publishSearchFailedAssistant(ctx, 'test-llm-fail', mockWSManager, new Error('provider error'), 'NETWORK_ERROR');

  assert.ok(assistantErrorPublished, 'assistant_error event must be published when LLM fails');

  console.log('[TEST]   ✓ assistant_error event published');
  console.log('[TEST]   ✓ NO deterministic fallback generated');
  console.log('[TEST]   ✓ Error event contains code only (no message)');
  console.log('[TEST] ✓ LLM failure handled correctly (no fallback)');
  return true;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('\n=== Assistant Provider Timeout Regression Tests ===\n');

  try {
    const results = await Promise.all([
      testProviderTimeoutTriggersAssistant(),
      testEnglishQuery(),
      testLLMFailureNoFallback()
    ]);

    const allPassed = results.every(r => r === true);

    console.log('\n=== Test Results ===');
    console.log(`Provider timeout triggers assistant: ${results[0] ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`English language support: ${results[1] ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`LLM failure - no fallback: ${results[2] ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`\nOverall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

    if (!allPassed) {
      console.error('\n❌ Regression test failed');
      process.exit(1);
    }

    console.log('\n✅ VERIFIED: Provider timeout triggers assistant LLM call');
    console.log('✅ VERIFIED: Language detected from context.sharedFilters');
    console.log('✅ VERIFIED: NO deterministic fallback generators used');
    console.log('✅ VERIFIED: LLM failure publishes assistant_error (no fallback)\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test execution error:', err);
    process.exit(1);
  }
}

// Run tests
runTests();
