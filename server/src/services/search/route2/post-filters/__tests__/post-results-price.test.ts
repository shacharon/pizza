/**
 * Unit tests for post-results price filter
 * 
 * Tests CHEAP, MID, EXPENSIVE filtering + auto-relax behavior
 */

import { applyPostFilters } from '../post-results.filter.js';
import type { FinalSharedFilters } from '../../shared/shared-filters.types.js';

// Helper to create mock place results
function createMockPlace(id: string, priceLevel: number | null): any {
  return {
    id,
    placeId: id,
    source: 'google_places',
    name: `Place ${id}`,
    address: 'Test Address',
    location: { lat: 32.0, lng: 34.0 },
    rating: 4.5,
    userRatingsTotal: 100,
    priceLevel,
    googleMapsUrl: `https://maps.google.com/?q=place_id:${id}`,
    tags: ['restaurant']
  };
}

// Helper to create mock filters
function createMockFilters(priceIntent: 'CHEAP' | 'MID' | 'EXPENSIVE' | null): FinalSharedFilters {
  return {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    priceIntent,
    minRatingBucket: null,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
}

console.log('🧪 Running post-results price filter tests...\n');

let allPass = true;

// Test 1: priceIntent=null -> results unchanged
{
  console.log('Test 1: priceIntent=null -> results unchanged');
  
  const results = [
    createMockPlace('cheap1', 1),
    createMockPlace('mid1', 2),
    createMockPlace('expensive1', 3),
    createMockPlace('unknown1', null)
  ];
  
  const filters = createMockFilters(null);
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-1',
    pipelineVersion: 'route2'
  });
  
  const pass = output.resultsFiltered.length === 4 &&
               output.applied.priceIntent === null &&
               output.stats.before === 4 &&
               output.stats.after === 4;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 4 results unchanged\n`);
  
  allPass = allPass && pass;
}

// Test 2: priceIntent=CHEAP -> keeps only priceLevel=1 + unknowns
{
  console.log('Test 2: priceIntent=CHEAP -> keeps only priceLevel=1 + unknowns');
  
  const results = [
    createMockPlace('cheap1', 1),
    createMockPlace('cheap2', 1),
    createMockPlace('mid1', 2),
    createMockPlace('expensive1', 3),
    createMockPlace('expensive2', 4),
    createMockPlace('unknown1', null)
  ];
  
  const filters = createMockFilters('CHEAP');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-2',
    pipelineVersion: 'route2'
  });
  
  const allResultsMatch = output.resultsFiltered.every(r => 
    r.priceLevel === 1 || r.priceLevel === null
  );
  const correctCount = output.resultsFiltered.length === 3; // 2 cheap + 1 unknown
  
  const pass = correctCount &&
               allResultsMatch &&
               output.applied.priceIntent === 'CHEAP' &&
               output.stats.before === 6 &&
               output.stats.after === 3;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} All remaining are cheap or unknown: ${allResultsMatch}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 6 results -> 3 (2 cheap + 1 unknown)\n`);
  
  allPass = allPass && pass;
}

