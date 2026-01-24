# OPEN_NOW Filter Fix - Unknown Status Policy

## Problem Statement

**Bug**: Query `"מסעדות פתוחות לידי"` (open restaurants near me) was returning **0 results** despite Google Nearby API returning 5 valid restaurants.

**Root Cause**: The `OPEN_NOW` post-filter was **removing ALL places with unknown `openNow` status** (lines 94-96 in `post-results.filter.ts`).

**Evidence**:
```json
{
  "event": "post_filter_applied",
  "openState": "OPEN_NOW",
  "stats": {
    "before": 5,
    "after": 0,
    "removed": 5,
    "unknownExcluded": 5  // ← All 5 places had unknown status
  }
}
```

---

## Root Cause Analysis

### Old Logic (BROKEN)

```typescript
if (openState === 'OPEN_NOW') {
  const filtered = results.filter(place => {
    const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
    if (openNow === undefined || openNow === null) {
      unknownCount++;
      return false; // ❌ EXCLUDE UNKNOWN
    }
    return openNow === true;
  });
  return { filtered, unknownCount };
}
```

**Problem**: 
- Google Places API (New) doesn't always return `currentOpeningHours.openNow`
- Especially for Nearby searches without explicit field requests
- Removing ALL unknown places = removing ALL results in many cases

---

## Solution

### New Logic (FIXED)

**Policy**: **KEEP unknown status by default** (better UX than removing all results)

```typescript
if (openState === 'OPEN_NOW') {
  const filtered = results.filter(place => {
    const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
    
    // Explicit status: apply filter
    if (openNow === true) {
      return true; // ✅ KEEP open places
    }
    if (openNow === false) {
      return false; // ❌ REMOVE closed places
    }
    
    // Unknown status: KEEP by default (better UX)
    if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
      unknownKept++;
      return true; // ✅ KEEP unknown (NEW POLICY)
    }
    
    return false;
  });
  return { filtered, unknownKept, unknownRemoved };
}
```

