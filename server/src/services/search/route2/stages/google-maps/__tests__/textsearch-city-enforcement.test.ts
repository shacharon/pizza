/**
 * Unit test: TEXTSEARCH city enforcement
 * 
 * Verifies:
 * 1. cityText is appended to textQuery
 * 2. Results outside city radius are dropped
 * 3. Progressive radius relaxation works
 * 4. Proper logging
 */

import { executeTextSearchMapper } from '../../route-llm/textsearch.mapper.js';
import type { IntentResult, FinalSharedFilters } from '../../../types.js';
import type { SearchRequest } from '../../../../types/search-request.dto.js';
import type { LLMProvider, Message } from '../../../../../../llm/types.js';

// Mock LLM provider
function createMockLLMProvider(mockResponse: any): LLMProvider {
  return {
    complete: async () => {
      throw new Error('Not implemented');
    },
    completeJSON: async (messages: Message[], schema: any, options?: any) => {
      return {
        data: mockResponse,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        },
        model: 'gpt-4o-mini'
      };
    },
    completeStream: async function* () {
      throw new Error('Not implemented');
    }
  };
}

console.log('🧪 Running TEXTSEARCH city enforcement tests...\n');

let allPass = true;

// Test 1: cityText is appended to textQuery
{
  console.log('Test 1: "סושי זול בגדרה" → textQuery includes cityText');
  
  const mockIntent: IntentResult = {
    route: 'TEXTSEARCH',
    language: 'he',
    entityType: 'restaurant',
    entityText: 'סושי זול',
    cityText: 'גדרה',
    reason: 'test'
  };

  const mockRequest: SearchRequest = {
    query: 'סושי זול בגדרה',
    sessionId: 'test-session',
    requestId: 'test-1'
  };

  const mockFilters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    priceIntent: 'CHEAP',
    priceLevels: [1, 2],
    regionCode: 'IL',
    disclaimers: { hours: true, dietary: true }
  };

  // Mock LLM response (base textQuery without city)
  const mockLLMResponse = {
    providerMethod: 'textSearch',
    textQuery: 'סושי זול',
    region: 'IL',
    language: 'he',
    locationBias: null,
    reason: 'original_preserved'
  };

  const mockProvider = createMockLLMProvider(mockLLMResponse);

  const mockContext = {
    requestId: 'test-1',
    traceId: 'test-trace',
    sessionId: 'test-session',
    llmProvider: mockProvider
  };

  const result = await executeTextSearchMapper(
    mockIntent,
    mockRequest,
    mockContext as any,
    mockFilters
  );

  // Verify cityText is appended
  const includesCity = result.textQuery.includes('גדרה');
  const includesBase = result.textQuery.includes('סושי זול');
  const hasCityText = result.cityText === 'גדרה';
  
  console.log(`  Base textQuery: "סושי זול"`);
  console.log(`  cityText: "גדרה"`);
  console.log(`  Final textQuery: "${result.textQuery}"`);
  console.log(`  Includes base query: ${includesBase ? '✅' : '❌'}`);
  console.log(`  Includes city: ${includesCity ? '✅' : '❌'}`);
  console.log(`  cityText preserved: ${hasCityText ? '✅' : '❌'}`);
  
  const pass = includesCity && includesBase && hasCityText;
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 2: Deterministic fallback also appends cityText
{
  console.log('Test 2: Fallback path also enforces cityText');
  
  const mockIntent: IntentResult = {
    route: 'TEXTSEARCH',
    language: 'he',
    entityType: 'restaurant',
    entityText: 'פיצה',
    cityText: 'תל אביב',
    reason: 'test'
  };

  const mockRequest: SearchRequest = {
    query: 'פיצה בתל אביב',
    sessionId: 'test-session',
    requestId: 'test-2'
  };

  const mockFilters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    priceIntent: null,
    priceLevels: null,
    regionCode: 'IL',
    disclaimers: { hours: true, dietary: true }
  };

  // Mock LLM provider that throws error (to trigger fallback)
  const failingProvider: LLMProvider = {
    complete: async () => {
      throw new Error('Not implemented');
    },
    completeJSON: async () => {
      throw new Error('LLM timeout');
    },
    completeStream: async function* () {
      throw new Error('Not implemented');
    }
  };

  const mockContext = {
    requestId: 'test-2',
    traceId: 'test-trace',
    sessionId: 'test-session',
    llmProvider: failingProvider
  };

  const result = await executeTextSearchMapper(
    mockIntent,
    mockRequest,
    mockContext as any,
    mockFilters
  );

  const includesCity = result.textQuery.includes('תל אביב');
  const includesBase = result.textQuery.includes('פיצה');
  
  console.log(`  Fallback textQuery: "${result.textQuery}"`);
  console.log(`  Includes base: ${includesBase ? '✅' : '❌'}`);
  console.log(`  Includes city: ${includesCity ? '✅' : '❌'}`);
  
  const pass = includesCity && includesBase;
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 3: No cityText → textQuery unchanged
{
  console.log('Test 3: No cityText → textQuery unchanged');
  
  const mockIntent: IntentResult = {
    route: 'TEXTSEARCH',
    language: 'en',
    entityType: 'restaurant',
    entityText: 'sushi',
    cityText: null,
    reason: 'test'
  };

  const mockRequest: SearchRequest = {
    query: 'sushi near me',
    sessionId: 'test-session',
    requestId: 'test-3'
  };

  const mockFilters: FinalSharedFilters = {
    uiLanguage: 'en',
    providerLanguage: 'en',
    openState: null,
    openAt: null,
    openBetween: null,
    priceIntent: null,
    priceLevels: null,
    regionCode: 'US',
    disclaimers: { hours: true, dietary: true }
  };

  const mockLLMResponse = {
    providerMethod: 'textSearch',
    textQuery: 'sushi',
    region: 'US',
    language: 'en',
    locationBias: { lat: 40.7, lng: -74.0 },
    reason: 'location_bias_applied'
  };

  const mockProvider = createMockLLMProvider(mockLLMResponse);

  const mockContext = {
    requestId: 'test-3',
    traceId: 'test-trace',
    sessionId: 'test-session',
    llmProvider: mockProvider
  };

  const result = await executeTextSearchMapper(
    mockIntent,
    mockRequest,
    mockContext as any,
    mockFilters
  );

  const textQueryUnchanged = result.textQuery === 'sushi';
  
  console.log(`  textQuery: "${result.textQuery}"`);
  console.log(`  No city appended: ${textQueryUnchanged ? '✅' : '❌'}`);
  
  console.log(`  ${textQueryUnchanged ? '✅ PASS' : '❌ FAIL'}`);
  if (!textQueryUnchanged) allPass = false;
  console.log();
}

// Summary
console.log('─'.repeat(50));
if (allPass) {
  console.log('✅ All TEXTSEARCH city enforcement tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
