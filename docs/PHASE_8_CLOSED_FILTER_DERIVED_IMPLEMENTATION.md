# Phase 8: "Closed Now" Derived Filter Implementation

**Status:** ✅ Complete  
**Date:** December 28, 2025  
**Goal:** Implement honest, transparent "Closed now" filtering within Google Places API constraints

---

## Problem

User reported that "פיצה בגדרה סגור" (pizza in Gedera closed) was returning the same results as an open search. After initial investigation, we discovered:

**Google Places API does NOT support `opennow: false`**

- ✅ `opennow: true` → Returns only open places (supported)
- ✅ No `opennow` parameter → Returns all places (supported)
- ❌ `opennow: false` → NOT SUPPORTED by Google

This is an API limitation, not a bug we can fix by adjusting parameters.

---

## Solution: Derived Filter with Transparency

Instead of pretending Google supports closed filtering, we implemented an honest solution:

1. **Fetch all results** from Google (no `opennow` parameter)
2. **Calculate summary** statistics (open/closed/unknown) BEFORE filtering
3. **Filter on backend** for `openNow === false`
4. **Display disclosure banner** informing users this is a derived filter
5. **Include metadata** with summary counts and capabilities

**Core Principle:** Honesty over features. We show the "Closed now" chip, but we're transparent that it's derived data, not a native Google filter.

---

## Implementation Summary

### Phase 1: Backend - Remove Fake API Filter

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Changes:**
- When `openNow === false`, do NOT send it to Google API
- Set `needsClosedFiltering` flag for post-processing
- Only send `openNow: true` to Google (supported)

```typescript
const needsClosedFiltering = openNow === false;

// Only send openNow to Google if it's true (they don't support false)
if (openNow === true) {
    filters.openNow = true;
}
```

---

### Phase 2: Backend - Summary Statistics

**File:** `server/src/services/search/utils/opening-hours-summary.ts` (NEW)

**Purpose:** Calculate open/closed/unknown counts BEFORE filtering

```typescript
export interface OpenNowSummary {
  open: number;
  closed: number;
  unknown: number;
  total: number;
}

export function calculateOpenNowSummary(results: RestaurantResult[]): OpenNowSummary {
  // Counts each result's openNow status
  // Must be called BEFORE filtering for accurate totals
}
```

---

### Phase 3: Backend - Derived Filtering

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Logic:**
1. Get all results from Google
2. Calculate summary statistics
3. Apply derived filter if needed
4. Update groups with filtered results

```typescript
// Calculate summary BEFORE filtering
const openNowSummary = calculateOpenNowSummary(allResults);

// Apply derived filter for "closed now"
if (needsClosedFiltering) {
    allResults = allResults.filter(r => r.openNow === false);
    // Update groups...
}

// Add to response meta
meta.openNowSummary = openNowSummary;
meta.capabilities = {
    openNowApiSupported: true,
    closedNowApiSupported: false,
    closedNowIsDerived: true,
};
```

---

### Phase 4: Backend - Response Metadata

**File:** `server/src/services/search/types/search-response.dto.ts`

**Added to `SearchResponseMeta`:**

```typescript
openNowSummary?: {
  open: number;
  closed: number;
  unknown: number;
  total: number;
};
capabilities?: {
  openNowApiSupported: boolean;
  closedNowApiSupported: boolean;
  closedNowIsDerived: boolean;
};
```

---

### Phase 5: Frontend - Type Updates

**File:** `llm-angular/src/app/domain/types/search.types.ts`

**Added to `SearchMeta`:**
- Same fields as backend (mirrored types)

---

### Phase 6: Frontend - Disclosure Banner

**Files:**
- `llm-angular/src/app/features/unified-search/components/disclosure-banner/disclosure-banner.component.ts`
- `disclosure-banner.component.html`
- `disclosure-banner.component.scss`
- `disclosure-banner.component.spec.ts`

**Purpose:** Show transparent message when closed filter is active

**Display:**
```
ℹ️ מציג רק מקומות סגורים (3 מתוך 10 תוצאות)
```

**On hover (title attribute):**
```
Google Places לא תומך בסינון סגור - מסננים תוצאות בצד שלנו
```

**Visibility:** Only shows when:
- `filterActive === 'closed'`
- `summary.closed > 0`

---

### Phase 7: Frontend - Integration

**File:** `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`

**Added:**
- Import `DisclosureBannerComponent`
- Computed signal `showClosedDisclosure()`
- Computed signal `closedFilterActive()`

**File:** `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`

**Added:** Disclosure banner between results header and chips

```html
@if (showClosedDisclosure() && facade.meta()?.openNowSummary) {
  <app-disclosure-banner
    [summary]="facade.meta()!.openNowSummary!"
    [filterActive]="closedFilterActive()"
  />
}
```

---

### Phase 8: i18n Translations

**Files:** `server/src/services/i18n/translations/*.json`

**Added to all languages (English, Hebrew, Arabic, Russian):**

```json
{
  "disclosure": {
    "closedNowDerived": "Showing only closed places ({{count}} of {{total}} results)",
    "closedNowExplanation": "Google Places doesn't support closed filter - we filter results on our side"
  }
}
```

---

### Phase 9: Tests

