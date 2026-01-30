/**
 * Cuisine Enforcer - Example Test
 * Demonstrates the full flow with a realistic Italian restaurant query
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { executeCuisineEnforcement, type CuisineEnforcerInput } from './cuisine-enforcer.service.js';
import type { LLMProvider } from '../../../../../llm/types.js';
import type { PlaceInput } from './cuisine-enforcer.schema.js';

describe('Cuisine Enforcer - Real-world Example', () => {
  it('should filter Italian restaurants from mixed Google results (Hebrew query)', async () => {
    // SCENARIO: User searches "מסעדות איטלקיות בגדרה" (Italian restaurants in Gedera)
    // Google returns 25 places (Italian + other cuisines mixed)
    
    const googleMixedResults: PlaceInput[] = [
      // Italian restaurants (should KEEP)
      { placeId: '1', name: 'פסטה בר', types: ['italian_restaurant'], address: 'גדרה', rating: 4.5, userRatingsTotal: 100 },
      { placeId: '2', name: 'פיצה רומא', types: ['pizza_restaurant'], address: 'גדרה', rating: 4.3, userRatingsTotal: 80 },
      { placeId: '3', name: 'טרטוריה איטלקית', types: ['italian_restaurant'], address: 'גדרה', rating: 4.6, userRatingsTotal: 120 },
      
      // Non-Italian restaurants (should REJECT)
      { placeId: '4', name: 'בורגר קינג', types: ['fast_food_restaurant'], address: 'גדרה', rating: 3.8, userRatingsTotal: 200 },
      { placeId: '5', name: 'סושי בר', types: ['japanese_restaurant'], address: 'גדרה', rating: 4.7, userRatingsTotal: 150 },
      { placeId: '6', name: 'מסעדת בשרים', types: ['steakhouse'], address: 'גדרה', rating: 4.4, userRatingsTotal: 90 },
      { placeId: '7', name: 'פלאפל הדוד', types: ['middle_eastern_restaurant'], address: 'גדרה', rating: 4.2, userRatingsTotal: 110 },
    ];

    // Mock LLM response - simulates intelligent filtering
    const mockLLM: LLMProvider = {
      completeJSON: mock.fn(async (_messages, _schema, _options) => {
        // LLM analyzes each place:
        // - "פסטה בר" (Pasta Bar) + italian_restaurant type = STRONG MATCH
        // - "פיצה רומא" (Pizza Roma) + pizza_restaurant type = STRONG MATCH
        // - "טרטוריה איטלקית" (Italian Trattoria) + italian_restaurant type = STRONG MATCH
        // - Others: No Italian signals in name/types = REJECT
        
        return {
          keepPlaceIds: ['1', '2', '3'],  // Best-first order
          relaxApplied: false,
          relaxStrategy: 'none'
        };
      })
    } as any;

    // Input from route-llm mapper
    const input: CuisineEnforcerInput = {
      requiredTerms: ['איטלקית', 'איטלקי'],  // LLM extracted from query
      preferredTerms: ['פסטה', 'פיצה'],      // Related terms
      strictness: 'STRICT',                   // Explicit cuisine = STRICT
      places: googleMixedResults
    };

    // Execute enforcement
    const result = await executeCuisineEnforcement(input, mockLLM, 'req-italian-gedera');

    // Assertions
    assert.strictEqual(result.keepPlaceIds.length, 3, 'Should keep only 3 Italian restaurants');
    assert.deepStrictEqual(result.keepPlaceIds, ['1', '2', '3'], 'Should keep Italian places in best-first order');
    assert.strictEqual(result.relaxApplied, false, 'Should not need relaxation (>= 5 not required for good results)');
    assert.strictEqual(result.relaxStrategy, 'none', 'No relaxation strategy used');

    // Verify LLM was called with correct context
    const llmCalls = (mockLLM.completeJSON as any).mock.calls;
    assert.strictEqual(llmCalls.length, 1, 'Should call LLM exactly once');
    
    // Verify LLM received all places for analysis
    const [messages] = llmCalls[0];
    const userPrompt = messages[1].content;
    assert.ok(userPrompt.includes('פסטה בר'), 'Should pass Pasta Bar to LLM');
    assert.ok(userPrompt.includes('בורגר קינג'), 'Should pass Burger King to LLM');
    assert.ok(userPrompt.includes('Required Terms: ["איטלקית","איטלקי"]'), 'Should pass required terms');
  });

  it('should apply relaxation when strict filtering yields < 5 results', async () => {
    // SCENARIO: User searches "מסעדות סושי בעיר קטנה" but Google only returns 3 strict matches
    
    const limitedResults: PlaceInput[] = [
      // Strict sushi matches
      { placeId: '1', name: 'סושי בר', types: ['japanese_restaurant'], address: 'עיר', rating: 4.7 },
      { placeId: '2', name: 'יפני מסורתי', types: ['japanese_restaurant'], address: 'עיר', rating: 4.5 },
      
      // Related Asian (could include in relaxation)
      { placeId: '3', name: 'אסייתי פיוז\'ן', types: ['asian_fusion_restaurant'], address: 'עיר', rating: 4.4 },
      { placeId: '4', name: 'תאילנדי', types: ['thai_restaurant'], address: 'עיר', rating: 4.3 },
    ];

    const mockLLM: LLMProvider = {
      completeJSON: mock.fn(async () => {
        // LLM first tries STRICT: only 2 places match "sushi"
        // Applies relaxation: fallback to preferredTerms (Asian cuisine)
        return {
          keepPlaceIds: ['1', '2', '3', '4'],  // Expanded to include Asian
          relaxApplied: true,
          relaxStrategy: 'fallback_preferred'
        };
      })
    } as any;

    const input: CuisineEnforcerInput = {
      requiredTerms: ['sushi', 'סושי'],
      preferredTerms: ['japanese', 'asian', 'אסייתי'],
      strictness: 'STRICT',
      places: limitedResults
    };

    const result = await executeCuisineEnforcement(input, mockLLM, 'req-sushi-small-city');

    assert.strictEqual(result.keepPlaceIds.length, 4, 'Should keep 4 places after relaxation');
    assert.strictEqual(result.relaxApplied, true, 'Should apply relaxation');
    assert.strictEqual(result.relaxStrategy, 'fallback_preferred', 'Should use preferred terms fallback');
  });
});
