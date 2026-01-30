/**
 * Unit tests for post-results rating filter
 * 
 * Tests R35, R40, R45 filtering + auto-relax behavior
 */

import { applyPostFilters } from '../post-results.filter.js';
import type { FinalSharedFilters } from '../../shared/shared-filters.types.js';

// Helper to create mock place results
function createMockPlace(id: string, rating: number | null): any {
  return {
    id,
    placeId: id,
    source: 'google_places',
    name: `Place ${id}`,
    address: 'Test Address',
    location: { lat: 32.0, lng: 34.0 },
    rating,
    userRatingsTotal: 100,
    googleMapsUrl: `https://maps.google.com/?q=place_id:${id}`,
    tags: ['restaurant']
  };
}

// Helper to create mock filters
function createMockFilters(minRatingBucket: 'R35' | 'R40' | 'R45' | null): FinalSharedFilters {
  return {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    openAt: null,
    openBetween: null,
    priceIntent: null,
    minRatingBucket,
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
}

console.log('🧪 Running post-results rating filter tests...\n');

let allPass = true;

// Test 1: minRatingBucket=null -> results unchanged
{
  console.log('Test 1: minRatingBucket=null -> results unchanged');

  const results = [
    createMockPlace('rating5', 5.0),
    createMockPlace('rating4', 4.0),
    createMockPlace('rating3', 3.0),
    createMockPlace('unknown', null)
  ];

  const filters = createMockFilters(null);

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-1',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 4 &&
    output.applied.minRatingBucket === null &&
    output.stats.before === 4 &&
    output.stats.after === 4;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 4 results unchanged\n`);

  allPass = allPass && pass;
}

// Test 2: R35 -> keeps rating>=3.5 + unknowns
{
  console.log('Test 2: R35 -> keeps rating>=3.5 + unknowns');

  const results = [
    createMockPlace('rating5', 5.0),
    createMockPlace('rating45', 4.5),
    createMockPlace('rating4', 4.0),
    createMockPlace('rating35', 3.5),
    createMockPlace('rating3', 3.0),
    createMockPlace('rating2', 2.0),
    createMockPlace('unknown', null)
  ];

  const filters = createMockFilters('R35');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-2',
    pipelineVersion: 'route2'
  });

  const allResultsMatch = output.resultsFiltered.every(r =>
    r.rating === null || r.rating >= 3.5
  );
  const correctCount = output.resultsFiltered.length === 5; // 4 rated + 1 unknown

  const pass = correctCount &&
    allResultsMatch &&
    output.applied.minRatingBucket === 'R35' &&
    output.stats.before === 7 &&
    output.stats.after === 5;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} All remaining >= 3.5 or unknown: ${allResultsMatch}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 7 results -> 5 (4 rated + 1 unknown)\n`);

  allPass = allPass && pass;
}

// Test 3: R40 -> keeps rating>=4.0 + unknowns
{
  console.log('Test 3: R40 -> keeps rating>=4.0 + unknowns');

  const results = [
    createMockPlace('rating5', 5.0),
    createMockPlace('rating45', 4.5),
    createMockPlace('rating4', 4.0),
    createMockPlace('rating35', 3.5),
    createMockPlace('rating3', 3.0),
    createMockPlace('unknown', null)
  ];

  const filters = createMockFilters('R40');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-3',
    pipelineVersion: 'route2'
  });

  const allResultsMatch = output.resultsFiltered.every(r =>
    r.rating === null || r.rating >= 4.0
  );
  const correctCount = output.resultsFiltered.length === 4; // 3 rated + 1 unknown

  const pass = correctCount &&
    allResultsMatch &&
    output.applied.minRatingBucket === 'R40' &&
    output.stats.before === 6 &&
    output.stats.after === 4;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} All remaining >= 4.0 or unknown: ${allResultsMatch}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 6 results -> 4 (3 rated + 1 unknown)\n`);

  allPass = allPass && pass;
}

// Test 4: R45 -> keeps rating>=4.5 + unknowns
{
  console.log('Test 4: R45 -> keeps rating>=4.5 + unknowns');

  const results = [
    createMockPlace('rating5', 5.0),
    createMockPlace('rating48', 4.8),
    createMockPlace('rating45', 4.5),
    createMockPlace('rating4', 4.0),
    createMockPlace('rating35', 3.5),
    createMockPlace('unknown', null)
  ];

  const filters = createMockFilters('R45');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-4',
    pipelineVersion: 'route2'
  });

  const allResultsMatch = output.resultsFiltered.every(r =>
    r.rating === null || r.rating >= 4.5
  );
  const correctCount = output.resultsFiltered.length === 4; // 3 rated + 1 unknown

  const pass = correctCount &&
    allResultsMatch &&
    output.applied.minRatingBucket === 'R45' &&
    output.stats.before === 6 &&
    output.stats.after === 4;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} All remaining >= 4.5 or unknown: ${allResultsMatch}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 6 results -> 4 (3 rated + 1 unknown)\n`);

  allPass = allPass && pass;
}

