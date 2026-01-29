# OpenNow Conditional Omission - Complete

**Date:** 2026-01-29

## Summary
Refined the openNow metadata logic to completely omit time-based fields when ANY result has unknown status. This prevents the assistant from making misleading time-based insights based on incomplete data.

---

## Refinement Applied

### Previous Behavior (Phase 1)
- Calculated `openNowCount` (correctly using `r.openNow`, not `r.isOpenNow`)
- Calculated `openNowUnknownCount`
- **Passed BOTH counts to assistant metadata**
- Let the assistant decide how to handle unknowns

**Problem:** Assistant still received partial data and had to make decisions about data quality.

### Current Behavior (Phase 2 - FINAL)
- Calculate tri-state split: `openNowCount` (true), `closedCount` (false), `openNowUnknownCount` (unknown/null/undefined)
- **ONLY include `openNowCount` + `currentHour` in metadata IF `openNowUnknownCount === 0`**
- **Otherwise, OMIT both fields entirely**
- Assistant never receives partial or low-quality time-based data

---

## Code Changes

### 1. orchestrator.response.ts - Tri-State Split + Conditional Omission

```typescript
// BEFORE (Phase 1):
const openNowCount = finalResults.filter((r: any) => r.openNow === true).length;
const openNowUnknownCount = finalResults.filter((r: any) => 
  r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
).length;

metadata: {
  openNowCount,           // Always passed
  openNowUnknownCount,    // Always passed
  currentHour,            // Always passed
  // ...
}

// AFTER (Phase 2 - CURRENT):
const openNowCount = finalResults.filter((r: any) => r.openNow === true).length;
const closedCount = finalResults.filter((r: any) => r.openNow === false).length;
const openNowUnknownCount = finalResults.filter((r: any) => 
  r.openNow === 'UNKNOWN' || r.openNow === null || r.openNow === undefined
).length;

metadata: {
  // CRITICAL: Only include if ALL results have known status
  ...(openNowUnknownCount === 0 ? { openNowCount, currentHour } : {}),
  ...(radiusKm !== undefined ? { radiusKm } : {}),
  ...(appliedFilters.length > 0 ? { filtersApplied: appliedFilters } : {})
}
```

**Key Changes:**
- Added `closedCount` calculation for complete tri-state tracking
- Use conditional spread to **omit** `openNowCount` + `currentHour` when any unknowns exist
- `openNowUnknownCount` is calculated internally but NOT passed to assistant
- Other metadata (radiusKm, filtersApplied) still included regardless of openNow status

**File:** `server/src/services/search/route2/orchestrator.response.ts:52-72`

---

### 2. assistant-llm.service.ts - Updated Type Documentation

```typescript
// BEFORE:
metadata?: {
  openNowCount?: number; // How many results are currently open
  openNowUnknownCount?: number; // How many results have unknown open/closed status
  currentHour?: number; // Current hour (0-23) for time-based insights
  radiusKm?: number;
  filtersApplied?: string[];
};

// AFTER:
metadata?: {
  // NOTE: openNowCount and currentHour are ONLY included if ALL results have known status
  // If any result has unknown status, these fields are omitted entirely
  openNowCount?: number; // How many results are currently open (only if no unknowns)
  currentHour?: number; // Current hour (0-23) for time-based insights (only if no unknowns)
  radiusKm?: number; // Search radius in kilometers
  filtersApplied?: string[]; // Active filters (e.g., ['OPEN_NOW', 'kosher', 'price:2'])
};
```

**Key Changes:**
- Removed `openNowUnknownCount` from interface (used internally only)
- Added clear documentation: fields only present if NO unknowns
- Comments explain conditional inclusion behavior