// Test 3: priceIntent=MID -> keeps only priceLevel=2 + unknowns
{
  console.log('Test 3: priceIntent=MID -> keeps only priceLevel=2 + unknowns');
  
  const results = [
    createMockPlace('cheap1', 1),
    createMockPlace('mid1', 2),
    createMockPlace('mid2', 2),
    createMockPlace('expensive1', 3),
    createMockPlace('expensive2', 4),
    createMockPlace('unknown1', null)
  ];
  
  const filters = createMockFilters('MID');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-3',
    pipelineVersion: 'route2'
  });
  
  const allResultsMatch = output.resultsFiltered.every(r => 
    r.priceLevel === 2 || r.priceLevel === null
  );
  const correctCount = output.resultsFiltered.length === 3; // 2 mid + 1 unknown
  
  const pass = correctCount &&
               allResultsMatch &&
               output.applied.priceIntent === 'MID' &&
               output.stats.before === 6 &&
               output.stats.after === 3;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} All remaining are mid or unknown: ${allResultsMatch}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 6 results -> 3 (2 mid + 1 unknown)\n`);
  
  allPass = allPass && pass;
}

// Test 4: priceIntent=EXPENSIVE -> keeps priceLevel=3,4 + unknowns
{
  console.log('Test 4: priceIntent=EXPENSIVE -> keeps priceLevel=3,4 + unknowns');
  
  const results = [
    createMockPlace('cheap1', 1),
    createMockPlace('mid1', 2),
    createMockPlace('expensive1', 3),
    createMockPlace('expensive2', 3),
    createMockPlace('expensive3', 4),
    createMockPlace('unknown1', null)
  ];
  
  const filters = createMockFilters('EXPENSIVE');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-4',
    pipelineVersion: 'route2'
  });
  
  const allResultsMatch = output.resultsFiltered.every(r => 
    r.priceLevel === 3 || r.priceLevel === 4 || r.priceLevel === null
  );
  const correctCount = output.resultsFiltered.length === 4; // 3 expensive + 1 unknown
  
  const pass = correctCount &&
               allResultsMatch &&
               output.applied.priceIntent === 'EXPENSIVE' &&
               output.stats.before === 6 &&
               output.stats.after === 4;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} All remaining are expensive or unknown: ${allResultsMatch}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 6 results -> 4 (3 expensive + 1 unknown)\n`);
  
  allPass = allPass && pass;
}

// Test 5: Auto-relax when 0 results (CHEAP filter with no cheap places)
{
  console.log('Test 5: Auto-relax when 0 results (CHEAP filter with no cheap places)');
  
  const results = [
    createMockPlace('mid1', 2),
    createMockPlace('expensive1', 3),
    createMockPlace('expensive2', 4)
  ];
  
  const filters = createMockFilters('CHEAP');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-5',
    pipelineVersion: 'route2'
  });
  
  const pass = output.resultsFiltered.length === 3 && // All results returned
               output.applied.priceIntent === null && // Marked as not applied
               output.relaxed?.priceIntent === true && // Relaxed flag set
               output.stats.before === 3 &&
               output.stats.after === 3;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent} (relaxed)`);
  console.log(`   ${pass ? '✅' : '❌'} Relaxed flag: ${output.relaxed?.priceIntent === true}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 3 (auto-relaxed to return all)\n`);
  
  allPass = allPass && pass;
}

// Test 6: Auto-relax when 0 results (EXPENSIVE filter with no expensive places)
{
  console.log('Test 6: Auto-relax when 0 results (EXPENSIVE filter with no expensive places)');
  
  const results = [
    createMockPlace('cheap1', 1),
    createMockPlace('cheap2', 1),
    createMockPlace('mid1', 2)
  ];
  
  const filters = createMockFilters('EXPENSIVE');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-6',
    pipelineVersion: 'route2'
  });
  
  const pass = output.resultsFiltered.length === 3 &&
               output.applied.priceIntent === null &&
               output.relaxed?.priceIntent === true &&
               output.stats.before === 3 &&
               output.stats.after === 3;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent} (relaxed)`);
  console.log(`   ${pass ? '✅' : '❌'} Relaxed flag: ${output.relaxed?.priceIntent === true}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 3 (auto-relaxed)\n`);
  
  allPass = allPass && pass;
}

