# OpenNow Field Mapping Fix - Complete

**Date:** 2026-01-29

## Summary
Fixed incorrect field name usage in openNow metadata calculation and added proper tracking of unknown status to prevent misleading assistant insights.

---

## Issues Fixed

### 1. ✅ Wrong Field Name: `isOpenNow` → `openNow`

**Problem:**
- Google Places mapper sets `openNow` field correctly
- Post-filter accesses `place.openNow` correctly  
- **But** `orchestrator.response.ts` was checking `r.isOpenNow` (wrong field)
- Result: `openNowCount` was always 0, breaking assistant insights

**Fix:**
```typescript
// Before (WRONG):
const openNowCount = finalResults.filter((r: any) => r.isOpenNow === true).length;

// After (CORRECT):
const openNowCount = finalResults.filter((r: any) => r.openNow === true).length;
```

**File:** `server/src/services/search/route2/orchestrator.response.ts:52`

---

### 2. ✅ No Tracking of Unknown Status

**Problem:**
- Many results have `openNow: 'UNKNOWN'` (no data from provider)
- Was not tracked separately
- Could lead to misleading insights like "most places closed" when actually "most status unknown"

**Fix:**
```typescript
// Added calculation for unknown count
const openNowUnknownCount = finalResults.filter((r: any) => 
  r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
).length;
```

**File:** `server/src/services/search/route2/orchestrator.response.ts:53-55`

---

### 3. ✅ Missing Metadata Field

**Problem:**
- `openNowUnknownCount` not passed to assistant context
- Assistant LLM couldn't make intelligent decisions about insight quality

**Fix:**
```typescript
metadata: {
  openNowCount,
  openNowUnknownCount,  // ✅ Added
  currentHour,
  ...(radiusKm !== undefined ? { radiusKm } : {}),
  ...(appliedFilters.length > 0 ? { filtersApplied: appliedFilters } : {})
}
```

**File:** `server/src/services/search/route2/orchestrator.response.ts:64-70`

---

### 4. ✅ Type Definition Missing Field

**Problem:**
- `AssistantSummaryContext` type didn't include `openNowUnknownCount`

**Fix:**
```typescript
metadata?: {
  openNowCount?: number;
  openNowUnknownCount?: number;  // ✅ Added
  currentHour?: number;
  radiusKm?: number;
  filtersApplied?: string[];
};
```

**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts:40-41`

---

## Verification

### Unit Tests: ✅ All Passing

**Test Suite:** `orchestrator-open-now.test.ts`

1. **Field name verification** - Confirms `r.openNow` usage (not `r.isOpenNow`)
2. **Unknown count calculation** - Verifies UNKNOWN/null/undefined detection
3. **Metadata inclusion** - Confirms both counts passed to metadata
4. **Type definition** - Confirms `openNowUnknownCount` in interface
5. **Documentation** - Complete regression scenario documented

**Test Scenarios:**
```typescript
// Scenario 1: Mixed status (3 open, 2 closed, 5 unknown)
✅ openNowCount = 3
✅ openNowUnknownCount = 5
✅ counts add up correctly

// Scenario 2: All unknown
✅ openNowCount = 0
✅ openNowUnknownCount = 4
✅ majority unknown detected

// Scenario 3: No coercion
✅ unknown NOT counted as false (closed)
✅ proper tri-state handling preserved
```

---

## Impact

### Before Fix
- **openNowCount:** Always 0 (field name mismatch)
- **Unknown tracking:** None
- **Assistant insights:** Potentially misleading (e.g., "most places closed" when data is mostly unknown)

### After Fix
- **openNowCount:** Correct count of truly open places
- **Unknown tracking:** Separate count for results with no status data
- **Assistant insights:** Can detect low-quality data and avoid false claims
- **Better UX:** No misleading statements when majority of status is unknown

---

## Example Scenario

**Query:** "pizza near me" returns 10 results

### Before Fix:
```
Results: 10 total
- 3 with openNow: true
- 2 with openNow: false  
- 5 with openNow: 'UNKNOWN'

Calculated:
- openNowCount = 0  ❌ (wrong field name)
- No unknown tracking

Assistant might say: "Most places are closed" (2/10 = 20%)
→ MISLEADING (we don't know status of 5)
```

### After Fix:
```
Results: 10 total
- 3 with openNow: true
- 2 with openNow: false
- 5 with openNow: 'UNKNOWN'

Calculated:
- openNowCount = 3  ✅ (correct)
- openNowUnknownCount = 5  ✅ (new)

Assistant detects majority unknown (5/10 = 50%)
→ Avoids "most places closed" insight
→ Focuses on other aspects (ratings, distance, etc.)
```

---

## Files Modified

1. **server/src/services/search/route2/orchestrator.response.ts**
   - Fixed field name: `isOpenNow` → `openNow`
   - Added `openNowUnknownCount` calculation
   - Passed both counts to metadata

2. **server/src/services/search/route2/assistant/assistant-llm.service.ts**
   - Added `openNowUnknownCount?: number` to metadata type

3. **server/src/services/search/route2/orchestrator-open-now.test.ts** (NEW)
   - Comprehensive regression tests
   - Mixed status scenarios
   - Edge cases (all unknown, no coercion)
   - Documentation of bug and fix

---

## Google Places Mapper: Already Correct ✅

The mapper was already correctly handling the field:

```typescript
// server/src/services/search/route2/stages/google-maps/result-mapper.ts:42-44
openNow: place.currentOpeningHours?.openNow !== undefined
  ? place.currentOpeningHours.openNow
  : 'UNKNOWN',
```

**Correct behavior:**
- If `currentOpeningHours.openNow` exists: use `true` or `false`
- If missing: return `'UNKNOWN'` (not coerced to `false`)
- Tri-state preserved: `true | false | 'UNKNOWN'`

---

## Prevention

**Root cause:** Field name mismatch + no type safety

**Recommendations:**
1. Add stronger typing for result objects (replace `any`)
2. Share type definitions between mapper and consumers
3. Add integration tests with real result shapes
4. Consider ESLint rule for accessing undefined properties

---

## Status: ✅ COMPLETE

All fixes implemented, tested, and verified.
- ✅ Field name corrected
- ✅ Unknown count tracked
- ✅ Metadata updated
- ✅ Types updated
- ✅ Tests passing
- ✅ No regressions