// Test 5: Auto-relax when 0 results (R45 with no high-rated places)
{
  console.log('Test 5: Auto-relax when 0 results (R45 with no high-rated places)');

  const results = [
    createMockPlace('rating4', 4.0),
    createMockPlace('rating35', 3.5),
    createMockPlace('rating3', 3.0)
  ];

  const filters = createMockFilters('R45');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-5',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3 && // All results returned
    output.applied.minRatingBucket === null && // Marked as not applied
    output.relaxed?.minRating === true && // Relaxed flag set
    output.stats.before === 3 &&
    output.stats.after === 3;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket} (relaxed)`);
  console.log(`   ${pass ? '✅' : '❌'} Relaxed flag: ${output.relaxed?.minRating === true}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 3 (auto-relaxed to return all)\n`);

  allPass = allPass && pass;
}

// Test 6: Auto-relax when 0 results (R40 with low-rated places)
{
  console.log('Test 6: Auto-relax when 0 results (R40 with low-rated places)');

  const results = [
    createMockPlace('rating35', 3.5),
    createMockPlace('rating3', 3.0),
    createMockPlace('rating2', 2.5)
  ];

  const filters = createMockFilters('R40');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-6',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3 &&
    output.applied.minRatingBucket === null &&
    output.relaxed?.minRating === true &&
    output.stats.before === 3 &&
    output.stats.after === 3;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket} (relaxed)`);
  console.log(`   ${pass ? '✅' : '❌'} Relaxed flag: ${output.relaxed?.minRating === true}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 3 (auto-relaxed)\n`);

  allPass = allPass && pass;
}

// Test 7: No relax when filter yields results (even if only 1)
{
  console.log('Test 7: No relax when filter yields results (even if only 1)');

  const results = [
    createMockPlace('rating45', 4.5), // Only 1 high-rated place
    createMockPlace('rating4', 4.0),
    createMockPlace('rating3', 3.0)
  ];

  const filters = createMockFilters('R45');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-7',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 1 &&
    output.applied.minRatingBucket === 'R45' &&
    !output.relaxed?.minRating &&
    output.stats.before === 3 &&
    output.stats.after === 1;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} Not relaxed: ${!output.relaxed?.minRating}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 1 (filter applied, not relaxed)\n`);

  allPass = allPass && pass;
}

// Test 8: Unknown rating always kept
{
  console.log('Test 8: Unknown rating always kept (conservative policy)');

  const results = [
    createMockPlace('unknown1', null),
    createMockPlace('unknown2', undefined as any),
    createMockPlace('rating45', 4.5)
  ];

  const filters = createMockFilters('R45');

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-8',
    pipelineVersion: 'route2'
  });

  const pass = output.resultsFiltered.length === 3 && // All kept
    output.applied.minRatingBucket === 'R45' &&
    output.stats.before === 3 &&
    output.stats.after === 3;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filter applied: minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} Unknown places kept: ${output.resultsFiltered.filter(r => r.rating == null).length === 2}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 3 (unknowns kept)\n`);

  allPass = allPass && pass;
}

