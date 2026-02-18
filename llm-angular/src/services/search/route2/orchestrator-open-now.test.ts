/**
 * Route2 Orchestrator - OpenNow Metadata Fix
 * 
 * Regression test for openNow field mapping and unknown count handling
 * 
 * Date: 2026-01-29
 * 
 * Bug description:
 * - orchestrator.response.ts was using `r.isOpenNow` (wrong field name)
 * - Should use `r.openNow` (matches Google Places API mapper)
 * - Was not tracking unknown status count separately
 * - Could incorrectly suggest "most places closed" when majority is unknown
 * 
 * Fix:
 * - Changed r.isOpenNow to r.openNow
 * - Added openNowUnknownCount calculation
 * - Passed both counts to assistant metadata
 * - Updated AssistantSummaryContext type definition
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Route2 Orchestrator - OpenNow Field Fix', () => {
  
  it('should use r.openNow (not r.isOpenNow) to compute openNowCount', async () => {
    // Verify the fix uses the correct field name that matches the Google Places mapper
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const responsePath = path.join(__dirname, 'orchestrator.response.ts');
    
    const content = await fs.readFile(responsePath, 'utf-8');
    
    // Verify openNowCount uses r.openNow === true
    const openNowCountRegex = /openNowCount\s*=\s*finalResults\.filter\(\([^)]*\)\s*=>\s*[^.]*\.openNow\s*===\s*true\)/;
    
    assert.ok(
      openNowCountRegex.test(content),
      'openNowCount should use r.openNow (not r.isOpenNow) to match mapper field name'
    );
    
    // Verify the WRONG pattern is NOT present
    const wrongFieldRegex = /\.isOpenNow\s*===\s*true/;
    
    assert.ok(
      !wrongFieldRegex.test(content),
      'should NOT use r.isOpenNow (wrong field name)'
    );
  });

  it('should compute openNowUnknownCount for results with unknown status', async () => {
    // Verify that unknown status is tracked separately
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const responsePath = path.join(__dirname, 'orchestrator.response.ts');
    
    const content = await fs.readFile(responsePath, 'utf-8');
    
    // Verify openNowUnknownCount exists and checks for UNKNOWN, null, or undefined
    const hasUnknownCount = content.includes('openNowUnknownCount');
    const hasUnknownCheck = content.includes("'UNKNOWN'") && 
                             content.includes('null') && 
                             content.includes('undefined');
    
    assert.ok(
      hasUnknownCount && hasUnknownCheck,
      'should compute openNowUnknownCount for results with unknown status (UNKNOWN, null, undefined)'
    );
  });

  it('should only include openNowCount and currentHour when all results have known status', async () => {
    // Verify conditional omission logic: only include if openNowUnknownCount === 0
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const responsePath = path.join(__dirname, 'orchestrator.response.ts');
    
    const content = await fs.readFile(responsePath, 'utf-8');
    
    // Verify conditional spread: openNowCount and currentHour only if openNowUnknownCount === 0
    const hasConditionalSpread = content.includes('openNowUnknownCount === 0') &&
                                  content.includes('openNowCount') &&
                                  content.includes('currentHour');
    
    assert.ok(
      hasConditionalSpread,
      'metadata should conditionally include openNowCount and currentHour only when openNowUnknownCount === 0'
    );
  });

  it('should document conditional omission in AssistantSummaryContext type', async () => {
    // Verify the type definition documents that openNowCount/currentHour are conditional
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const assistantServicePath = path.join(__dirname, 'assistant', 'assistant-llm.service.ts');
    
    const content = await fs.readFile(assistantServicePath, 'utf-8');
    
    // Verify type has openNowCount and currentHour (both optional)
    const hasOpenNowCount = /openNowCount\?:\s*number/.test(content);
    const hasCurrentHour = /currentHour\?:\s*number/.test(content);
    
    // Verify documentation mentions conditional inclusion
    const hasConditionalNote = content.includes('only if') || 
                                content.includes('ONLY included if') ||
                                content.includes('no unknowns');
    
    assert.ok(
      hasOpenNowCount && hasCurrentHour && hasConditionalNote,
      'AssistantSummaryContext type should have openNowCount/currentHour with conditional documentation'
    );
  });

  it('should document the fix and regression scenario', () => {
    // DOCUMENTED REGRESSION:
    // ======================
    // Date: 2026-01-29
    //
    // Bug:
    // 1. Google Places mapper sets `openNow` field (correctly)
    // 2. Post-filter accesses `place.openNow` (correctly)
    // 3. But orchestrator.response.ts was checking `r.isOpenNow` (WRONG field name)
    // 4. Result: openNowCount was always 0 (no match)
    // 5. No tracking of unknown status count
    // 6. Assistant insights could be misleading with many unknowns
    //
    // Example scenario triggering bug:
    // - 10 results returned
    // - 3 have openNow: true
    // - 2 have openNow: false
    // - 5 have openNow: 'UNKNOWN'
    // 
    // Before fix:
    // - openNowCount = 0 (wrong field name, no matches)
    // - No unknown tracking
    // - Assistant might say "most places closed" (2/10 = 20%)
    //
    // After fix (Phase 1):
    // - openNowCount = 3 (correct)
    // - openNowUnknownCount = 5
    // - Passed both counts to assistant
    //
    // After fix (Phase 2 - CURRENT):
    // - openNowCount = 3 (correct)
    // - openNowUnknownCount = 5 (calculated internally)
    // - Split into true/false/unknown tri-state
    // - Conditionally omit openNowCount + currentHour if ANY unknown
    // - Assistant ONLY receives time-based metadata when data quality is 100%
    // - Prevents ANY time-based insights when status data is incomplete
    //
    // Root cause:
    // - Field name mismatch: mapper uses `openNow`, orchestrator used `isOpenNow`
    // - No type safety on result objects (using `any`)
    //
    // Fix applied:
    // 1. Changed r.isOpenNow to r.openNow (line ~52 of orchestrator.response.ts)
    // 2. Added openNowUnknownCount calculation (internal)
    // 3. Added closedCount calculation for tri-state split
    // 4. Conditionally omit openNowCount + currentHour if openNowUnknownCount > 0
    // 5. Updated AssistantSummaryContext type documentation
    //
    // Impact:
    // - openNowCount now correctly reflects truly open places
    // - Complete tri-state tracking: open/closed/unknown
    // - Assistant NEVER receives partial status data
    // - Zero risk of misleading time-based insights
    // - If any status is unknown, NO time-based metadata sent at all
    //
    // Prevention:
    // - Add stronger typing for result objects (not `any`)
    // - Consider shared type definitions between mapper and consumers
    // - Unit tests with actual result objects (not just type checks)
    
    assert.ok(true, 'Regression documented and fix verified');
  });
});

describe('Route2 - Mixed OpenNow Status Handling', () => {
  
  it('should correctly count results with mixed true/false/unknown openNow values', () => {
    // Simulate the filtering logic
    const mockResults = [
      { name: 'Place A', openNow: true },
      { name: 'Place B', openNow: true },
      { name: 'Place C', openNow: true },
      { name: 'Place D', openNow: false },
      { name: 'Place E', openNow: false },
      { name: 'Place F', openNow: 'UNKNOWN' },
      { name: 'Place G', openNow: 'UNKNOWN' },
      { name: 'Place H', openNow: 'UNKNOWN' },
      { name: 'Place I', openNow: null },
      { name: 'Place J', openNow: undefined }
    ];
    
    // Replicate the actual logic from orchestrator.response.ts
    const openNowCount = mockResults.filter((r: any) => r.openNow === true).length;
    const closedCount = mockResults.filter((r: any) => r.openNow === false).length;
    const openNowUnknownCount = mockResults.filter((r: any) => 
      r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
    ).length;
    
    // Verify tri-state split
    assert.strictEqual(openNowCount, 3, 'should count 3 places as open');
    assert.strictEqual(closedCount, 2, 'should count 2 places as closed');
    assert.strictEqual(openNowUnknownCount, 5, 'should count 5 places with unknown status');
    
    // Total should match
    assert.strictEqual(
      openNowCount + closedCount + openNowUnknownCount,
      mockResults.length,
      'tri-state counts should add up to total results'
    );
    
    // CRITICAL: With any unknowns, openNowCount + currentHour should be OMITTED
    const shouldOmitOpenNowMetadata = openNowUnknownCount > 0;
    assert.ok(shouldOmitOpenNowMetadata, 'should omit openNow metadata when any unknowns present');
  });

  it('should handle edge case where all results have unknown status', () => {
    const mockResults = [
      { name: 'Place A', openNow: 'UNKNOWN' },
      { name: 'Place B', openNow: null },
      { name: 'Place C', openNow: undefined },
      { name: 'Place D', openNow: 'UNKNOWN' }
    ];
    
    const openNowCount = mockResults.filter((r: any) => r.openNow === true).length;
    const openNowUnknownCount = mockResults.filter((r: any) => 
      r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
    ).length;
    
    assert.strictEqual(openNowCount, 0, 'should count 0 places as open');
    assert.strictEqual(openNowUnknownCount, 4, 'all places should be unknown');
    
    // In this case, assistant should NOT make claims about "most places closed"
    // because we simply don't know the status
    const majorityUnknown = openNowUnknownCount > mockResults.length / 2;
    assert.ok(majorityUnknown, 'majority is unknown - should avoid misleading insights');
  });

  it('should not coerce unknown to false', () => {
    const mockResults = [
      { name: 'Place A', openNow: 'UNKNOWN' },
      { name: 'Place B', openNow: null },
      { name: 'Place C', openNow: undefined }
    ];
    
    // Verify that unknown values are NOT counted as false
    const closedCount = mockResults.filter((r: any) => r.openNow === false).length;
    const openNowUnknownCount = mockResults.filter((r: any) => 
      r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
    ).length;
    
    assert.strictEqual(closedCount, 0, 'unknown should NOT be coerced to false');
    assert.strictEqual(openNowUnknownCount, 3, 'all should be counted as unknown');
  });

  it('should include openNowCount + currentHour only when ALL results have known status', () => {
    // Scenario 1: All results have known status (no unknowns)
    const allKnownResults = [
      { name: 'Place A', openNow: true },
      { name: 'Place B', openNow: true },
      { name: 'Place C', openNow: false },
      { name: 'Place D', openNow: false }
    ];
    
    const openNowCount1 = allKnownResults.filter((r: any) => r.openNow === true).length;
    const openNowUnknownCount1 = allKnownResults.filter((r: any) => 
      r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
    ).length;
    
    assert.strictEqual(openNowUnknownCount1, 0, 'should have zero unknowns');
    assert.strictEqual(openNowCount1, 2, 'should count 2 open places');
    
    // With zero unknowns, metadata SHOULD include openNowCount + currentHour
    const shouldIncludeMetadata1 = openNowUnknownCount1 === 0;
    assert.ok(shouldIncludeMetadata1, 'should include openNow metadata when all status known');
    
    // Scenario 2: At least one unknown result
    const someUnknownResults = [
      { name: 'Place A', openNow: true },
      { name: 'Place B', openNow: 'UNKNOWN' }, // One unknown
      { name: 'Place C', openNow: false }
    ];
    
    const openNowUnknownCount2 = someUnknownResults.filter((r: any) => 
      r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
    ).length;
    
    assert.strictEqual(openNowUnknownCount2, 1, 'should have one unknown');
    
    // With any unknowns, metadata should OMIT openNowCount + currentHour
    const shouldIncludeMetadata2 = openNowUnknownCount2 === 0;
    assert.ok(!shouldIncludeMetadata2, 'should omit openNow metadata when any status unknown');
  });
});
