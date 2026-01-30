/**
 * Cuisine Enforcer Tests
 * Validates LLM-based post-Google filtering for explicit cuisine queries
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executeCuisineEnforcement, type CuisineEnforcerInput } from './cuisine-enforcer.service.js';
import type { LLMProvider } from '../../../../../llm/types.js';
import type { PlaceInput } from './cuisine-enforcer.schema.js';

// Mock places data
const mockPlaces: PlaceInput[] = [
  {
    placeId: 'italian-1',
    name: 'Pasta Bar',
    types: ['italian_restaurant', 'restaurant'],
    address: 'Tel Aviv, Israel',
    rating: 4.5,
    userRatingsTotal: 100
  },
  {
    placeId: 'italian-2',
    name: 'Pizza Roma',
    types: ['pizza_restaurant', 'restaurant'],
    address: 'Tel Aviv, Israel',
    rating: 4.3,
    userRatingsTotal: 80
  },
  {
    placeId: 'burger-1',
    name: 'Burger King',
    types: ['fast_food_restaurant', 'restaurant'],
    address: 'Tel Aviv, Israel',
    rating: 3.8,
    userRatingsTotal: 200
  },
  {
    placeId: 'sushi-1',
    name: 'Sushi Bar',
    types: ['japanese_restaurant', 'restaurant'],
    address: 'Tel Aviv, Israel',
    rating: 4.7,
    userRatingsTotal: 150
  }
];

describe('Cuisine Enforcer - LLM-based filtering', () => {
  it('should keep only Italian restaurants when STRICT mode with "Italian" required', async () => {
    // Mock LLM provider
    const mockLLM: LLMProvider = {
      completeJSON: mock.fn(async () => ({
        keepPlaceIds: ['italian-1', 'italian-2'],
        relaxApplied: false,
        relaxStrategy: 'none'
      }))
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['Italian', 'איטלקית'],
      preferredTerms: ['pasta', 'pizza'],
      strictness: 'STRICT',
      places: mockPlaces
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-request-1');

    assert.strictEqual(result.keepPlaceIds.length, 2, 'Should keep 2 Italian places');
    assert.ok(result.keepPlaceIds.includes('italian-1'), 'Should include Pasta Bar');
    assert.ok(result.keepPlaceIds.includes('italian-2'), 'Should include Pizza Roma');
    assert.strictEqual(result.relaxApplied, false, 'Should not apply relaxation');
  });

  it('should apply relaxation when STRICT returns < 5 results', async () => {
    // Mock LLM provider - simulates strict filtering with relaxation fallback
    const mockLLM: LLMProvider = {
      completeJSON: mock.fn(async () => ({
        keepPlaceIds: ['italian-1', 'italian-2', 'pizza-related-place'],
        relaxApplied: true,
        relaxStrategy: 'fallback_preferred'
      }))
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['Italian'],
      preferredTerms: ['pizza'],
      strictness: 'STRICT',
      places: mockPlaces
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-request-2');

    assert.strictEqual(result.relaxApplied, true, 'Should apply relaxation');
    assert.strictEqual(result.relaxStrategy, 'fallback_preferred', 'Should use fallback_preferred strategy');
  });

  it('should keep all places when RELAX_IF_EMPTY with no required terms', async () => {
    const input: CuisineEnforcerInput = {
      requiredTerms: [],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      places: mockPlaces
    };

    // Should early-exit without calling LLM
    const mockLLM: LLMProvider = {
      completeJSON: mock.fn(async () => {
        throw new Error('Should not call LLM');
      })
    } as any;

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-request-3');

    assert.strictEqual(result.keepPlaceIds.length, mockPlaces.length, 'Should keep all places');
    assert.strictEqual(result.relaxApplied, false, 'Should not apply relaxation');
    assert.strictEqual((mockLLM.completeJSON as any).mock.calls.length, 0, 'Should not call LLM');
  });

  it('should return empty when no places provided', async () => {
    const mockLLM: LLMProvider = {
      completeJSON: mock.fn()
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['Italian'],
      preferredTerms: [],
      strictness: 'STRICT',
      places: []
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-request-4');

    assert.strictEqual(result.keepPlaceIds.length, 0, 'Should return empty');
    assert.strictEqual(result.relaxApplied, false, 'Should not apply relaxation');
    assert.strictEqual((mockLLM.completeJSON as any).mock.calls.length, 0, 'Should not call LLM for empty input');
  });

  it('should fail gracefully and return all places on LLM error', async () => {
    // Mock LLM provider that throws error
    const mockLLM: LLMProvider = {
      completeJSON: mock.fn(async () => {
        throw new Error('LLM timeout');
      })
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['Italian'],
      preferredTerms: [],
      strictness: 'STRICT',
      places: mockPlaces
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-request-5');

    // Should fail gracefully and return all places
    assert.strictEqual(result.keepPlaceIds.length, mockPlaces.length, 'Should return all places on error');
    assert.strictEqual(result.relaxApplied, false, 'Should not apply relaxation on error');
  });
});