**Benefits**:
1. ✅ Still removes **explicitly closed** places
2. ✅ Still keeps **explicitly open** places
3. ✅ **NEW**: Keeps places with **unknown** status (don't punish missing data)
4. ✅ Better UX: Some results > No results

---

## Implementation

### Files Changed

| File | Type | Changes |
|------|------|---------|
| `server/src/services/search/route2/post-filters/post-results.filter.ts` | **MODIFIED** | Changed unknown policy from REMOVE to KEEP |
| `server/src/services/search/route2/route2.orchestrator.ts` | **MODIFIED** | Updated logging to include `unknownKept`/`unknownRemoved` |
| `server/test-open-now-filter.js` | **NEW** | Manual verification tests |
| `server/docs/OPEN_NOW_FILTER_FIX.md` | **NEW** | This documentation |

---

### Code Changes

#### 1. Updated Interface (`post-results.filter.ts`)

```diff
  export interface PostFilterOutput {
    resultsFiltered: any[];
    applied: {
      openState: OpenState;
    };
    stats: {
      before: number;
      after: number;
      removed: number;
-     unknownExcluded: number;
+     unknownKept: number;
+     unknownRemoved: number;
    };
  }
```

#### 2. Updated Filter Logic (All States)

**OPEN_NOW**:
```typescript
if (openState === 'OPEN_NOW') {
  const filtered = results.filter(place => {
    const openNow = place.openNow ?? place.currentOpeningHours?.openNow;
    
    if (openNow === true) return true;      // KEEP open
    if (openNow === false) return false;    // REMOVE closed
    
    // Unknown: KEEP by default
    if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
      unknownKept++;
      return true; // NEW POLICY
    }
    
    return false;
  });
  return { filtered, unknownKept, unknownRemoved };
}
```

**CLOSED_NOW**: Same policy (keep unknown)

**OPEN_AT / OPEN_BETWEEN**: Same policy (keep unparseable)

#### 3. Updated Logging (`route2.orchestrator.ts`)

```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  event: 'post_filter_applied',
  openState: postFilterResult.applied.openState,
  stats: {
    before: postFilterResult.stats.before,
    after: postFilterResult.stats.after,
    removed: postFilterResult.stats.removed,
    unknownKept: postFilterResult.stats.unknownKept,    // NEW
    unknownRemoved: postFilterResult.stats.unknownRemoved // NEW
  }
}, '[ROUTE2] Post-filters applied');
```

---

## Testing

### Manual Verification Tests

Run: `node test-open-now-filter.js`

**Test Suite**: 6 tests

```
Test 1: OPEN_NOW keeps explicitly OPEN places
✅ PASS: Kept 2/2 open places

Test 2: OPEN_NOW removes explicitly CLOSED places
✅ PASS: Removed 2 closed places, kept 1

Test 3: OPEN_NOW KEEPS places with UNKNOWN status (default policy)
✅ PASS: Kept 4/5 places (unknownKept=3, unknownRemoved=0)
   ✅ 1 explicitly open + 3 unknown + 0 closed

Test 4: openState=null does NOT filter anything
✅ PASS: Kept all 3 places (no filtering)

Test 5: REAL SCENARIO - Nearby returns 5 places, all with unknown openNow
✅ PASS: Kept all 5/5 Nearby results
   ✅ unknownKept=5, unknownRemoved=0 (NEW POLICY)
   ✅ FIX VERIFIED: No longer removing all results!

Test 6: MIXED - Some open, some closed, some unknown
✅ PASS: Kept 5/7 places
   ✅ 3 open + 2 unknown kept, 2 closed removed

=== Results ===
Passed: 6/6
```

---

## Behavior Examples

### Before Fix (BROKEN)

**Query**: `"מסעדות פתוחות לידי"`  
**Google Nearby**: Returns 5 restaurants (all with `openNow=undefined`)  
**Post-Filter**: 
```json
{
  "before": 5,
  "after": 0,      // ❌ ALL REMOVED
  "removed": 5,
  "unknownExcluded": 5
}
```
**User sees**: 0 results ❌

---

### After Fix (WORKING)

**Query**: `"מסעדות פתוחות לידי"`  
**Google Nearby**: Returns 5 restaurants (all with `openNow=undefined`)  
**Post-Filter**: 
```json
{
  "before": 5,
  "after": 5,      // ✅ ALL KEPT
  "removed": 0,
  "unknownKept": 5,
  "unknownRemoved": 0
}
```
**User sees**: 5 results ✅

---

### Mixed Scenario

**Google Returns**:
- 3 places with `openNow=true`
- 2 places with `openNow=false`
- 2 places with `openNow=undefined`

**Post-Filter Result**:
```json
{
  "before": 7,
  "after": 5,      // 3 open + 2 unknown
  "removed": 2,    // 2 closed
  "unknownKept": 2,
  "unknownRemoved": 0
}
```

**Breakdown**:
- ✅ Kept: 3 open + 2 unknown = **5 results**
- ❌ Removed: 2 closed

---

## Policy Comparison

| Status | Old Policy | New Policy | Rationale |
|--------|-----------|-----------|-----------|
| `openNow=true` | ✅ KEEP | ✅ KEEP | Explicitly open |
| `openNow=false` | ❌ REMOVE | ❌ REMOVE | Explicitly closed |
| `openNow=undefined` | ❌ REMOVE | ✅ **KEEP** | **Don't punish missing data** |
| `openNow=null` | ❌ REMOVE | ✅ **KEEP** | **Don't punish missing data** |
| `openNow='UNKNOWN'` | ❌ REMOVE | ✅ **KEEP** | **Don't punish missing data** |

---

## Production Impact

### Benefits

✅ **Fixes critical bug**: "near me" queries no longer return 0 results  
✅ **Better UX**: Some results > No results  
✅ **Backward compatible**: Still removes explicitly closed places  
✅ **Transparent**: New metrics (`unknownKept`) for monitoring  
✅ **Configurable**: Can add strict mode later if needed  

### Risks

⚠️ **False positives**: Unknown places might actually be closed  
   - **Mitigation**: Users can see individual place details
   - **Future**: Add "Unverified hours" badge in UI

⚠️ **Less strict filtering**: More lenient than before  
   - **Mitigation**: Still removes explicitly closed places
   - **Future**: Add user preference toggle

---

## Monitoring

### Key Metrics

Track these in production logs:

```json
{
  "event": "post_filter_applied",
  "openState": "OPEN_NOW",
  "stats": {
    "before": 5,
    "after": 5,
    "removed": 0,
    "unknownKept": 5,      // ← Monitor this
    "unknownRemoved": 0    // ← Should stay 0
  }
}
```

**What to watch**:
- **`unknownKept` rate**: How often are we keeping unknown places?
- **`unknownRemoved`**: Should be 0 with default policy
- **User feedback**: Do users complain about closed places showing up?

---

## Future Enhancements

1. **Strict Mode** (configurable):
   - Add `UNKNOWN_POLICY: 'KEEP' | 'REMOVE'` config
   - Default: `KEEP` (current behavior)
   - Allow admins to switch to `REMOVE` if needed

2. **UI Indicators**:
   - Show "Hours unverified" badge for unknown places
   - Reduce rank/priority for unknown places in sorting

3. **Data Quality**:
   - Track which places consistently have missing `openNow`
   - Request missing field mask from Google API more explicitly

4. **User Preference**:
   - Let users toggle "Show places with unknown hours"
   - Remember preference per user

---

## Rollback Plan

If issues arise, revert to old policy:

**In `post-results.filter.ts`, line ~120**:

```typescript
// OLD POLICY (strict)
if (openNow === undefined || openNow === null || openNow === 'UNKNOWN') {
  unknownRemoved++;
  return false; // REMOVE unknown
}
```

Rebuild and redeploy.

---

## Related Files

- `post-results.filter.ts` - Filter implementation
- `route2.orchestrator.ts` - Pipeline integration
- `google-maps.stage.ts` - Field mask (includes `currentOpeningHours`)
- `OPENING_HOURS_ARCHITECTURE.md` - Overall architecture

---

**Status**: ✅ FIXED  
**Build**: ✅ PASSING  
**Tests**: ✅ 6/6 PASSING  
**Deployed**: 2026-01-20  

**Fixed By**: Cursor AI Assistant