// Test 9: Combined with openState filter (both filters active)
{
  console.log('Test 9: Combined minRatingBucket + openState filters');

  const results = [
    { ...createMockPlace('highrated-open', 4.5), openNow: true },
    { ...createMockPlace('highrated-closed', 4.5), openNow: false },
    { ...createMockPlace('lowrated-open', 3.5), openNow: true }
  ];

  const filters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: 'OPEN_NOW',
    openAt: null,
    openBetween: null,
    priceIntent: null,
    minRatingBucket: 'R40',
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

  // Should keep only: high-rated + open
  const pass = output.resultsFiltered.length === 1 &&
    output.resultsFiltered[0].id === 'highrated-open' &&
    output.applied.minRatingBucket === 'R40' &&
    output.applied.openState === 'OPEN_NOW';

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Filters applied: openState=${output.applied.openState}, minRatingBucket=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} Only highrated+open kept: ${output.resultsFiltered[0]?.id === 'highrated-open'}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 1 (both filters applied)\n`);

  allPass = allPass && pass;
}

// Test 10: Auto-relax preserves openState filter
{
  console.log('Test 10: Auto-relax preserves openState filter (only removes rating filter)');

  const results = [
    { ...createMockPlace('lowrated-open', 3.5), openNow: true },
    { ...createMockPlace('lowrated-closed', 3.5), openNow: false },
    { ...createMockPlace('lowrated-open2', 3.8), openNow: true }
  ];

  const filters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: 'OPEN_NOW',
    openAt: null,
    openBetween: null,
    priceIntent: null,
    minRatingBucket: 'R45', // No 4.5+ places -> will relax
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

  // Should keep: all open places (rating filter relaxed, but openState still applied)
  const pass = output.resultsFiltered.length === 2 && // 2 open places
    output.resultsFiltered.every(r => r.openNow === true) &&
    output.applied.minRatingBucket === null && // Relaxed
    output.applied.openState === 'OPEN_NOW' && // Still applied
    output.relaxed?.minRating === true;

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} Rating relaxed: ${output.relaxed?.minRating === true}`);
  console.log(`   ${pass ? '✅' : '❌'} OpenState still applied: ${output.applied.openState === 'OPEN_NOW'}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 3 results -> 2 (rating relaxed, openState kept)\n`);

  allPass = allPass && pass;
}

// Test 11: Combined with price + rating (all 3 filters)
{
  console.log('Test 11: Combined openState + priceIntent + minRatingBucket (all 3 filters)');

  const results = [
    { ...createMockPlace('perfect', 4.5), priceLevel: 1, openNow: true },   // ✓ all match
    { ...createMockPlace('expensive-rated', 4.5), priceLevel: 3, openNow: true },
    { ...createMockPlace('cheap-lowrated', 3.5), priceLevel: 1, openNow: true },
    { ...createMockPlace('cheap-rated-closed', 4.5), priceLevel: 1, openNow: false }
  ];

  const filters: FinalSharedFilters = {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: 'OPEN_NOW',
    openAt: null,
    openBetween: null,
    priceIntent: 'CHEAP',
    minRatingBucket: 'R40',
    regionCode: 'IL',
    disclaimers: {
      hours: true,
      dietary: true
    }
  };

  const output = applyPostFilters({
    results,
    sharedFilters: filters,
    requestId: 'test-11',
    pipelineVersion: 'route2'
  });

  // Should keep only: cheap + high-rated + open
  const pass = output.resultsFiltered.length === 1 &&
    output.resultsFiltered[0].id === 'perfect' &&
    output.applied.openState === 'OPEN_NOW' &&
    output.applied.priceIntent === 'CHEAP' &&
    output.applied.minRatingBucket === 'R40';

  console.log(`   ${pass ? '✅' : '❌'} Results: ${output.stats.before} -> ${output.stats.after}`);
  console.log(`   ${pass ? '✅' : '❌'} All 3 filters applied: openState=${output.applied.openState}, price=${output.applied.priceIntent}, rating=${output.applied.minRatingBucket}`);
  console.log(`   ${pass ? '✅' : '❌'} Only perfect match kept: ${output.resultsFiltered[0]?.id === 'perfect'}`);
  console.log(`   ${pass ? '✅' : '❌'} Expected: 4 results -> 1 (all 3 filters applied)\n`);

  allPass = allPass && pass;
}

console.log('═'.repeat(60));
console.log(allPass ? '✅ All tests passed!' : '❌ Some tests failed');
console.log('═'.repeat(60));

process.exit(allPass ? 0 : 1);
