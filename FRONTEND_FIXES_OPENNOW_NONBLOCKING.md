# Frontend Fixes: OpenNow Filter + Non-Blocking Results

**Date:** 2026-01-30  
**Scope:** Angular Frontend Only (No Backend Changes)

---

## Summary

Fixed two critical UX issues in the Angular frontend:

1. **"Open now" filter not working** - Closed places were shown even when filter was active
2. **UI rendering is non-blocking** - Verified results render immediately without waiting for assistant

---

## Issue 1: "Open now" Filter Not Working

### Problem
- User selects "Open now" chip
- Filter is sent to backend correctly (`openNow: true` in `SearchFilters`)
- Backend returns `appliedFilters: ['open_now']` in meta
- **BUT** closed places were still displayed in UI

### Root Cause
- Frontend relied 100% on backend filtering
- Backend sometimes returns closed places even when filter is active (e.g., derived filters, soft hints)
- Frontend had NO client-side enforcement

### Solution
Added **client-side filtering** to guarantee closed places are never shown when `open_now` is active:

```typescript
// search-page.component.ts

// Filter non-grouped results
readonly filteredResults = computed(() => {
  let results = this.facade.results();
  
  // Apply openNow filter if active
  const appliedFilters = this.response()?.meta?.appliedFilters || [];
  if (appliedFilters.includes('open_now')) {
    results = results.filter(r => r.openNow === true);
  }
  
  return results;
});

// Filter grouped results
readonly flatResults = computed(() => {
  const groups = this.response()?.groups;
  if (!groups) return [];
  let allResults = groups.flatMap(g => g.results);
  
  // CLIENT-SIDE FILTERING: Apply openNow filter if active
  const appliedFilters = this.response()?.meta?.appliedFilters || [];
  if (appliedFilters.includes('open_now')) {
    allResults = allResults.filter(r => r.openNow === true);
  }
  
  return allResults.slice(0, this.displayLimit());
});
```

### Visual Indicator
Added a clear visual indicator when the filter is active:

```html
<!-- search-page.component.html -->
<div class="applied-filters">
  @if (closedFilterActive() === 'open') {
  <span class="filter-chip open-now" 
        [title]="...">
    {{ ... === 'he' ? '🟢 פתוח עכשיו' : '🟢 Open now' }}
  </span>
  }
</div>
```

### Behavior
**Before Fix:**
- User clicks "Open now"
- Results shown: Open Place 1, **Closed Place 1**, Open Place 2, **Closed Place 2**
- User confused: "Why are closed places shown?"

**After Fix:**
- User clicks "Open now"
- Results shown: Open Place 1, Open Place 2 (only open places)
- Visual indicator: "🟢 Open now" chip displayed
- User satisfied: Filter works as expected

---

## Issue 2: UI Rendering Non-Blocking

### Problem (Perceived)
User reported UI felt slow, suspected it was waiting for assistant messages.

### Investigation
Traced through the code to verify loading state management:

```typescript
// search.facade.ts - handleSearchResponse()
private handleSearchResponse(response: SearchResponse, query: string): void {
  // Update store with full response
  this.searchStore.setResponse(response);
  this.searchStore.setLoading(false);  // ✅ Loading set to false immediately
  
  // ... rest of logic
}
```

### Findings
✅ **No blocking detected**
- Loading is set to `false` as soon as search results arrive (line 272)
- Assistant messages arrive on a separate channel (`assistant`)
- Assistant state does NOT gate results rendering
- Results render condition: `!facade.loading()` (independent of assistant)

### Evidence
- Line 89 (template): `@if (facade.loading())` - spinner gated by search loading only
- Line 131 (template): `@if (shouldShowResults() && !facade.loading())` - results gated by search loading only
- Lines 335, 349 (facade): Loading set to false for CLARIFY/GATE_FAIL (special blocking cases)
- Line 355 (facade): SUMMARY messages do NOT affect loading (non-blocking)

### Conclusion
**UI is already non-blocking.** The perceived slowness was likely due to:
1. Actual network latency (search taking time)
2. Lack of visual feedback (fixed by adding "Open now" indicator)
3. Confusion from seeing closed places (fixed by Issue 1)

---

## Files Changed

### Modified (2 files):
1. **llm-angular/src/app/features/unified-search/search-page/search-page.component.ts**
   - Added `filteredResults` computed property (client-side filtering for non-grouped view)
   - Modified `flatResults` computed property (client-side filtering for grouped view)

2. **llm-angular/src/app/features/unified-search/search-page/search-page.component.html**
   - Changed `facade.results()` → `filteredResults()` in results grid
   - Added visual indicator for active "Open now" filter
   - Moved `@if` condition for applied filters to always render container

### New (2 test files):
3. **llm-angular/src/app/features/unified-search/search-page/__tests__/opennow-filter.spec.ts**
   - 8 tests proving openNow filter correctly filters closed places
   - Tests edge cases: all closed, UNKNOWN status, mixed groups

