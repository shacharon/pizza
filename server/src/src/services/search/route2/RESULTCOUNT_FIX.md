# ROUTE2 ResultCount Logging Fix

## Problem

**Observed behavior:**
- `[ROUTE2] google_maps completed` logs showed `resultCount: 20` (or other positive numbers)
- `[ROUTE2] Pipeline completed` logs showed `resultCount: 0` for the same requestId/traceId
- HTTP response contained the correct number of results

**Impact:**
- Logging/metrics were inaccurate
- Monitoring dashboards would show 0 results when results were actually returned
- No functional impact (HTTP response was always correct)

## Root Cause

**File:** `server/src/services/search/route2/route2.orchestrator.ts`

**Line 228** (before fix):
```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  event: 'pipeline_completed',
  durationMs: totalDurationMs,
  resultCount: 0  // ❌ HARDCODED TO 0
}, '[ROUTE2] Pipeline completed');
```

The `resultCount` was hardcoded to `0` instead of using the actual results count from `googleResult.results.length`.

## Fix Applied

**Line 228** (after fix):
```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  event: 'pipeline_completed',
  durationMs: totalDurationMs,
  resultCount: googleResult.results.length  // ✅ USES ACTUAL COUNT
}, '[ROUTE2] Pipeline completed');
```

## Data Flow

1. **Google Maps Stage** (`google-maps.stage.ts` line 72):
   ```typescript
   resultCount: results.length  // Logs actual count
   ```

2. **Google Maps Stage Return** (line 77-81):
   ```typescript
   return {
     results,           // Array of results
     providerMethod,
     durationMs
   };
   ```

3. **Orchestrator Response** (`route2.orchestrator.ts` line 206):
   ```typescript
   results: googleResult.results  // Uses same array
   ```

4. **Orchestrator Log** (line 228 - FIXED):
   ```typescript
   resultCount: googleResult.results.length  // Now matches stage log
   ```

## Verification

### Test Coverage
- **File:** `server/src/services/search/route2/route2.orchestrator.test.ts`
- **Tests:**
  1. Verifies `googleResult.results.length` is used (not hardcoded 0)
  2. Documents the bug and fix
  3. Verifies data flow from google stage → response → log

### Manual Verification
1. Run a ROUTE2 query (e.g., "pizza in Tel Aviv")
2. Check logs for same requestId:
   ```
   [ROUTE2] google_maps completed { resultCount: 20, ... }
   [ROUTE2] Pipeline completed { resultCount: 20, ... }
   ```
3. Verify HTTP response contains 20 results

## Impact Assessment

### What Changed
- ✅ Logging accuracy (pipeline_completed now shows correct count)
- ✅ Metrics/monitoring accuracy

### What Did NOT Change
- ❌ No behavior changes
- ❌ No API changes
- ❌ No performance impact
- ❌ No LLM prompt changes
- ❌ No ranking/filtering logic changes

## Related Files

- `server/src/services/search/route2/route2.orchestrator.ts` (fix applied)
- `server/src/services/search/route2/stages/google-maps.stage.ts` (reference for correct pattern)
- `server/src/services/search/route2/route2.orchestrator.test.ts` (test coverage)

## Date
2026-01-16
