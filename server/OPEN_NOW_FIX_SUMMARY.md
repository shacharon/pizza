# ✅ OPEN_NOW Filter Fix - Summary

## Problem
Query `"מסעדות פתוחות לידי"` returned **0 results** despite Google returning 5 restaurants.

**Root Cause**: Post-filter was **removing ALL places with unknown `openNow` status**.

---

## Solution
**Changed policy**: **KEEP unknown status by default** (instead of removing)

**Rationale**: Better UX to show some results than zero results when data is missing.

---

## Files Changed

| File | Changes |
|------|---------|
| `post-results.filter.ts` | Changed unknown policy: REMOVE → KEEP |
| `route2.orchestrator.ts` | Updated logging: added `unknownKept`/`unknownRemoved` |
| `test-open-now-filter.js` | **NEW** - 6 verification tests |
| `docs/OPEN_NOW_FILTER_FIX.md` | **NEW** - Full documentation |

---

## Code Changes

### Before (BROKEN)
```typescript
if (openNow === undefined || openNow === null) {
  unknownCount++;
  return false; // ❌ EXCLUDE ALL UNKNOWN
}
```

**Result**: 5 restaurants → 0 results ❌

---

### After (FIXED)
```typescript
// Explicit status: apply filter
if (openNow === true) return true;      // KEEP open
if (openNow === false) return false;    // REMOVE closed

// Unknown status: KEEP by default (NEW)
if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
  unknownKept++;
  return true; // ✅ KEEP UNKNOWN
}
```

**Result**: 5 restaurants → 5 results ✅

---

## Testing Results

### Manual Tests: ✅ 6/6 PASSED

```
✅ Test 1: OPEN_NOW keeps explicitly OPEN places
✅ Test 2: OPEN_NOW removes explicitly CLOSED places
✅ Test 3: OPEN_NOW KEEPS places with UNKNOWN status ← FIX
✅ Test 4: openState=null does NOT filter anything
✅ Test 5: REAL SCENARIO - All unknown → all kept ← VERIFIED
✅ Test 6: MIXED - 3 open + 2 unknown kept, 2 closed removed
```

**Key Test (Real Scenario)**:
```
Input: 5 Nearby restaurants (all openNow=undefined)
Output: 5 kept (unknownKept=5, unknownRemoved=0)
```

---

## Behavior Comparison

### Old Policy (BROKEN)
| `openNow` Status | Action |
|------------------|--------|
| `true` | ✅ KEEP |
| `false` | ❌ REMOVE |
| `undefined` / `null` / `'UNKNOWN'` | ❌ **REMOVE** |

**Problem**: Removed ALL results when data missing

---

### New Policy (FIXED)
| `openNow` Status | Action |
|------------------|--------|
| `true` | ✅ KEEP |
| `false` | ❌ REMOVE |
| `undefined` / `null` / `'UNKNOWN'` | ✅ **KEEP** |

**Benefit**: Show results even when data incomplete

---

## Log Changes

### Before
```json
{
  "event": "post_filter_applied",
  "stats": {
    "before": 5,
    "after": 0,
    "removed": 5,
    "unknownExcluded": 5
  }
}
```

### After
```json
{
  "event": "post_filter_applied",
  "openState": "OPEN_NOW",
  "stats": {
    "before": 5,
    "after": 5,
    "removed": 0,
    "unknownKept": 5,      // NEW
    "unknownRemoved": 0    // NEW
  }
}
```

---

## Impact

### Benefits
✅ Fixes critical bug ("near me" queries work)  
✅ Better UX (some results > no results)  
✅ Still removes explicitly closed places  
✅ Transparent metrics for monitoring  

### Risks
⚠️ Unknown places might actually be closed  
   - Mitigation: User can check individual details  
⚠️ Less strict than before  
   - Mitigation: Still removes explicit closed status  

---

## Verification Command

```bash
cd server
npm run build
node test-open-now-filter.js
```

**Expected**: ✅ 6/6 tests pass

---

## Query Behavior After Fix

### Query: `"מסעדות פתוחות לידי"`

**Google Nearby Returns**: 5 restaurants  
**`openNow` Status**: All `undefined` (no hours data)  

**Before Fix**:
```
Post-filter: 5 → 0 (all removed)
User sees: ❌ "No results"
```

**After Fix**:
```
Post-filter: 5 → 5 (all kept)
User sees: ✅ 5 restaurants
Log: unknownKept=5
```

---

## Rollback

If needed, revert to old policy in `post-results.filter.ts`:

```typescript
if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
  unknownRemoved++;
  return false; // OLD: REMOVE unknown
}
```

---

**Status**: ✅ DEPLOYED  
**Build**: ✅ PASSING  
**Tests**: ✅ 6/6 PASSING  
**Date**: 2026-01-20
