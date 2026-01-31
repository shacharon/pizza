/**
 * Unit Tests: Cuisine Enforcer - BOOST-Only Mode
 * 
 * Tests that cuisine enforcement NEVER filters results:
 * - Always uses BOOST mode (score-based ranking)
 * - Returns ALL places with cuisineScores (0-1)
 * - Fast path for small result sets (<=3)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeCuisineEnforcement, type CuisineEnforcerInput } from '../cuisine-enforcer.service.js';
import type { PlaceInput } from '../cuisine-enforcer.schema.js';
import type { LLMProvider } from '../../../../../../llm/types.js';

// Mock LLM provider
function createMockLLM(mockResponse: any): LLMProvider {
  return {
    completeJSON: async () => ({ data: mockResponse })
  } as any;
}

// Helper: Create mock places
function createMockPlaces(count: number, prefix: string = 'Place'): PlaceInput[] {
  return Array.from({ length: count }, (_, i) => ({
    placeId: `place_${prefix}_${i + 1}`,
    name: `${prefix} ${i + 1}`,
    types: ['restaurant'],
    address: `Address ${i + 1}`,
    rating: 4.0 + (i % 10) * 0.1,
    userRatingsTotal: 100 + i * 10
  }));
}

describe('Cuisine Enforcer - BOOST Mode: Always Returns All Places with Scores', () => {
  it('should return all places with cuisine scores', async () => {
    const places = createMockPlaces(20, 'Asian');

    // Mock LLM to return scores for all places
    const mockLLM = createMockLLM({
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: Object.fromEntries(
        places.map((p, i) => [p.placeId, 0.9 - i * 0.02])
      )
    });

    const input: CuisineEnforcerInput = {
      requiredTerms: ['אסייתית', 'אסיה'],
      preferredTerms: ['סיני', 'תאילנדי'],
      strictness: 'STRICT',
      places,
      hardConstraintsExist: true
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-boost-1');

    // Should keep ALL places (BOOST mode, no filtering)
    assert.strictEqual(result.keepPlaceIds.length, 20, 'Should keep all 20 places in BOOST mode');
    assert.ok(result.cuisineScores, 'Should have cuisine scores');
    assert.strictEqual(Object.keys(result.cuisineScores).length, 20, 'Should have scores for all places');
  });

  it('should return all places with scores (meat/dairy cuisine)', async () => {
    const places = createMockPlaces(18, 'Meat');

    const mockLLM = createMockLLM({
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: Object.fromEntries(
        places.map((p, i) => [p.placeId, 0.85 - i * 0.03])
      )
    });

    const input: CuisineEnforcerInput = {
      requiredTerms: ['בשרים', 'meat'],
      preferredTerms: [],
      strictness: 'STRICT',
      places,
      hardConstraintsExist: true
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-boost-2');

    assert.strictEqual(result.keepPlaceIds.length, 18, 'Should keep all 18 places');
    assert.ok(result.cuisineScores);
  });
});

describe('Cuisine Enforcer - Fast Path: Small Result Sets Skip LLM', () => {
  it('should skip LLM for small result sets (<=3 places)', async () => {
    const places = createMockPlaces(3, 'Restaurant');

    // Mock should never be called
    let llmCalled = false;
    const mockLLM = {
      completeJSON: async () => {
        llmCalled = true;
        throw new Error('LLM should not be called for <=3 places');
      }
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['איטלקית'],
      preferredTerms: ['פסטה', 'פיצה'],
      strictness: 'STRICT',
      places,
      hardConstraintsExist: false
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-fast-path');

    // Should return all places without calling LLM
    assert.strictEqual(result.keepPlaceIds.length, 3, 'Should keep all 3 places');
    assert.strictEqual(llmCalled, false, 'LLM should NOT be called for small sets');
    assert.ok(result.cuisineScores !== undefined, 'Should have cuisineScores (empty or neutral)');
  });

  it('should call LLM for 4+ places', async () => {
    const places = createMockPlaces(4, 'Italian');

    let llmCalled = false;
    const mockLLM = {
      completeJSON: async () => {
        llmCalled = true;
        return {
          data: {
            keepPlaceIds: places.map(p => p.placeId),
            relaxApplied: false,
            relaxStrategy: 'none',
            cuisineScores: Object.fromEntries(
              places.map((p, i) => [p.placeId, 0.8 - i * 0.1])
            )
          }
        };
      }
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['איטלקית'],
      preferredTerms: [],
      strictness: 'STRICT',
      places,
      hardConstraintsExist: false
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-llm-path');

    assert.strictEqual(llmCalled, true, 'LLM should be called for 4+ places');
    assert.strictEqual(result.keepPlaceIds.length, 4);
  });
});

describe('Cuisine Enforcer - BOOST Mode: Generic City Search Maintains All Results', () => {
  it('should maintain all results for generic city search', async () => {
    const places = createMockPlaces(20, 'TelAviv');

    const mockLLM = createMockLLM({
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: Object.fromEntries(
        places.map((p, i) => [p.placeId, 0.7 - i * 0.01])
      )
    });

    const input: CuisineEnforcerInput = {
      requiredTerms: ['אסייתית'],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      places
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-city-1');

    assert.strictEqual(result.keepPlaceIds.length, 20, 'Should keep all 20 in BOOST mode');
    assert.ok(result.cuisineScores);
  });

  it('should maintain all results even with low cuisine scores', async () => {
    const places = createMockPlaces(15, 'Mixed');

    const mockLLM = createMockLLM({
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: Object.fromEntries(
        // Low scores for most places
        places.map((p, i) => [p.placeId, i < 3 ? 0.8 : 0.2])
      )
    });

    const input: CuisineEnforcerInput = {
      requiredTerms: ['איטלקית'],
      preferredTerms: [],
      strictness: 'RELAX_IF_EMPTY',
      places
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-low-scores');

    // Should keep all places (BOOST doesn't filter)
    assert.strictEqual(result.keepPlaceIds.length, 15, 'Should keep all places regardless of scores');
    assert.ok(result.cuisineScores);
  });
});

describe('Cuisine Enforcer - BOOST Mode: Always Score-Only, Never Filter', () => {
  it('should always return all places with scores', async () => {
    const places = createMockPlaces(20, 'Italian');

    const mockLLM = createMockLLM({
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: Object.fromEntries(
        places.map((p, i) => [p.placeId, 0.8 - i * 0.02])
      )
    });

    const input: CuisineEnforcerInput = {
      requiredTerms: ['איטלקית'],
      preferredTerms: [],
      strictness: 'STRICT',
      places,
      hardConstraintsExist: false
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-always-boost');

    // Should always use BOOST mode (return all with scores)
    assert.strictEqual(result.keepPlaceIds.length, 20, 'Should keep all places');
    assert.ok(result.cuisineScores, 'Should always have scores (BOOST mode)');
  });

  it('should always return all places regardless of constraints', async () => {
    const places = createMockPlaces(18, 'Asian');

    const mockLLM = createMockLLM({
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none',
      cuisineScores: Object.fromEntries(
        places.map((p, i) => [p.placeId, 0.75])
      )
    });

    const input: CuisineEnforcerInput = {
      requiredTerms: ['אסייתית'],
      preferredTerms: [],
      strictness: 'STRICT',
      places,
      hardConstraintsExist: false
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'test-req-always-all');

    assert.strictEqual(result.keepPlaceIds.length, 18, 'Should keep all places');
    assert.ok(result.cuisineScores, 'Should always have scores');
  });
});