// Test 7: No relax when filter yields results (even if only 1)
{
  console.log('Test 7: No relax when filter yields results (even if only 1)');
  
  const results = [
    createMockPlace('cheap1', 1), // Only 1 cheap place
    createMockPlace('mid1', 2),
    createMockPlace('expensive1', 3)
  ];
  
  const filters = createMockFilters('CHEAP');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-7',
    pipelineVersion: 'route2'
  });
  
  const pass = output.resultsFiltered.length === 1 &&
               output.applied.priceIntent === 'CHEAP' &&
               !output.relaxed?.priceIntent &&
               output.stats.before === 3 &&
               output.stats.after === 1;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} Not relaxed: ${!output.relaxed?.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 1 (filter applied, not relaxed)\n`);
  
  allPass = allPass && pass;
}

// Test 8: Unknown priceLevel always kept
{
  console.log('Test 8: Unknown priceLevel always kept (conservative policy)');
  
  const results = [
    createMockPlace('unknown1', null),
    createMockPlace('unknown2', undefined as any),
    createMockPlace('cheap1', 1)
  ];
  
  const filters = createMockFilters('CHEAP');
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-8',
    pipelineVersion: 'route2'
  });
  
  const pass = output.resultsFiltered.length === 3 && // All kept
               output.applied.priceIntent === 'CHEAP' &&
               output.stats.before === 3 &&
               output.stats.after === 3;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} Unknown places kept: ${output.resultsFiltered.filter(r => r.priceLevel == null).length === 2}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 3 (unknowns kept)\n`);
  
  allPass = allPass && pass;
}

// Test 9: Combined with openState filter (both filters active)
{
  console.log('Test 9: Combined priceIntent + openState filters');
  
  const results = [
    { ...createMockPlace('cheap-open', 1), openNow: true },
    { ...createMockPlace('cheap-closed', 1), openNow: false },
    { ...createMockPlace('expensive-open', 3), openNow: true }
  ];
  
  const filters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: 'OPEN_NOW',
    openAt: null,
    openBetween: null,
    priceIntent: 'CHEAP',
    minRatingBucket: null,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-9',
    pipelineVersion: 'route2'
  });
  
  // Should keep only: cheap + open
  const pass = output.resultsFiltered.length === 1 &&
               output.resultsFiltered[0].id === 'cheap-open' &&
               output.applied.priceIntent === 'CHEAP' &&
               output.applied.openState === 'OPEN_NOW';
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filters applied: openState=${output.applied.openState}, priceIntent=${output.applied.priceIntent}`);
  console.log(`   ${pass ? '✅' : '❌'} Only cheap+open kept: ${output.resultsFiltered[0]?.id === 'cheap-open'}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 1 (both filters applied)\n`);
  
  allPass = allPass && pass;
}

// Test 10: Auto-relax preserves openState filter
{
  console.log('Test 10: Auto-relax preserves openState filter (only removes price filter)');
  
  const results = [
    { ...createMockPlace('mid-open', 2), openNow: true },
    { ...createMockPlace('mid-closed', 2), openNow: false },
    { ...createMockPlace('expensive-open', 3), openNow: true }
  ];
  
  const filters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: 'OPEN_NOW',
    openAt: null,
    openBetween: null,
    priceIntent: 'CHEAP', // No cheap places -> will relax
    minRatingBucket: null,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
  
  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-10',
    pipelineVersion: 'route2'
  });
  
  // Should keep: all open places (price filter relaxed, but openState still applied)
  const pass = output.resultsFiltered.length === 2 && // 2 open places
               output.resultsFiltered.every(r => r.openNow === true) &&
               output.applied.priceIntent === null && // Relaxed
               output.applied.openState === 'OPEN_NOW' && // Still applied
               output.relaxed?.priceIntent === true;
  
  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Price relaxed: ${output.relaxed?.priceIntent === true}`);
  console.log(`   ${pass ? '✅' : '❌'} OpenState still applied: ${output.applied.openState === 'OPEN_NOW'}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 2 (price relaxed, openState kept)\n`);
  
  allPass = allPass && pass;
}

console.log('═'.repeat(60));
console.log(allPass ? '✅ All tests passed!' : '❌ Some tests failed');
console.log('═'.repeat(60));

process.exit(allPass ? 0 : 1);
