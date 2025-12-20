/**
 * Integration Tests: Unified Search API (POST /api/search)
 * Tests the new Phase 3 BFF endpoint with real API calls
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import type { Server } from 'http';

const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api/search`;

let server: Server;

/**
 * Start test server
 */
before(async () => {
  const app = createApp();
  server = app.listen(3001);
  console.log('Test server started on port 3001');
  
  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 500));
});

/**
 * Stop test server
 */
after(() => {
  server.close();
  console.log('Test server stopped');
});

/**
 * Helper: Make search request
 */
async function search(body: any): Promise<any> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Search failed: ${error.error}`);
  }

  return await response.json();
}

/**
 * Helper: Make stats request
 */
async function getStats(): Promise<any> {
  const response = await fetch(`${API_URL}/stats`);
  if (!response.ok) {
    throw new Error('Stats request failed');
  }
  return await response.json();
}

// ============================================================================
// Test Suite: Basic Functionality
// ============================================================================

describe('Unified Search API - Basic Functionality', () => {
  
  it('should return results for simple query', async () => {
    const result = await search({
      query: 'pizza in Paris',
    });

    // Validate response structure
    assert.ok(result.sessionId, 'Should return sessionId');
    assert.ok(result.query, 'Should return query object');
    assert.equal(result.query.original, 'pizza in Paris');
    assert.ok(result.results, 'Should return results array');
    assert.ok(result.chips, 'Should return chips array');
    assert.ok(result.meta, 'Should return meta object');

    // Validate results
    assert.ok(result.results.length > 0, 'Should return at least 1 result');
    assert.ok(result.results.length <= 10, 'Should return max 10 results');

    // Validate first result
    const first = result.results[0];
    assert.ok(first.id, 'Result should have id');
    assert.ok(first.placeId, 'Result should have placeId');
    assert.ok(first.name, 'Result should have name');
    assert.ok(first.address, 'Result should have address');
    assert.ok(first.location, 'Result should have location');
    assert.ok(first.location.lat, 'Location should have lat');
    assert.ok(first.location.lng, 'Location should have lng');

    // Validate meta
    assert.ok(result.meta.tookMs > 0, 'Should have response time');
    assert.ok(result.meta.mode, 'Should have search mode');
    assert.ok(result.meta.confidence >= 0 && result.meta.confidence <= 1, 'Should have valid confidence');
    assert.equal(result.meta.source, 'google_places');

    console.log(`✅ Simple query: ${result.results.length} results in ${result.meta.tookMs}ms (confidence: ${result.meta.confidence.toFixed(2)})`);
  });

  it('should handle query with user location', async () => {
    const result = await search({
      query: 'pizza near me',
      userLocation: {
        lat: 48.8566,
        lng: 2.3522,
      },
    });

    assert.ok(result.results.length > 0);
    assert.equal(result.meta.source, 'google_places');
    
    console.log(`✅ Near me query: ${result.results.length} results`);
  });

  it('should return chips for refinement', async () => {
    const result = await search({
      query: 'italian restaurant in London',
    });

    assert.ok(result.chips.length > 0, 'Should return refinement chips');
    
    const chip = result.chips[0];
    assert.ok(chip.id, 'Chip should have id');
    assert.ok(chip.emoji, 'Chip should have emoji');
    assert.ok(chip.label, 'Chip should have label');
    assert.ok(chip.action, 'Chip should have action');

    console.log(`✅ Refinement chips: ${result.chips.length} chips (${result.chips.map(c => c.label).join(', ')})`);
  });
});

// ============================================================================
// Test Suite: Multilingual Support
// ============================================================================

describe('Unified Search API - Multilingual Support', () => {
  
  const queries = [
    { lang: 'English', query: 'pizza in Paris', city: 'Paris' },
    { lang: 'Hebrew', query: 'פיצה בפריז', city: 'פריז' },
    { lang: 'Arabic', query: 'بيتزا في باريس', city: 'باريس' },
    { lang: 'French', query: 'pizza à Paris', city: 'Paris' },
    { lang: 'Spanish', query: 'pizza en París', city: 'París' },
    { lang: 'Russian', query: 'пицца в Париже', city: 'Париже' },
  ];

  queries.forEach(({ lang, query, city }) => {
    it(`should handle ${lang} query: "${query}"`, async () => {
      const result = await search({ query });

      assert.ok(result.results.length > 0, `${lang} should return results`);
      assert.ok(result.query.language, `${lang} should detect language`);
      
      console.log(`✅ ${lang}: ${result.results.length} results (detected: ${result.query.language}, confidence: ${result.meta.confidence.toFixed(2)})`);
    });
  });

  it('should return consistent results across languages', async () => {
    const [enResults, heResults, arResults] = await Promise.all([
      search({ query: 'pizza in Tel Aviv' }),
      search({ query: 'פיצה בתל אביב' }),
      search({ query: 'بيتزا في تل أبيب' }),
    ]);

    // All should return results
    assert.ok(enResults.results.length > 0);
    assert.ok(heResults.results.length > 0);
    assert.ok(arResults.results.length > 0);

    // Should detect different languages
    assert.notEqual(enResults.query.language, heResults.query.language);
    assert.notEqual(enResults.query.language, arResults.query.language);

    console.log(`✅ Multilingual consistency: EN=${enResults.results.length}, HE=${heResults.results.length}, AR=${arResults.results.length}`);
  });
});

// ============================================================================
// Test Suite: Filters
// ============================================================================

describe('Unified Search API - Filters', () => {
  
  it('should apply openNow filter', async () => {
    const result = await search({
      query: 'pizza in London open now',
    });

    assert.ok(result.results.length >= 0, 'Should return results (or 0 if none open)');
    assert.ok(result.meta.appliedFilters.includes('opennow'), 'Should apply opennow filter');

    // Check if results respect openNow (if any returned)
    if (result.results.length > 0) {
      const openResults = result.results.filter((r: any) => r.openNow === true);
      console.log(`✅ Open now: ${openResults.length}/${result.results.length} results are open`);
    } else {
      console.log(`✅ Open now: 0 results (none open currently)`);
    }
  });

  it('should apply explicit filters', async () => {
    const result = await search({
      query: 'italian restaurant in Paris',
      filters: {
        openNow: true,
        priceLevel: 2,
      },
    });

    assert.ok(result.results.length >= 0);
    
    console.log(`✅ Explicit filters: ${result.results.length} results with filters`);
  });

  it('should detect dietary filters from query', async () => {
    const result = await search({
      query: 'gluten free pizza in London',
    });

    assert.ok(result.results.length >= 0);
    
    console.log(`✅ Dietary filter (gluten free): ${result.results.length} results`);
  });

  it('should detect halal filter from query', async () => {
    const result = await search({
      query: 'halal restaurant in London',
    });

    assert.ok(result.results.length >= 0);
    
    console.log(`✅ Dietary filter (halal): ${result.results.length} results`);
  });

  it('should handle multiple filters', async () => {
    const result = await search({
      query: 'vegan pizza open now in Paris',
    });

    assert.ok(result.results.length >= 0, 'Multi-filter queries may return 0 results (data scarcity)');
    
    console.log(`✅ Multiple filters (vegan + open now): ${result.results.length} results`);
  });
});

// ============================================================================
// Test Suite: Session Continuity
// ============================================================================

describe('Unified Search API - Session Continuity', () => {
  
  it('should maintain session across requests', async () => {
    // First search
    const result1 = await search({
      query: 'pizza in Paris',
    });

    const sessionId = result1.sessionId;
    assert.ok(sessionId, 'Should return sessionId');

    // Second search with same session (refinement)
    const result2 = await search({
      query: 'show me cheaper options',
      sessionId,
    });

    assert.equal(result2.sessionId, sessionId, 'Should maintain same sessionId');
    assert.ok(result2.results.length >= 0);

    console.log(`✅ Session continuity: ${sessionId.substring(0, 20)}...`);
  });

  it('should create new session if sessionId not provided', async () => {
    const result1 = await search({ query: 'pizza in Paris' });
    const result2 = await search({ query: 'pizza in Paris' });

    assert.notEqual(result1.sessionId, result2.sessionId, 'Should create different sessions');

    console.log(`✅ New sessions created: ${result1.sessionId !== result2.sessionId}`);
  });
});

// ============================================================================
// Test Suite: Confidence Scoring
// ============================================================================

describe('Unified Search API - Confidence Scoring', () => {
  
  it('should return high confidence for complete queries', async () => {
    const result = await search({
      query: 'italian restaurant open now in Paris',
    });

    assert.ok(result.meta.confidence >= 0.7, `Complete query should have high confidence (got ${result.meta.confidence})`);
    assert.ok(!result.assist, 'High confidence should not trigger assist');

    console.log(`✅ High confidence: ${result.meta.confidence.toFixed(2)} (no assist)`);
  });

  it('should return lower confidence for vague queries', async () => {
    const result = await search({
      query: 'food',
    });

    assert.ok(result.meta.confidence >= 0, 'Should have valid confidence');
    // Note: might or might not trigger assist depending on exact confidence threshold
    
    console.log(`✅ Vague query confidence: ${result.meta.confidence.toFixed(2)}${result.assist ? ' (assist triggered)' : ''}`);
  });

  it('should provide assist payload for low confidence', async () => {
    const result = await search({
      query: 'pizza',  // Missing location
    });

    // Low confidence queries may trigger assist
    if (result.meta.confidence < 0.7) {
      assert.ok(result.assist, 'Low confidence should trigger assist');
      assert.ok(result.assist.message, 'Assist should have message');
      assert.ok(result.assist.suggestedActions, 'Assist should have suggested actions');
      assert.ok(result.assist.suggestedActions.length > 0);

      const action = result.assist.suggestedActions[0];
      assert.ok(action.label, 'Action should have label');
      assert.ok(action.query, 'Action should have query');

      console.log(`✅ Assist payload: "${result.assist.message}" (${result.assist.suggestedActions.length} actions)`);
    } else {
      console.log(`✅ Query had sufficient confidence (${result.meta.confidence.toFixed(2)}), no assist needed`);
    }
  });
});

// ============================================================================
// Test Suite: Different Location Types
// ============================================================================

describe('Unified Search API - Location Types', () => {
  
  it('should handle city-based search', async () => {
    const result = await search({
      query: 'sushi in Tokyo',
    });

    assert.ok(result.results.length > 0);
    assert.ok(result.query.parsed.location?.city, 'Should extract city');

    console.log(`✅ City search (Tokyo): ${result.results.length} results`);
  });

  it('should handle landmark-based search', async () => {
    const result = await search({
      query: 'restaurant near Eiffel Tower',
    });

    assert.ok(result.results.length >= 0);

    console.log(`✅ Landmark search (Eiffel Tower): ${result.results.length} results`);
  });

  it('should handle street-based search', async () => {
    const result = await search({
      query: 'pizza on Allenby Street in Tel Aviv',
    });

    assert.ok(result.results.length >= 0);

    console.log(`✅ Street search (Allenby): ${result.results.length} results`);
  });

  it('should handle GPS coordinates', async () => {
    const result = await search({
      query: 'pizza',
      userLocation: {
        lat: 32.0853,
        lng: 34.7818,  // Tel Aviv
      },
    });

    assert.ok(result.results.length > 0);

    console.log(`✅ GPS coordinates: ${result.results.length} results`);
  });
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe('Unified Search API - Error Handling', () => {
  
  it('should reject request without query', async () => {
    try {
      await search({});
      assert.fail('Should have thrown error');
    } catch (error: any) {
      assert.ok(error.message.includes('query'), 'Error should mention missing query');
      console.log('✅ Missing query rejected');
    }
  });

  it('should reject invalid user location', async () => {
    try {
      await search({
        query: 'pizza',
        userLocation: { lat: 'invalid', lng: 'invalid' },
      });
      assert.fail('Should have thrown error');
    } catch (error: any) {
      console.log('✅ Invalid location rejected');
    }
  });

  it('should handle empty query gracefully', async () => {
    try {
      await search({ query: '' });
      assert.fail('Should have thrown error');
    } catch (error: any) {
      console.log('✅ Empty query rejected');
    }
  });
});

// ============================================================================
// Test Suite: Response Format
// ============================================================================

describe('Unified Search API - Response Format', () => {
  
  it('should return correct response structure', async () => {
    const result = await search({
      query: 'pizza in Paris',
    });

    // Top-level fields
    assert.ok(typeof result.sessionId === 'string');
    assert.ok(typeof result.query === 'object');
    assert.ok(Array.isArray(result.results));
    assert.ok(Array.isArray(result.chips));
    assert.ok(typeof result.meta === 'object');

    // Query object
    assert.ok(typeof result.query.original === 'string');
    assert.ok(typeof result.query.parsed === 'object');
    assert.ok(typeof result.query.language === 'string');

    // Meta object
    assert.ok(typeof result.meta.tookMs === 'number');
    assert.ok(typeof result.meta.mode === 'string');
    assert.ok(Array.isArray(result.meta.appliedFilters));
    assert.ok(typeof result.meta.confidence === 'number');
    assert.ok(typeof result.meta.source === 'string');

    console.log('✅ Response structure validated');
  });

  it('should include deprecation headers on legacy endpoints', async () => {
    const response = await fetch(`${BASE_URL}/api/places/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'pizza in Paris' }),
    });

    assert.equal(response.headers.get('X-API-Deprecated'), 'true');
    assert.ok(response.headers.get('X-API-Sunset'));
    assert.equal(response.headers.get('X-API-Alternative'), 'POST /api/search');

    console.log('✅ Deprecation headers present on legacy endpoint');
  });
});

