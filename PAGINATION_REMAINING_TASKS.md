# Critical Remaining Tasks - Pagination E2E

## Backend: Response Slicing (HIGH PRIORITY)

### File: `server/src/services/search/route2/orchestrator.response.ts`

**Location:** In `buildFinalResponse()` function, after line ~180

**Add before response is built:**
```typescript
// PAGINATION: Slice results for initial display (10) while keeping full list (20) available
const INITIAL_DISPLAY_COUNT = 10;
const MAX_RESULTS_CAP = 20;

const allRankedResults = finalResults; // Keep full list (up to 20)
const initialResults = finalResults.slice(0, INITIAL_DISPLAY_COUNT); // First 10 for display

// Build pagination metadata
const paginationMeta = {
  fetchedCount: allRankedResults.length,           // What we got from Google (after filters)
  returnedCount: initialResults.length,            // What we're showing initially
  availableCount: allRankedResults.length,         // Total available client-side
  nextIncrement: 5,                                 // Step size for "Load more"
  maxVisible: MAX_RESULTS_CAP                       // Hard cap
};

logger.info({
  requestId,
  event: 'pagination_contract',
  fetchedCount: paginationMeta.fetchedCount,
  initial: paginationMeta.returnedCount,
  step: paginationMeta.nextIncrement,
  max: paginationMeta.maxVisible
}, '[RESPONSE] Pagination contract applied');
```

**In response object construction:**
```typescript
const response: SearchResponse = {
  // ... existing fields
  results: initialResults,  // ← Change from finalResults to initialResults
  // ... existing fields
  meta: {
    // ... existing meta fields
    pagination: paginationMeta,  // ← ADD THIS
    // ... rest of meta
  }
};
```

---

## Frontend: Client-Side Pagination (HIGH PRIORITY)

### Option A: Service Layer (Recommended)

**File:** `llm-angular/src/app/shared/services/unified-search.service.ts`

**Add pagination state:**
```typescript
export interface PaginationState {
  allResults: Restaurant[];
  visibleCount: number;
  canLoadMore: boolean;
  nextIncrement: number;
  maxVisible: number;
}

// In service:
private _paginationState = signal<PaginationState>({
  allResults: [],
  visibleCount: 0,
  canLoadMore: false,
  nextIncrement: 5,
  maxVisible: 20
});

readonly paginationState = this._paginationState.asReadonly();

// When results arrive:
handleSearchResponse(response: SearchResponse) {
  const meta = response.meta.pagination;
  const allResults = response.results; // Server sends 10, but we'll request all 20
  
  this._paginationState.set({
    allResults: allResults,
    visibleCount: Math.min(meta?.returnedCount || 10, allResults.length),
    canLoadMore: allResults.length > (meta?.returnedCount || 10) && allResults.length < (meta?.maxVisible || 20),
    nextIncrement: meta?.nextIncrement || 5,
    maxVisible: meta?.maxVisible || 20
  });
}

loadMore() {
  const current = this._paginationState();
  const newCount = Math.min(
    current.visibleCount + current.nextIncrement,
    Math.min(current.maxVisible, current.allResults.length)
  );
  
  this._paginationState.update(state => ({
    ...state,
    visibleCount: newCount,
    canLoadMore: newCount < Math.min(state.maxVisible, state.allResults.length)
  }));
}
```

### Option B: Component Level (Alternative)

**File:** `llm-angular/src/app/features/unified-search/components/ranked-results/ranked-results.component.ts`

```typescript
export class RankedResultsComponent {
  @Input() results: Restaurant[] = [];
  @Input() paginationMeta?: PaginationMeta;
  
  visibleCount = signal(10);
  
  visibleResults = computed(() => 
    this.results.slice(0, this.visibleCount())
  );
  
  canLoadMore = computed(() => 
    this.visibleCount() < Math.min(20, this.results.length)
  );
  
  onLoadMore() {
    const newCount = Math.min(
      this.visibleCount() + 5,
      Math.min(20, this.results.length)
    );
    this.visibleCount.set(newCount);
  }
}
```

**Template:**
```html
<div class="results-grid">
  @for (restaurant of visibleResults(); track restaurant.placeId) {
    <app-restaurant-card [restaurant]="restaurant" />
  }
</div>

@if (canLoadMore()) {
  <button 
    class="load-more-btn"
    (click)="onLoadMore()"
  >
    Load 5 More Results
  </button>
}
```

---

## Testing Checklist

### Backend Verification
```bash
# 1. Check fetch count
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "מסעדות אסיאתיות בתל אביב"}' | jq '.meta.pagination'

# Expected output:
# {
#   "fetchedCount": 18,
#   "returnedCount": 10,
#   "availableCount": 18,
#   "nextIncrement": 5,
#   "maxVisible": 20
# }

# 2. Check logs
grep "google_textsearch_aggregated" server.log | tail -1
# Should show: returned:~20

grep "pagination_contract" server.log | tail -1
# Should show: fetchedCount:~20, initial:10, step:5, max:20

grep "cuisine_score_only_applied" server.log | tail -1
# Should show: countIn=countOut (no filtering)
```

### Frontend Verification (Dev Tools Console)
```javascript
// After search completes:
// 1. Check state
console.log($0.visibleCount()); // Should be 10
console.log($0.canLoadMore()); // Should be true (if >10 results)

// 2. Click "Load more" once
// visibleCount should be 15

// 3. Click "Load more" again
// visibleCount should be 20
// canLoadMore should be false
```

### Manual Test Cases
1. **Rich results (Tel Aviv Asian)**: 10 → 15 → 20
2. **Small city (6 results)**: Shows 6, no button
3. **Edge case (12 results)**: 10 → 12, button disappears

---

## Quick Win Implementation Order

1. **Backend response slicing** (15 min)
   - Add pagination metadata to response
   - Slice to 10 for initial display
   - Test with curl

2. **Frontend pagination UI** (30 min)
   - Add visibleCount signal
   - Implement loadMore()
   - Add button to template
   - Test in browser

3. **Logging verification** (10 min)
   - Check pagination_contract logs
   - Verify fetchedCount ≈ 20

Total estimated time: ~1 hour for critical path

---

## Known Issues & Edge Cases

1. **Server returns all 20 in results array**
   - Initially, return first 10 in `results` field
   - Later, can optimize to return all 20 and let client slice
   - Current approach: Server slices to 10

2. **Cached results from old contract**
   - Cache invalidation may be needed
   - Add pipeline version to cache key if issues arise

3. **WebSocket results updates**
   - Pagination state should persist through assistant updates
   - Don't reset visibleCount on assistant message arrival

---

## Success Criteria

- [ ] Backend: `grep "pagination_contract"` shows fetchedCount ≈ 20, initial: 10
- [ ] Backend: `grep "cuisine_score_only"` shows countIn = countOut
- [ ] Frontend: UI shows 10 results initially
- [ ] Frontend: "Load 5 more" button visible when >10 results
- [ ] Frontend: Clicking button shows 15, then 20
- [ ] Frontend: Button disappears at 20 or total (whichever smaller)
- [ ] No regressions: Filters still work (kosher, price, etc.)