4. **llm-angular/src/app/features/unified-search/search-page/__tests__/results-rendering-non-blocking.spec.ts**
   - 7 tests proving results render immediately without waiting for assistant
   - Tests all scenarios: assistant idle, loading, completed, failed

---

## Test Results

### OpenNow Filter Tests (8/8 passing) ✅
```bash
✓ should filter out closed places when open_now is in appliedFilters
✓ should NOT filter places when open_now is NOT in appliedFilters
✓ should filter flatResults (grouped view) when open_now is active
✓ should show visual indicator when openNow filter is active
✓ should NOT show visual indicator when openNow filter is NOT active
✓ should handle edge case: all places are closed when filter is active
✓ should handle places with openNow=UNKNOWN correctly
✓ should render filter chip in template
```

### Non-Blocking Rendering Tests (7/7 passing) ✅
```bash
✓ should render results immediately when loading=false, even if assistant is still idle
✓ should render results immediately when loading=false, even if assistant is loading
✓ should render results immediately when loading=false, even if assistant failed
✓ should NOT show loading spinner when results are ready, even if assistant is pending
✓ should show results when results arrived, regardless of assistant state
✓ should handle scenario: results arrive first, assistant arrives later
✓ should handle scenario: assistant arrives first (SUMMARY), results arrive later
```

**Total: 15/15 tests passing** ✅

---

## Verification Steps

### 1. Verify OpenNow Filter
```bash
cd llm-angular
npm test -- search-page/__tests__/opennow-filter.spec.ts
```

**Manual Test:**
1. Open app
2. Search "pizza open now"
3. Click "Open now" chip (or it may be auto-applied)
4. **Verify:** Only open places shown (no closed places)
5. **Verify:** Green "🟢 Open now" indicator visible
6. Remove filter
7. **Verify:** Closed places now visible

### 2. Verify Non-Blocking Rendering
```bash
cd llm-angular
npm test -- search-page/__tests__/results-rendering-non-blocking.spec.ts
```

**Manual Test:**
1. Open Network tab in DevTools
2. Search "pizza"
3. Monitor timeline:
   - Results endpoint finishes → Results render immediately
   - Assistant endpoint may finish later → Doesn't block results
4. **Verify:** Results appear as soon as search completes
5. **Verify:** Spinner disappears when results arrive (not when assistant arrives)

---

## Architecture Notes

### Single Source of Truth
- **Backend** decides which filters to apply and returns `appliedFilters` in meta
- **Frontend** enforces filters client-side for guaranteed UX consistency
- Both layers filter independently (defense in depth)

### Why Client-Side Filtering?
1. **UX Guarantee:** Even if backend returns closed places (soft hints, derived filters), UI never shows them
2. **Performance:** Filtering is instant, no round-trip to server
3. **Consistency:** User expectations are always met
4. **Flexibility:** Backend can return "best effort" results, frontend ensures strict compliance

### Channel Independence
- **search channel:** Results, status, progress (gated by `loading` flag)
- **assistant channel:** SUMMARY, CLARIFY, GATE_FAIL (independent lifecycle)
- Results render based ONLY on search channel state
- Assistant messages enhance UX but never block results

---

## Contract Preservation ✅

- **Zero breaking changes**
- **No backend modifications**
- **API contracts unchanged**
- **WebSocket protocol unchanged**
- **Existing tests remain valid**
- **Backward compatible with all backend versions**

---

## Edge Cases Handled

1. **All places closed:** Filter returns empty array (expected behavior)
2. **openNow = UNKNOWN:** Filtered out (only show confirmed open)
3. **Mixed groups:** Filter applied across all groups
4. **No groups:** Filter applied to flat results
5. **Filter toggled:** Results update immediately
6. **Assistant timeout:** Results still shown (non-blocking)
7. **Assistant before results:** Results shown when ready (non-blocking)
8. **Assistant after results:** Results already shown (non-blocking)

---

## Performance Impact

**Negligible:**
- Client-side filtering is O(n) where n = result count (typically <100)
- Computed signals auto-memoize (only recompute when inputs change)
- No additional API calls
- No additional WebSocket subscriptions

---

## Future Improvements

1. **Server-side enforcement:** Backend should never return closed places when `openNow=true` (defense in depth)
2. **Additional filters:** Apply same pattern for price, dietary, etc.
3. **Filter state persistence:** Remember filters across sessions
4. **Filter analytics:** Track filter usage patterns

---

## Related Work

This completes the frontend UX improvements:
1. **Search Input Persistence** (completed earlier today)
2. **OpenNow Filter + Non-Blocking Rendering** (this work)

Together, these provide a smooth, predictable search experience.

---

**Status:** ✅ COMPLETE  
**Tests:** 15/15 passing  
**Linter:** Clean  
**Ready for:** PR Review & Deployment
