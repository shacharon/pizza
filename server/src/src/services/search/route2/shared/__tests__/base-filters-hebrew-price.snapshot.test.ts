/**
 * Snapshot test: Verify Hebrew price keywords are extracted correctly
 * 
 * Tests raw LLM JSON output for "סושי זול בגדרה"
 */

import { resolveBaseFiltersLLM } from '../base-filters-llm.js';
import type { LLMProvider, Message } from '../../../../../llm/types.js';

// Mock LLM provider that returns realistic structured output
function createMockLLMProvider(mockResponse: any): LLMProvider {
  return {
    complete: async () => {
      throw new Error('Not implemented');
    },
    completeJSON: async (messages: Message[], schema: any, options?: any) => {
      // Return mock response as if from real LLM
      return {
        data: mockResponse,
        usage: {
          prompt_tokens: 150,
          completion_tokens: 50,
          total_tokens: 200
        },
        model: 'gpt-4o-mini'
      };
    },
    completeStream: async function* () {
      throw new Error('Not implemented');
    }
  };
}

console.log('📸 Running base_filters Hebrew price snapshot test...\n');

// Test: "סושי זול בגדרה" → priceIntent="CHEAP", priceLevels=[1,2]
{
  console.log('Test: Hebrew query "סושי זול בגדרה" → extract CHEAP intent');
  
  // This is the expected RAW JSON that the LLM should return
  const expectedRawJSON = {
    language: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'CHEAP',
    priceLevels: [1, 2]
  };

  const mockProvider = createMockLLMProvider(expectedRawJSON);

  const result = await resolveBaseFiltersLLM({
    query: 'סושי זול בגדרה',
    route: 'ROUTE2',
    llmProvider: mockProvider,
    requestId: 'snapshot-test-hebrew-cheap',
    traceId: 'test-trace',
    sessionId: 'test-session'
  });

  // Verify the result matches expected structure
  const pass = 
    result.language === 'he' &&
    result.openState === null &&
    result.priceIntent === 'CHEAP' &&
    result.priceLevels !== null &&
    result.priceLevels.length === 2 &&
    result.priceLevels[0] === 1 &&
    result.priceLevels[1] === 2;

  console.log('  Raw LLM JSON (snapshot):');
  console.log('  ' + JSON.stringify(expectedRawJSON, null, 2).replace(/\n/g, '\n  '));
  console.log();
  console.log('  Validated result:');
  console.log('    language:', result.language);
  console.log('    openState:', result.openState);
  console.log('    priceIntent:', result.priceIntent);
  console.log('    priceLevels:', result.priceLevels);
  console.log();
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'} - Hebrew "זול" correctly extracted as CHEAP`);
  
  if (!pass) {
    process.exit(1);
  }
}

// Test: "מסעדות יוקרתיות פתוחות עכשיו" → BOTH openState + priceIntent
{
  console.log('\nTest: Multi-intent "מסעדות יוקרתיות פתוחות עכשיו" → extract BOTH');
  
  const expectedRawJSON = {
    language: 'he',
    openState: 'OPEN_NOW',
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'EXPENSIVE',
    priceLevels: [3, 4]
  };

  const mockProvider = createMockLLMProvider(expectedRawJSON);

  const result = await resolveBaseFiltersLLM({
    query: 'מסעדות יוקרתיות פתוחות עכשיו',
    route: 'ROUTE2',
    llmProvider: mockProvider,
    requestId: 'snapshot-test-multi-intent',
    traceId: 'test-trace',
    sessionId: 'test-session'
  });

  const pass = 
    result.openState === 'OPEN_NOW' &&
    result.priceIntent === 'EXPENSIVE' &&
    result.priceLevels !== null &&
    result.priceLevels.length === 2 &&
    result.priceLevels[0] === 3 &&
    result.priceLevels[1] === 4;

  console.log('  Raw LLM JSON (snapshot):');
  console.log('  ' + JSON.stringify(expectedRawJSON, null, 2).replace(/\n/g, '\n  '));
  console.log();
  console.log('  Validated result:');
  console.log('    openState:', result.openState);
  console.log('    priceIntent:', result.priceIntent);
  console.log('    priceLevels:', result.priceLevels);
  console.log();
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'} - Multi-intent extraction works`);
  
  if (!pass) {
    process.exit(1);
  }
}

// Test: "affordable sushi" → English CHEAP
{
  console.log('\nTest: English "affordable sushi" → extract CHEAP');
  
  const expectedRawJSON = {
    language: 'en',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'CHEAP',
    priceLevels: [1, 2]
  };

  const mockProvider = createMockLLMProvider(expectedRawJSON);

  const result = await resolveBaseFiltersLLM({
    query: 'affordable sushi',
    route: 'ROUTE2',
    llmProvider: mockProvider,
    requestId: 'snapshot-test-english-affordable',
    traceId: 'test-trace',
    sessionId: 'test-session'
  });

  const pass = 
    result.language === 'en' &&
    result.priceIntent === 'CHEAP' &&
    result.priceLevels !== null &&
    result.priceLevels[0] === 1 &&
    result.priceLevels[1] === 2;

  console.log('  Raw LLM JSON (snapshot):');
  console.log('  ' + JSON.stringify(expectedRawJSON, null, 2).replace(/\n/g, '\n  '));
  console.log();
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'} - English "affordable" correctly extracted as CHEAP`);
  
  if (!pass) {
    process.exit(1);
  }
}

console.log('\n' + '─'.repeat(50));
console.log('✅ All Hebrew price snapshot tests passed!');
process.exit(0);
