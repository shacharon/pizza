/**
 * Manual verification for OPEN_NOW filter fix
 * Tests that unknown openNow status is KEPT by default (not removed)
 */

import { applyPostFilters } from './dist/server/src/services/search/route2/post-filters/post-results.filter.js';

console.log('=== Testing OPEN_NOW Filter (Unknown Status Policy) ===\n');

// Helper to create mock place
function createPlace(id, name, openNow) {
  return {
    id,
    placeId: id,
    name,
    displayName: { text: name },
    formattedAddress: 'Test Address',
    location: { lat: 32.0, lng: 34.0 },
    rating: 4.5,
    userRatingsTotal: 100,
    openNow,
    currentOpeningHours: openNow !== undefined && openNow !== null && openNow !== 'UNKNOWN'
      ? { openNow }
      : undefined,
    googleMapsUrl: `https://maps.google.com/?q=place_id:${id}`,
    tags: ['restaurant']
  };
}

let passed = 0;
let failed = 0;

// TEST 1: OPEN_NOW keeps explicitly open places
{
  console.log('Test 1: OPEN_NOW keeps explicitly OPEN places');
  
  const results = [
    createPlace('p1', 'Open Place 1', true),
    createPlace('p2', 'Open Place 2', true)
  ];
  
  const output = applyPostFilters({
    results,
    sharedFilters: {
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null
    },
    requestId: 'test-1',
    pipelineVersion: 'route2'
  });
  
  const allOpen = output.resultsFiltered.every(p => p.openNow === true);
  const correctCount = output.resultsFiltered.length === 2;
  
  if (allOpen && correctCount) {
    console.log(`✅ PASS: Kept ${output.stats.after}/${output.stats.before} open places`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 2 open places, got ${output.resultsFiltered.length}`);
    failed++;
  }
}

// TEST 2: OPEN_NOW removes explicitly closed places
{
  console.log('\nTest 2: OPEN_NOW removes explicitly CLOSED places');
  
  const results = [
    createPlace('p1', 'Open Place', true),
    createPlace('p2', 'Closed Place 1', false),
    createPlace('p3', 'Closed Place 2', false)
  ];
  
  const output = applyPostFilters({
    results,
    sharedFilters: {
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null
    },
    requestId: 'test-2',
    pipelineVersion: 'route2'
  });
  
  const noClosed = !output.resultsFiltered.some(p => p.openNow === false);
  const correctCount = output.resultsFiltered.length === 1;
  const removedCount = output.stats.removed === 2;
  
  if (noClosed && correctCount && removedCount) {
    console.log(`✅ PASS: Removed ${output.stats.removed} closed places, kept ${output.stats.after}`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 1 place (2 removed), got ${output.resultsFiltered.length} (${output.stats.removed} removed)`);
    failed++;
  }
}

// TEST 3: OPEN_NOW KEEPS unknown status (FIX VERIFICATION)
{
  console.log('\nTest 3: OPEN_NOW KEEPS places with UNKNOWN status (default policy)');
  
  const results = [
    createPlace('p1', 'Open Place', true),
    createPlace('p2', 'Unknown Place 1', undefined), // No opening hours data
    createPlace('p3', 'Unknown Place 2', null), // Null status
    createPlace('p4', 'Unknown Place 3', 'UNKNOWN'), // Explicit unknown
    createPlace('p5', 'Closed Place', false)
  ];
  
  const output = applyPostFilters({
    results,
    sharedFilters: {
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null
    },
    requestId: 'test-3',
    pipelineVersion: 'route2'
  });
  
  const keptOpen = output.resultsFiltered.filter(p => p.openNow === true).length === 1;
  const keptUnknown = output.resultsFiltered.filter(p => 
    p.openNow === undefined || p.openNow === null || p.openNow === 'UNKNOWN'
  ).length === 3;
  const removedClosed = !output.resultsFiltered.some(p => p.openNow === false);
  const totalCorrect = output.resultsFiltered.length === 4;
  const unknownKept = output.stats.unknownKept === 3;
  const unknownRemoved = output.stats.unknownRemoved === 0;
  
  if (keptOpen && keptUnknown && removedClosed && totalCorrect && unknownKept && unknownRemoved) {
    console.log(`✅ PASS: Kept ${output.stats.after}/${output.stats.before} places (unknownKept=${output.stats.unknownKept}, unknownRemoved=${output.stats.unknownRemoved})`);
    console.log(`   ✅ 1 explicitly open + 3 unknown + 0 closed`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 4 places (1 open + 3 unknown), got ${output.resultsFiltered.length}`);
    console.log(`   Stats: unknownKept=${output.stats.unknownKept}, unknownRemoved=${output.stats.unknownRemoved}`);
    console.log(`   Breakdown: open=${keptOpen}, unknown=${keptUnknown}, closed=${removedClosed}`);
    failed++;
  }
}

// TEST 4: openState=null (no filtering)
{
  console.log('\nTest 4: openState=null does NOT filter anything');
  
  const results = [
    createPlace('p1', 'Open Place', true),
    createPlace('p2', 'Closed Place', false),
    createPlace('p3', 'Unknown Place', undefined)
  ];
  
  const output = applyPostFilters({
    results,
    sharedFilters: {
      openState: null,
      openAt: null,
      openBetween: null
    },
    requestId: 'test-4',
    pipelineVersion: 'route2'
  });
  
  const allKept = output.resultsFiltered.length === 3;
  const noneRemoved = output.stats.removed === 0;
  
  if (allKept && noneRemoved) {
    console.log(`✅ PASS: Kept all ${output.stats.after} places (no filtering)`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 3 places, got ${output.resultsFiltered.length}`);
    failed++;
  }
}

