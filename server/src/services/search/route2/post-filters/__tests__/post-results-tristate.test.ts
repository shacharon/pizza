/**
 * Unit tests for post-results filter with tri-state openState
 * 
 * Tests OPEN_NOW, CLOSED_NOW, and ANY filtering
 */

import { applyPostFilters } from '../post-results.filter.js';
import type { FinalSharedFilters } from '../../shared/shared-filters.types.js';

// Helper to create mock place results
function createMockPlace(id: string, openNow: boolean | 'UNKNOWN'): any {
  return {
    id,
    placeId: id,
    source: 'google_places',
    name: `Place ${id}`,
    address: 'Test Address',
    location: { lat: 32.0, lng: 34.0 },
    rating: 4.5,
    userRatingsTotal: 100,
    openNow,
    googleMapsUrl: `https://maps.google.com/?q=place_id:${id}`,
    tags: ['restaurant']
  };
}

// Helper to create mock filters
function createMockFilters(openState: 'OPEN_NOW' | 'CLOSED_NOW' | null): FinalSharedFilters {
  return {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState,
    openAt: null,
    openBetween: null,
    priceIntent: null,
    minRatingBucket: null,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
}

console.log('🧪 Running post-results filter tests (tri-state openState)...\n');

let allPass = true;

// Test 1: openState=null -> results unchanged
{
  console.log('Test 1: openState=null -> results unchanged');

  const results = [
    createMockPlace('open1', true),
    createMockPlace('closed1', false),
    createMockPlace('unknown1', 'UNKNOWN')
  ];

  const filters = createMockFilters(null);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-1',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3 &&
    output.applied.openState === null &&
    output.stats.before === 3 &&
    output.stats.after === 3;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: openState=${output.applied.openState}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results unchanged\n`);

  allPass = allPass && pass;
}

// Test 2: openState=OPEN_NOW -> removes closed, keeps unknown (conservative)
{
  console.log('Test 2: openState=OPEN_NOW -> removes closed, keeps unknown (conservative)');

  const results = [
    createMockPlace('open1', true),
    createMockPlace('open2', true),
    createMockPlace('closed1', false),
    createMockPlace('closed2', false),
    createMockPlace('unknown1', 'UNKNOWN')
  ];

  const filters = createMockFilters('OPEN_NOW');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-2',
    pipelineVersion: 'route2'
  });

  const openOrUnknown = output.resultsFiltered.every(r => r.openNow === true || r.openNow === 'UNKNOWN');
  const correctCount = output.resultsFiltered.length === 3; // 2 open + 1 unknown

  const pass = correctCount &&
    openOrUnknown &&
    output.applied.openState === 'OPEN_NOW' &&
    output.stats.before === 5 &&
    output.stats.after === 3 &&
    output.stats.unknownKept === 1;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: openState=${output.applied.openState}`);
  console.log(`   ${pass ? '✅' : '❌'} Open or unknown kept: ${openOrUnknown}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 5 results -> 3 (2 open + 1 unknown kept)\n`);

  allPass = allPass && pass;
}

// Test 3: openState=CLOSED_NOW -> removes open, keeps unknown (conservative)
{
  console.log('Test 3: openState=CLOSED_NOW -> removes open, keeps unknown (conservative)');

  const results = [
    createMockPlace('open1', true),
    createMockPlace('open2', true),
    createMockPlace('closed1', false),
    createMockPlace('closed2', false),
    createMockPlace('unknown1', 'UNKNOWN')
  ];

  const filters = createMockFilters('CLOSED_NOW');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-3',
    pipelineVersion: 'route2'
  });

  const closedOrUnknown = output.resultsFiltered.every(r => r.openNow === false || r.openNow === 'UNKNOWN');
  const correctCount = output.resultsFiltered.length === 3; // 2 closed + 1 unknown

  const pass = correctCount &&
    closedOrUnknown &&
    output.applied.openState === 'CLOSED_NOW' &&
    output.stats.before === 5 &&
    output.stats.after === 3 &&
    output.stats.unknownKept === 1;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: openState=${output.applied.openState}`);
  console.log(`   ${pass ? '✅' : '❌'} Closed or unknown kept: ${closedOrUnknown}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 5 results -> 3 (2 closed + 1 unknown kept)\n`);

  allPass = allPass && pass;
}

// Test 4: openState=OPEN_NOW with empty results -> ok
{
  console.log('Test 4: openState=OPEN_NOW with empty results -> ok (no crash)');

  const results: any[] = [];
  const filters = createMockFilters('OPEN_NOW');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-4',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 0 &&
    output.applied.openState === 'OPEN_NOW' &&
    output.stats.before === 0 &&
    output.stats.after === 0;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: openState=${output.applied.openState}`);
  console.log(`   ${pass ? '✅' : '❌'} No crash on empty array\n`);

  allPass = allPass && pass;
}

// Test 5: openState=CLOSED_NOW with only open/unknown -> keeps unknown
{
  console.log('Test 5: openState=CLOSED_NOW with only open/unknown -> keeps unknown');

  const results = [
    createMockPlace('open1', true),
    createMockPlace('open2', true),
    createMockPlace('unknown1', 'UNKNOWN'),
    createMockPlace('unknown2', 'UNKNOWN')
  ];

  const filters = createMockFilters('CLOSED_NOW');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-5',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 2 && // 2 unknowns kept
    output.applied.openState === 'CLOSED_NOW' &&
    output.stats.before === 4 &&
    output.stats.after === 2 &&
    output.stats.unknownKept === 2;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: openState=${output.applied.openState}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 4 results -> 2 (unknowns kept)\n`);

  allPass = allPass && pass;
}

// Test 6: openState=OPEN_NOW with missing openNow field -> kept (conservative)
{
  console.log('Test 6: openState=OPEN_NOW with missing openNow field -> kept (conservative)');

  const results = [
    createMockPlace('open1', true),
    { id: 'missing', name: 'No Hours', openNow: undefined }, // Missing openingHours
    createMockPlace('open2', true)
  ];

  const filters = createMockFilters('OPEN_NOW');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-6',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3 && // All kept (unknown treated as keep)
    output.applied.openState === 'OPEN_NOW' &&
    output.resultsFiltered.some(r => r.id === 'missing') && // Missing is kept
    output.stats.unknownKept === 1;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: openState=${output.applied.openState}`);
  console.log(`   ${pass ? '✅' : '❌'} Missing openNow kept (conservative): ${output.resultsFiltered.some(r => r.id === 'missing')}\n`);

  allPass = allPass && pass;
}

console.log('═'.repeat(60));
console.log(allPass ? '✅ All tests passed!' : '❌ Some tests failed');
console.log('═'.repeat(60));

process.exit(allPass ? 0 : 1);
