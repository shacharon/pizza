/**
 * Unit tests for base_filters price intent extraction
 * 
 * Tests:
 * - "סושי זול בגדרה" → priceIntent=CHEAP, priceLevels=[1,2]
 * - "מסעדה יקרה בתל אביב" → priceIntent=EXPENSIVE, priceLevels=[3,4]
 * - "פיצה בתל אביב" → priceIntent=null, priceLevels=null
 * - "cheap pizza near me" → priceIntent=CHEAP, priceLevels=[1,2]
 */

import { resolveBaseFiltersLLM } from '../base-filters-llm.js';
import type { LLMProvider } from '../../../../../llm/types.js';

// Mock LLM provider for testing
function createMockLLMProvider(mockResponse: any): LLMProvider {
  return {
    completeJSON: async () => ({
      data: mockResponse,
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      model: 'gpt-4o-mini'
    })
  } as any;
}

console.log('🧪 Running base_filters price intent extraction tests...\n');

let allPass = true;

// Test 1: "סושי זול בגדרה" → CHEAP
{
  console.log('Test 1: "סושי זול בגדרה" → priceIntent=CHEAP, priceLevels=[1,2]');
  
  const mockLLM = createMockLLMProvider({
    language: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'CHEAP',
    priceLevels: [1, 2]
  });

  const result = await resolveBaseFiltersLLM({
    query: 'סושי זול בגדרה',
    route: 'FULL',
    llmProvider: mockLLM,
    requestId: 'test-1'
  });

  const pass = result.priceIntent === 'CHEAP' && 
                JSON.stringify(result.priceLevels) === JSON.stringify([1, 2]);
  
  console.log(`  priceIntent: ${result.priceIntent}, priceLevels: ${JSON.stringify(result.priceLevels)}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 2: "מסעדה יקרה בתל אביב" → EXPENSIVE
{
  console.log('Test 2: "מסעדה יקרה בתל אביב" → priceIntent=EXPENSIVE, priceLevels=[3,4]');
  
  const mockLLM = createMockLLMProvider({
    language: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'EXPENSIVE',
    priceLevels: [3, 4]
  });

  const result = await resolveBaseFiltersLLM({
    query: 'מסעדה יקרה בתל אביב',
    route: 'FULL',
    llmProvider: mockLLM,
    requestId: 'test-2'
  });

  const pass = result.priceIntent === 'EXPENSIVE' && 
                JSON.stringify(result.priceLevels) === JSON.stringify([3, 4]);
  
  console.log(`  priceIntent: ${result.priceIntent}, priceLevels: ${JSON.stringify(result.priceLevels)}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 3: "פיצה בתל אביב" → null (no price words)
{
  console.log('Test 3: "פיצה בתל אביב" → priceIntent=null, priceLevels=null');
  
  const mockLLM = createMockLLMProvider({
    language: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: null,
    priceLevels: null
  });

  const result = await resolveBaseFiltersLLM({
    query: 'פיצה בתל אביב',
    route: 'FULL',
    llmProvider: mockLLM,
    requestId: 'test-3'
  });

  const pass = result.priceIntent === null && result.priceLevels === null;
  
  console.log(`  priceIntent: ${result.priceIntent}, priceLevels: ${result.priceLevels}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 4: "cheap pizza near me" → CHEAP
{
  console.log('Test 4: "cheap pizza near me" → priceIntent=CHEAP, priceLevels=[1,2]');
  
  const mockLLM = createMockLLMProvider({
    language: 'en',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'CHEAP',
    priceLevels: [1, 2]
  });

  const result = await resolveBaseFiltersLLM({
    query: 'cheap pizza near me',
    route: 'FULL',
    llmProvider: mockLLM,
    requestId: 'test-4'
  });

  const pass = result.priceIntent === 'CHEAP' && 
                JSON.stringify(result.priceLevels) === JSON.stringify([1, 2]);
  
  console.log(`  priceIntent: ${result.priceIntent}, priceLevels: ${JSON.stringify(result.priceLevels)}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 5: "moderate price sushi" → MID
{
  console.log('Test 5: "moderate price sushi" → priceIntent=MID, priceLevels=[2,3]');
  
  const mockLLM = createMockLLMProvider({
    language: 'en',
    openState: null,
    openAt: null,
    openBetween: null,
    regionHint: null,
    priceIntent: 'MID',
    priceLevels: [2, 3]
  });

  const result = await resolveBaseFiltersLLM({
    query: 'moderate price sushi',
    route: 'FULL',
    llmProvider: mockLLM,
    requestId: 'test-5'
  });

  const pass = result.priceIntent === 'MID' && 
                JSON.stringify(result.priceLevels) === JSON.stringify([2, 3]);
  
  console.log(`  priceIntent: ${result.priceIntent}, priceLevels: ${JSON.stringify(result.priceLevels)}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Summary
console.log('─'.repeat(50));
if (allPass) {
  console.log('✅ All price intent extraction tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
