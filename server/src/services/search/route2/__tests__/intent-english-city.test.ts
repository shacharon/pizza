/**
 * INTENT extraction for English patterns: "<food> in <place>", "restaurants in <place>", "near <place>"
 *
 * Verifies that for queries like "burger in gedera", "pizza in tel aviv", "sushi near haifa"
 * the intent stage returns route=TEXTSEARCH, reason=explicit_city_mentioned, cityText in title case.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context } from '../types.js';
import type { LLMProvider } from '../../../../llm/types.js';
import { executeIntentStage } from '../stages/intent/intent.stage.js';
import { INTENT_SYSTEM_PROMPT } from '../stages/intent/intent.prompt.js';

const ENGLISH_CITY_CASES: Array<{
  query: string;
  expectedCityText: string;
  description: string;
}> = [
  { query: 'burger in gedera', expectedCityText: 'Gedera', description: '"<food> in <place>"' },
  { query: 'pizza in tel aviv', expectedCityText: 'Tel Aviv', description: '"<food> in <place>" multi-word city' },
  { query: 'sushi near haifa', expectedCityText: 'Haifa', description: '"near <place>" city' }
];

function makeMockLLMProvider(returnIntent: {
  route: 'TEXTSEARCH';
  reason: string;
  cityText: string | null;
  language: string;
  regionCandidate: string;
  confidence: number;
  regionConfidence: number;
  regionReason: string;
  landmarkText: null;
  radiusMeters: null;
}): LLMProvider {
  return {
    completeJSON: async () => ({
      data: {
        route: returnIntent.route,
        confidence: returnIntent.confidence,
        reason: returnIntent.reason,
        language: returnIntent.language,
        regionCandidate: returnIntent.regionCandidate,
        regionConfidence: returnIntent.regionConfidence,
        regionReason: returnIntent.regionReason,
        cityText: returnIntent.cityText,
        landmarkText: returnIntent.landmarkText,
        radiusMeters: returnIntent.radiusMeters
      },
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    })
  } as LLMProvider;
}

function createRequest(query: string): SearchRequest {
  return { query, sessionId: 'test-session' };
}

function createContext(llmProvider: LLMProvider, userLocation?: { lat: number; lng: number } | null): Route2Context {
  return {
    requestId: 'test-req-id',
    startTime: Date.now(),
    llmProvider,
    userLocation: userLocation ?? null,
    userRegionCode: 'IL'
  };
}

describe('INTENT English city patterns', () => {
  describe('Prompt guidance', () => {
    it('should include English location patterns and title-case cityText in system prompt', () => {
      assert.ok(
        INTENT_SYSTEM_PROMPT.includes('explicit_city_mentioned'),
        'Prompt must mention explicit_city_mentioned'
      );
      assert.ok(
        INTENT_SYSTEM_PROMPT.includes('in <place>'),
        'Prompt must describe "<food> in <place>" pattern'
      );
      assert.ok(
        INTENT_SYSTEM_PROMPT.includes('near <place>'),
        'Prompt must describe "near <place>" pattern'
      );
      assert.ok(
        INTENT_SYSTEM_PROMPT.includes('title case') || INTENT_SYSTEM_PROMPT.includes('Gedera') || INTENT_SYSTEM_PROMPT.includes('Tel Aviv'),
        'Prompt must guide cityText title case or include examples'
      );
      assert.ok(
        INTENT_SYSTEM_PROMPT.includes('burger in gedera') || INTENT_SYSTEM_PROMPT.includes('Gedera'),
        'Prompt must include example for "burger in gedera" or cityText Gedera'
      );
    });
  });

  describe('Stage output for English city queries', () => {
    for (const { query, expectedCityText, description } of ENGLISH_CITY_CASES) {
      it(`${description}: "${query}" → route=TEXTSEARCH, reason=explicit_city_mentioned, cityText="${expectedCityText}"`, async () => {
        const mockLLM = makeMockLLMProvider({
          route: 'TEXTSEARCH',
          reason: 'explicit_city_mentioned',
          cityText: expectedCityText,
          language: 'en',
          regionCandidate: 'IL',
          confidence: 0.9,
          regionConfidence: 0.85,
          regionReason: 'explicit_city_in_query',
          landmarkText: null,
          radiusMeters: null
        });

        const request = createRequest(query);
        const ctx = createContext(mockLLM);

        const result = await executeIntentStage(request, ctx);

        assert.strictEqual(result.route, 'TEXTSEARCH', `route should be TEXTSEARCH for "${query}"`);
        assert.strictEqual(result.reason, 'explicit_city_mentioned', `reason should be explicit_city_mentioned for "${query}"`);
        assert.strictEqual(result.cityText, expectedCityText, `cityText should be "${expectedCityText}" for "${query}"`);
      });
    }
  });
});
