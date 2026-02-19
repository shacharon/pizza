/**
 * Unit tests for post-results price level range filtering
 * 
 * Tests:
 * - No range → keep all
 * - null priceLevel → keep (unknown)
 * - priceLevel in range → keep
 * - priceLevel out of range → filter out
 */

import { applyPostFilters } from '../post-results.filter.js';
import type { FinalSharedFilters } from '../../shared/shared-filters.types.js';

// Helper to create mock place with priceLevel
function createMockPlace(id: string, priceLevel: number | null): any {
  return {
    id,
    placeId: id,
    source: 'google_places',
    name: `Restaurant ${id}`,
    address: 'Test Address',
    location: { lat: 32.0, lng: 34.0 },
    rating: 4.5,
    userRatingsTotal: 100,
    priceLevel,
    openNow: true,
    googleMapsUrl: `https://maps.google.com/?q=place_id:${id}`,
    tags: ['restaurant']
  };
}

// Helper to create mock filters with price range
function createMockFilters(priceLevelRange?: { min: number; max: number }): any {
  return {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    },
    priceLevelRange
  };
}

console.log('🧪 Running post-results price level range filter tests...\n');

let allPass = true;

// Test 1: No range → keep all
{
  console.log('Test 1: No priceLevelRange → keep all results');
  
  const results = [
    createMockPlace('r1', 1),
    createMockPlace('r2', 2),
    createMockPlace('r3', 3),
    createMockPlace('r4', null)
  ];

  const filters = createMockFilters(); // No priceLevelRange

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-1',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 4;
  console.log(`  Expected: 4, Got: ${output.resultsFiltered.length} - ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 2: Range 1-2 with results [1, 2, 3, null] → keep [1, 2, null]
{
  console.log('Test 2: Range 1-2 with [1, 2, 3, null] → keep [1, 2, null]');
  
  const results = [
    createMockPlace('r1', 1),
    createMockPlace('r2', 2),
    createMockPlace('r3', 3),
    createMockPlace('r4', null)
  ];

  const filters = createMockFilters({ min: 1, max: 2 });

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-2',
    pipelineVersion: 'route2'
  });

  const keptIds = output.resultsFiltered.map((r: any) => r.id).sort();
  const expectedIds = ['r1', 'r2', 'r4'].sort();
  const pass = JSON.stringify(keptIds) === JSON.stringify(expectedIds);
  
  console.log(`  Expected: [r1, r2, r4], Got: [${keptIds.join(', ')}] - ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 3: Range 2-3 with results [1, 2, 3, 4] → keep [2, 3]
{
  console.log('Test 3: Range 2-3 with [1, 2, 3, 4] → keep [2, 3]');
  
  const results = [
    createMockPlace('r1', 1),
    createMockPlace('r2', 2),
    createMockPlace('r3', 3),
    createMockPlace('r4', 4)
  ];

  const filters = createMockFilters({ min: 2, max: 3 });

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-3',
    pipelineVersion: 'route2'
  });

  const keptIds = output.resultsFiltered.map((r: any) => r.id).sort();
  const expectedIds = ['r2', 'r3'].sort();
  const pass = JSON.stringify(keptIds) === JSON.stringify(expectedIds);
  
  console.log(`  Expected: [r2, r3], Got: [${keptIds.join(', ')}] - ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 4: Range 3-4 with all null → keep all (unknown)
{
  console.log('Test 4: Range 3-4 with all null → keep all (unknown)');
  
  const results = [
    createMockPlace('r1', null),
    createMockPlace('r2', null),
    createMockPlace('r3', null)
  ];

  const filters = createMockFilters({ min: 3, max: 4 });

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-4',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3;
  console.log(`  Expected: 3, Got: ${output.resultsFiltered.length} - ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 5: Range 1-1 (exact) with [1, 2, null] → keep [1, null]
{
  console.log('Test 5: Range 1-1 (exact) with [1, 2, null] → keep [1, null]');
  
  const results = [
    createMockPlace('r1', 1),
    createMockPlace('r2', 2),
    createMockPlace('r3', null)
  ];

  const filters = createMockFilters({ min: 1, max: 1 });

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-5',
    pipelineVersion: 'route2'
  });

  const keptIds = output.resultsFiltered.map((r: any) => r.id).sort();
  const expectedIds = ['r1', 'r3'].sort();
  const pass = JSON.stringify(keptIds) === JSON.stringify(expectedIds);
  
  console.log(`  Expected: [r1, r3], Got: [${keptIds.join(', ')}] - ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Summary
console.log('─'.repeat(50));
if (allPass) {
  console.log('✅ All price level range filter tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
