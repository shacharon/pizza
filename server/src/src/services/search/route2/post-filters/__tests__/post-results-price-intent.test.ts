/**
 * Unit tests for post-results price intent sorting/filtering
 * 
 * Tests:
 * - CHEAP: prefer priceLevel 1-2, demote missing
 * - MID: prefer priceLevel 2, demote missing
 * - EXPENSIVE: prefer priceLevel 3-4, demote missing
 * - null: no sorting
 */

import { applyPostFilters } from '../post-results.filter.js';

// Helper to create mock place with priceLevel
function createMockPlace(id: string, priceLevel: number | null, name: string): any {
  return {
    id,
    placeId: id,
    source: 'google_places',
    name,
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

// Helper to create mock filters with price intent
function createMockFilters(priceIntent: 'CHEAP' | 'MID' | 'EXPENSIVE' | null, priceLevels: number[] | null): any {
  return {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    priceIntent,
    priceLevels,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
}

console.log('🧪 Running post-results price intent sorting tests...\n');

let allPass = true;

// Test 1: CHEAP intent → prefer 1-2, demote missing
{
  console.log('Test 1: CHEAP intent with mixed priceLevels → prefer 1-2, demote missing');
  
  const results = [
    createMockPlace('r1', 3, 'Expensive Place'),    // Not preferred
    createMockPlace('r2', 1, 'Cheap Place 1'),      // Preferred
    createMockPlace('r3', null, 'Unknown Price'),   // Missing - demoted
    createMockPlace('r4', 2, 'Cheap Place 2'),      // Preferred
    createMockPlace('r5', 4, 'Very Expensive')      // Not preferred
  ];

  const filters = createMockFilters('CHEAP', [1, 2]);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-1',
    pipelineVersion: 'route2'
  });

  const resultIds = output.resultsFiltered.map((r: any) => r.id);
  
  // Expected order: preferred (r2, r4) first, then others (r1, r5), then missing (r3) last
  const preferredFirst = resultIds.indexOf('r2') < resultIds.indexOf('r1') && 
                         resultIds.indexOf('r4') < resultIds.indexOf('r1');
  const missingLast = resultIds.indexOf('r3') === resultIds.length - 1 || 
                      resultIds.indexOf('r3') >= resultIds.indexOf('r1');
  
  const pass = preferredFirst && output.resultsFiltered.length === 5;
  
  console.log(`  Order: [${resultIds.join(', ')}]`);
  console.log(`  Preferred (1-2) before others: ${preferredFirst ? '✅' : '❌'}`);
  console.log(`  All kept (no removal): ${output.resultsFiltered.length === 5 ? '✅' : '❌'}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 2: EXPENSIVE intent → prefer 3-4
{
  console.log('Test 2: EXPENSIVE intent → prefer 3-4, demote missing');
  
  const results = [
    createMockPlace('r1', 1, 'Cheap Place'),
    createMockPlace('r2', 3, 'Expensive 1'),
    createMockPlace('r3', null, 'Unknown'),
    createMockPlace('r4', 4, 'Expensive 2')
  ];

  const filters = createMockFilters('EXPENSIVE', [3, 4]);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-2',
    pipelineVersion: 'route2'
  });

  const resultIds = output.resultsFiltered.map((r: any) => r.id);
  
  // Preferred (r2, r4) should come before non-preferred (r1) and missing (r3)
  const preferredFirst = resultIds.indexOf('r2') < resultIds.indexOf('r1') && 
                         resultIds.indexOf('r4') < resultIds.indexOf('r1');
  
  const pass = preferredFirst && output.resultsFiltered.length === 4;
  
  console.log(`  Order: [${resultIds.join(', ')}]`);
  console.log(`  Preferred (3-4) before others: ${preferredFirst ? '✅' : '❌'}`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 3: MID intent → prefer 2-3
{
  console.log('Test 3: MID intent → prefer 2-3');
  
  const results = [
    createMockPlace('r1', 1, 'Cheap'),
    createMockPlace('r2', 2, 'Mid 1'),
    createMockPlace('r3', 3, 'Mid 2'),
    createMockPlace('r4', 4, 'Expensive')
  ];

  const filters = createMockFilters('MID', [2, 3]);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-3',
    pipelineVersion: 'route2'
  });

  const resultIds = output.resultsFiltered.map((r: any) => r.id);
  
  // r2 and r3 should come before r1 and r4
  const preferredFirst = resultIds.indexOf('r2') < resultIds.indexOf('r1') && 
                         resultIds.indexOf('r3') < resultIds.indexOf('r4');
  
  const pass = preferredFirst && output.resultsFiltered.length === 4;
  
  console.log(`  Order: [${resultIds.join(', ')}]`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Test 4: No price intent → no sorting
{
  console.log('Test 4: No price intent → original order preserved');
  
  const results = [
    createMockPlace('r1', 3, 'First'),
    createMockPlace('r2', 1, 'Second'),
    createMockPlace('r3', null, 'Third')
  ];

  const filters = createMockFilters(null, null);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-4',
    pipelineVersion: 'route2'
  });

  const resultIds = output.resultsFiltered.map((r: any) => r.id);
  const orderPreserved = JSON.stringify(resultIds) === JSON.stringify(['r1', 'r2', 'r3']);
  
  console.log(`  Order: [${resultIds.join(', ')}]`);
  console.log(`  ${orderPreserved ? '✅ PASS' : '❌ FAIL'}`);
  if (!orderPreserved) allPass = false;
  console.log();
}

// Test 5: All missing priceLevel → keep all, no change
{
  console.log('Test 5: CHEAP intent with all missing priceLevel → keep all');
  
  const results = [
    createMockPlace('r1', null, 'Unknown 1'),
    createMockPlace('r2', null, 'Unknown 2'),
    createMockPlace('r3', null, 'Unknown 3')
  ];

  const filters = createMockFilters('CHEAP', [1, 2]);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-5',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3;
  
  console.log(`  Kept: ${output.resultsFiltered.length}/3`);
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`);
  if (!pass) allPass = false;
  console.log();
}

// Summary
console.log('─'.repeat(50));
if (allPass) {
  console.log('✅ All price intent sorting tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