**Backend Tests:**
- **File:** `server/src/services/search/orchestrator/closed-filter.test.ts` (NEW)
- **Coverage:**
  - Summary calculation (all scenarios)
  - Derived filter behavior (integration)
  - No `openNow: false` sent to Google
  - Summary calculated before filtering
  - Capabilities metadata included
  - Real-world scenario: "פיצה בגדרה סגור"

**Frontend Tests:**
- **File:** `llm-angular/src/app/features/unified-search/components/disclosure-banner/disclosure-banner.component.spec.ts` (NEW)
- **Coverage:**
  - Banner visibility logic
  - Message formatting
  - Explanation text
  - DOM rendering

---

## Files Changed

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `search.orchestrator.ts` | Modified | +25 | Derived filter logic |
| `opening-hours-summary.ts` | New | +40 | Summary calculation |
| `search-response.dto.ts` | Modified | +20 | Response metadata |
| `search.types.ts` (FE) | Modified | +12 | Frontend types |
| `disclosure-banner/` (4 files) | New | +200 | Disclosure component |
| `search-page.component.ts` | Modified | +35 | Integration logic |
| `search-page.component.html` | Modified | +7 | Banner placement |
| `*.json` (i18n, 4 files) | Modified | +8 | Translations |
| `closed-filter.test.ts` | New | +180 | Backend tests |
| `CLOSED_FILTER_FIX.md` | Modified | +150 | Documentation |

**Total:** 20 files changed/added, ~677 lines

---

## Validation

### ✅ All Requirements Met

1. ✅ `openNow: false` NOT sent to Google API
2. ✅ Results fetched without opennow parameter when closed requested
3. ✅ Summary calculated before filtering (accurate counts)
4. ✅ Derived filter applied on backend
5. ✅ Disclosure banner shows in UI
6. ✅ Hebrew/English/Arabic/Russian translations added
7. ✅ Tests pass (backend + frontend)
8. ✅ No fake API behavior
9. ✅ Transparent to users

### ✅ No Linter Errors

All files pass TypeScript and ESLint validation.

---

## User Experience

**Query:** "פיצה בגדרה סגור"

### Before Phase 8
- Returns all restaurants (open + closed)
- No explanation
- Confusing UX

### After Phase 8
1. ✅ Shows only closed pizza places
2. ✅ Displays disclosure: "מציג רק מקומות סגורים (3 מתוך 10 תוצאות)"
3. ✅ User can hover to see explanation
4. ✅ Summary shows true counts: `{ open: 5, closed: 3, unknown: 2, total: 10 }`
5. ✅ Capabilities flag: `closedNowIsDerived: true`

**Result:** Users get the functionality they want with full transparency about how it works.

---

## Technical Guarantees

1. **No Fake API Calls:** `openNow: false` is never sent to Google
2. **Accurate Summary:** Calculated before filtering to show true totals
3. **Backend Filtering:** Derived filter applied after receiving all results
4. **Transparent UI:** Disclosure banner when filter is active
5. **Metadata:** Response always includes summary + capabilities

---

## Key Decisions

### Why Not Hide the Limitation?

**Option A:** Pretend Google supports closed filtering (hide the truth)
- ❌ Dishonest
- ❌ Can break if Google changes behavior
- ❌ No way to show accurate summary

**Option B:** Derived filter with transparency (our choice)
- ✅ Honest with users
- ✅ Works within API constraints
- ✅ Shows accurate summary
- ✅ Future-proof

**Decision:** We chose honesty over features. Users appreciate transparency.

### Why Calculate Summary Before Filtering?

If we calculated summary after filtering:
- ❌ Summary would show `{ closed: 3, total: 3 }` (misleading)
- ❌ Users wouldn't know how many results were filtered out
- ❌ No transparency

By calculating before:
- ✅ Summary shows `{ open: 5, closed: 3, unknown: 2, total: 10 }`
- ✅ Users see "3 out of 10 results" (transparent)
- ✅ Can make informed decisions

---

## Performance Impact

**Minimal:** 
- Summary calculation is O(n) - negligible
- No additional API calls
- Frontend banner only renders when filter is active

**Cache-friendly:**
- Derived filter doesn't change cache keys
- Summary is lightweight metadata

---

## Future Enhancements (Optional)

1. **Analytics:** Track how often users search for closed restaurants
2. **A/B Test:** Test different disclosure banner designs
3. **API Watch:** Monitor if Google adds `opennow: false` support
4. **Smart Suggestions:** "These places are closed now. Search for open alternatives?"

---

## Summary

✅ **Complete:** All 9 todos finished  
✅ **Tested:** 20+ test cases passing  
✅ **Documented:** Full transparency in UI and docs  
✅ **Principle:** Honesty over features  

**Impact:** Users can now search for closed restaurants with full transparency about how the filter works. The system correctly handles Google's API limitation while being completely honest with users.

**Example:** "פיצה בגדרה סגור" now returns only closed pizza places in Gedera, with a disclosure banner showing the exact count! 🎉

---

## Next Steps

1. Deploy to staging
2. Test "פיצה בגדרה סגור" query manually
3. Verify disclosure banner appears
4. Monitor user feedback
5. Deploy to production

**Ready for deployment!** ✅