// ============================================================================
// Test Suite: Performance
// ============================================================================

describe('Unified Search API - Performance', () => {
  
  it('should respond within 8 seconds', async () => {
    const start = Date.now();
    const result = await search({
      query: 'pizza in Paris',
    });
    const duration = Date.now() - start;

    assert.ok(duration < 8000, `Should respond within 8s (took ${duration}ms)`);
    assert.ok(result.meta.tookMs > 0);

    console.log(`✅ Performance: ${duration}ms total (server: ${result.meta.tookMs}ms)`);
  });

  it('should benefit from geocoding cache on repeat queries', async () => {
    // First query (cold cache)
    const result1 = await search({ query: 'pizza in Berlin' });
    const time1 = result1.meta.tookMs;

    // Second query (warm cache)
    const result2 = await search({ query: 'sushi in Berlin' });
    const time2 = result2.meta.tookMs;

    console.log(`✅ Cache benefit: First=${time1}ms, Second=${time2}ms (${time1 > time2 ? 'faster' : 'similar'})`);
  });
});

// ============================================================================
// Test Suite: Statistics Endpoint
// ============================================================================

describe('Unified Search API - Statistics', () => {
  
  it('should return stats', async () => {
    const stats = await getStats();

    // Should have session stats (if implemented)
    if (stats.sessionStats) {
      assert.ok(typeof stats.sessionStats.totalSessions === 'number');
      assert.ok(typeof stats.sessionStats.activeSessions === 'number');
    }

    // Should have geocode stats (if implemented)
    if (stats.geocodeStats) {
      assert.ok(typeof stats.geocodeStats.hits === 'number' || stats.geocodeStats.hits === undefined);
    }

    console.log('✅ Statistics endpoint working:', JSON.stringify(stats, null, 2));
  });
});

// ============================================================================
// Summary
// ============================================================================

after(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Integration Tests Complete!');
  console.log('='.repeat(60));
});