**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts:38-46`

---

## Test Coverage

### Updated Test Suite: `orchestrator-open-now.test.ts`

**9 tests - all passing ✅**

#### Suite 1: Route2 Orchestrator - OpenNow Field Fix (5 tests)
1. ✅ Verify correct field name: `r.openNow` (not `r.isOpenNow`)
2. ✅ Verify `openNowUnknownCount` is calculated internally
3. ✅ Verify conditional inclusion logic: `openNowUnknownCount === 0 ? { openNowCount, currentHour } : {}`
4. ✅ Verify type documentation mentions conditional behavior
5. ✅ Document complete regression scenario

#### Suite 2: Route2 - Mixed OpenNow Status Handling (4 tests)
1. ✅ Tri-state split: 3 open + 2 closed + 5 unknown = 10 total
2. ✅ Edge case: all results unknown → should omit metadata
3. ✅ No coercion: unknown ≠ false (closed)
4. ✅ Conditional omission:
   - **All known** (0 unknowns) → ✅ Include `openNowCount` + `currentHour`
   - **Any unknown** (1+ unknowns) → ❌ Omit both fields

---

## Behavior Examples

### Scenario 1: All Results Have Known Status ✅ Include Metadata

**Results:**
```typescript
[
  { name: 'Pizza A', openNow: true },   // Open
  { name: 'Pizza B', openNow: true },   // Open
  { name: 'Pizza C', openNow: false },  // Closed
  { name: 'Pizza D', openNow: false }   // Closed
]
```

**Calculated:**
```typescript
openNowCount = 2
closedCount = 2
openNowUnknownCount = 0  // ← All status known
currentHour = 14 (2 PM)
```

**Metadata Sent to Assistant:**
```json
{
  "openNowCount": 2,
  "currentHour": 14,
  "radiusKm": 5,
  "filtersApplied": []
}
```

**Result:** ✅ Assistant can make time-based insights like "2 out of 4 places currently open at 2 PM"

---

### Scenario 2: Some Results Have Unknown Status ❌ Omit Metadata

**Results:**
```typescript
[
  { name: 'Pizza A', openNow: true },      // Open
  { name: 'Pizza B', openNow: 'UNKNOWN' }, // Unknown ← Problem!
  { name: 'Pizza C', openNow: false }      // Closed
]
```

**Calculated:**
```typescript
openNowCount = 1
closedCount = 1
openNowUnknownCount = 1  // ← At least one unknown
currentHour = 14 (2 PM)
```

**Metadata Sent to Assistant:**
```json
{
  "radiusKm": 5,
  "filtersApplied": []
}
```
*(Note: `openNowCount` and `currentHour` completely OMITTED)*

**Result:** ❌ Assistant has NO time-based data, cannot make statements about "currently open" or time patterns. Will focus on other aspects like ratings, distance, etc.

---

### Scenario 3: All Results Unknown ❌ Omit Metadata

**Results:**
```typescript
[
  { name: 'Pizza A', openNow: 'UNKNOWN' },
  { name: 'Pizza B', openNow: null },
  { name: 'Pizza C', openNow: undefined }
]
```

**Calculated:**
```typescript
openNowCount = 0
closedCount = 0
openNowUnknownCount = 3  // ← All unknown
currentHour = 14 (2 PM)
```

**Metadata Sent to Assistant:**
```json
{
  "radiusKm": 5,
  "filtersApplied": []
}
```

**Result:** ❌ No time-based metadata sent. Assistant cannot claim anything about current status.

---

## Impact & Benefits

### Zero False Insights
- Assistant **never** receives partial time-based data
- **Cannot** make statements like "most places closed" when data is incomplete
- Eliminates risk of misleading users with uncertain information

### All-or-Nothing Quality Gate
- **100% known status** → ✅ Time-based insights enabled
- **<100% known status** → ❌ Time-based insights disabled
- Clear binary decision, no gray area

### Tri-State Tracking
- **Open** (`openNow: true`)
- **Closed** (`openNow: false`)
- **Unknown** (`openNow: 'UNKNOWN' | null | undefined`)
- Counts add up to total results

### Other Metadata Unaffected
- `radiusKm` always included if present
- `filtersApplied` always included if non-empty
- Only `openNowCount` + `currentHour` are conditional

---

## Files Modified

1. **server/src/services/search/route2/orchestrator.response.ts**
   - Added `closedCount` calculation
   - Implemented conditional metadata omission
   - Only include `openNowCount` + `currentHour` if `openNowUnknownCount === 0`

2. **server/src/services/search/route2/assistant/assistant-llm.service.ts**
   - Removed `openNowUnknownCount` from type (internal use only)
   - Updated documentation to explain conditional behavior
   - Clarified when fields are present vs. omitted

3. **server/src/services/search/route2/orchestrator-open-now.test.ts**
   - Updated test #3: verify conditional inclusion logic
   - Updated test #4: verify type documentation (not checking for removed field)
   - Updated test #5: document Phase 2 refinement
   - Added test #9: verify all-known vs. any-unknown scenarios

---

## Google Places Mapper: No Changes ✅

The mapper remains correct (unchanged from Phase 1):

```typescript
// server/src/services/search/route2/stages/google-maps/result-mapper.ts:42-44
openNow: place.currentOpeningHours?.openNow !== undefined
  ? place.currentOpeningHours.openNow
  : 'UNKNOWN',
```

**Behavior:**
- Returns `true` if open
- Returns `false` if closed
- Returns `'UNKNOWN'` if no data (not coerced to false)
- Tri-state preserved at the source

---

## Comparison: Phase 1 vs. Phase 2

| Aspect | Phase 1 | Phase 2 (CURRENT) |
|--------|---------|-------------------|
| **Field name** | ✅ `r.openNow` (fixed) | ✅ `r.openNow` (unchanged) |
| **Unknown tracking** | ✅ Calculated | ✅ Calculated (internal only) |
| **Passed to assistant** | `openNowCount`, `openNowUnknownCount`, `currentHour` | **Conditional:** only if `openNowUnknownCount === 0` |
| **Assistant decision** | Must handle partial data | ✅ **Never receives partial data** |
| **Risk of false insights** | Low (assistant aware of unknowns) | ✅ **Zero** (no data if incomplete) |
| **Data quality gate** | Soft (assistant decides) | ✅ **Hard** (all-or-nothing) |
| **Tri-state split** | Implicit | ✅ **Explicit** (open/closed/unknown) |

---

## Status: ✅ COMPLETE

All refinements implemented, tested, and verified.
- ✅ Tri-state split (open/closed/unknown)
- ✅ Conditional omission (`openNowUnknownCount === 0`)
- ✅ No partial data sent to assistant
- ✅ Type definitions updated
- ✅ Tests passing (9/9)
- ✅ No compilation errors
- ✅ No linter errors

**Zero risk of misleading time-based insights.**