// TEST 5: Simulate real Nearby scenario (all unknown)
{
  console.log('\nTest 5: REAL SCENARIO - Nearby returns 5 places, all with unknown openNow');
  
  const results = [
    createPlace('nearby1', 'Restaurant 1', undefined),
    createPlace('nearby2', 'Restaurant 2', undefined),
    createPlace('nearby3', 'Restaurant 3', undefined),
    createPlace('nearby4', 'Restaurant 4', undefined),
    createPlace('nearby5', 'Restaurant 5', undefined)
  ];
  
  const output = applyPostFilters({
    results,
    sharedFilters: {
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null
    },
    requestId: 'test-nearby',
    pipelineVersion: 'route2'
  });
  
  const allKept = output.resultsFiltered.length === 5;
  const unknownKept = output.stats.unknownKept === 5;
  const unknownRemoved = output.stats.unknownRemoved === 0;
  const noneRemoved = output.stats.removed === 0;
  
  if (allKept && unknownKept && unknownRemoved && noneRemoved) {
    console.log(`✅ PASS: Kept all ${output.stats.after}/${output.stats.before} Nearby results`);
    console.log(`   ✅ unknownKept=5, unknownRemoved=0 (NEW POLICY)`);
    console.log(`   ✅ FIX VERIFIED: No longer removing all results!`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 5 places, got ${output.resultsFiltered.length}`);
    console.log(`   Stats: unknownKept=${output.stats.unknownKept}, unknownRemoved=${output.stats.unknownRemoved}, removed=${output.stats.removed}`);
    failed++;
  }
}

// TEST 6: Mixed scenario (realistic)
{
  console.log('\nTest 6: MIXED - Some open, some closed, some unknown');
  
  const results = [
    createPlace('p1', 'Open 1', true),
    createPlace('p2', 'Open 2', true),
    createPlace('p3', 'Closed 1', false),
    createPlace('p4', 'Unknown 1', undefined),
    createPlace('p5', 'Unknown 2', null),
    createPlace('p6', 'Closed 2', false),
    createPlace('p7', 'Open 3', true)
  ];
  
  const output = applyPostFilters({
    results,
    sharedFilters: {
      openState: 'OPEN_NOW',
      openAt: null,
      openBetween: null
    },
    requestId: 'test-6',
    pipelineVersion: 'route2'
  });
  
  const hasOpen = output.resultsFiltered.filter(p => p.openNow === true).length === 3;
  const hasUnknown = output.resultsFiltered.filter(p => p.openNow === undefined || p.openNow === null).length === 2;
  const noClosed = !output.resultsFiltered.some(p => p.openNow === false);
  const totalCorrect = output.resultsFiltered.length === 5; // 3 open + 2 unknown
  const removedCorrect = output.stats.removed === 2; // 2 closed
  const unknownKept = output.stats.unknownKept === 2;
  
  if (hasOpen && hasUnknown && noClosed && totalCorrect && removedCorrect && unknownKept) {
    console.log(`✅ PASS: Kept ${output.stats.after}/${output.stats.before} places`);
    console.log(`   ✅ 3 open + 2 unknown kept, 2 closed removed`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 5 places (3 open + 2 unknown), got ${output.resultsFiltered.length}`);
    console.log(`   Expected removed=2, got ${output.stats.removed}`);
    failed++;
  }
}

console.log('\n=== Results ===');
console.log(`Passed: ${passed}/6`);
console.log(`Failed: ${failed}/6`);

if (failed > 0) {
  console.log('\n❌ TESTS FAILED');
  process.exit(1);
}

console.log('\n✅ ALL TESTS PASSED!');
console.log('\n🎉 FIX VERIFIED: OPEN_NOW now KEEPS unknown status by default');
console.log('   This prevents removing all Nearby results when openNow data is missing.');
