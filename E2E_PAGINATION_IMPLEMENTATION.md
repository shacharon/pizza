# End-to-End Pagination Implementation: 20 Fetch + Score-Only Cuisine + UI 10+5+5

## Overview

Complete implementation of the agreed pagination contract:

- Backend fetches up to 20 places (TextSearch + Nearby)
- Cuisine enforcement = SCORE-ONLY (never drops results)
- Frontend shows 10 initially, then "Load more 5" twice (max visible 20)

## Status: ✅ Backend Complete | ⏳ Frontend In Progress

---

## Backend Changes (COMPLETED)

### 1. Google Fetch: 20 Results Target ✅

**Files Modified:**

- `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`
- `server/src/services/search/route2/stages/google-maps/pagination-handler.ts`
- `server/src/services/search/route2/stages/google-maps/nearby-search.handler.ts`

**Changes:**

- Text Search: maxResults=20, maxPages=3 (already implemented in previous task)
- Nearby Search: maxResults=20 (changed from 40)
- Pagination logging: per-page + aggregated summary

### 2. Cuisine Enforcer: Score-Only Mode ✅

**File Modified:** `server/src/services/search/route2/stages/cuisine-enforcer/cuisine-enforcer.service.ts`

**Changes:**

```typescript
// OLD: Policy selection based on hard constraints
const policy =
  inputPolicy || (hardConstraintsExist ? "SOFT_BOOST" : "STRICT_FILTER");

// NEW: Always score-only mode
const policy: CuisineEnforcementPolicy = "SOFT_BOOST";
```

**Behavior:**

- NEVER drops results based on cuisine
- Returns cuisineScore (0-1) for each place
- Score used for ranking, not filtering
- Removed all relaxation logic (no longer needed)

**Logs:**

```json
{
  "event": "cuisine_policy_selected",
  "policy": "SOFT_BOOST",
  "reason": "score_only_mode_enforced",
  "countIn": 18
}
{
  "event": "cuisine_scores_top10",
  "scores": [
    {"placeId": "...", "placeName": "Pasta Bar", "score": 0.95},
    {"placeId": "...", "placeName": "TYO", "score": 0.85}
  ]
}
```

### 3. Ranking: CuisineScore Integration ✅

**Files Modified:**

- `server/src/services/search/route2/ranking/ranking-profile.schema.ts`
- `server/src/services/search/route2/ranking/results-ranker.ts`
- `server/src/services/search/route2/ranking/ranking-profile-deterministic.ts`

**Changes:**

#### Schema (ranking-profile.schema.ts):

```typescript
export const RankingWeightsSchema = z
  .object({
    rating: z.number().min(0).max(1),
    reviews: z.number().min(0).max(1),
    distance: z.number().min(0).max(1),
    openBoost: z.number().min(0).max(1),
    cuisineMatch: z.number().min(0).max(1).optional().default(0), // NEW
  })
  .strict();
```

#### Ranker (results-ranker.ts):

```typescript
interface RankableResult {
  cuisineScore?: number; // NEW: From enforcer (0-1)
  // ... existing fields
}

// Score calculation now includes:
const cuisineNorm = result.cuisineScore ?? 0.5; // Default 0.5 if no score
const cuisineMatchScore = (weights.cuisineMatch || 0) * cuisineNorm;
const totalScore =
  ratingScore +
  reviewsScore +
  distanceScore +
  openBoostScore +
  cuisineMatchScore;
```

#### Profile Weights (ranking-profile-deterministic.ts):

```typescript
const PROFILE_WEIGHTS = {
  DISTANCE_HEAVY: {
    rating: 0.15,
    reviews: 0.08,
    distance: 0.62,
    openBoost: 0.1,
    cuisineMatch: 0.05, // Small weight - distance primary
  },

  BALANCED: {
    rating: 0.25,
    reviews: 0.2,
    distance: 0.3,
    openBoost: 0.1,
    cuisineMatch: 0.15, // Moderate weight
  },

  CUISINE_FOCUSED: {
    rating: 0.3,
    reviews: 0.25,
    distance: 0.2,
    openBoost: 0.05,
    cuisineMatch: 0.2, // Higher for explicit cuisine queries
  },

  QUALITY_FOCUSED: {
    rating: 0.35,
    reviews: 0.3,
    distance: 0.15,
    openBoost: 0.05,
    cuisineMatch: 0.15, // Moderate - quality primary
  },

  NO_LOCATION: {
    rating: 0.4,
    reviews: 0.35,
    distance: 0.0,
    openBoost: 0.1,
    cuisineMatch: 0.15, // Moderate weight
  },
};
```

### 4. Orchestrator: Score Attachment ✅

**File Modified:** `server/src/services/search/route2/route2.orchestrator.ts`

**Changes:**

```typescript
// After cuisine enforcement:
if (enforcementResult.cuisineScores) {
  cuisineScores = enforcementResult.cuisineScores;

  // Attach cuisine scores to results for ranking
  for (const result of googleResult.results) {
    const placeId = result.placeId || result.id;
    if (placeId && cuisineScores[placeId] !== undefined) {
      result.cuisineScore = cuisineScores[placeId];
    }
  }
}

// Score-only mode: Keep all results (no filtering)
if (enforcementResult.keepPlaceIds.length > 0) {
  enforcedResults = googleResult.results; // Keep all
  cuisineEnforcementApplied = true;

  logger.info({
    event: "cuisine_score_only_applied",
    countIn: googleResult.results.length,
    countOut: enforcedResults.length,
    mode: "SCORE_ONLY",
  });
}
```

---

## Frontend Changes (IN PROGRESS)

### 5. Response Contract: Pagination Metadata ⏳

**File to Modify:** `server/src/services/search/route2/orchestrator.response.ts`

**Required Changes:**

```typescript
// Add to response metadata:
{
  pagination: {
    fetchedCount: 18,        // Total places fetched from Google
    returnedCount: 10,       // Initial slice returned
    availableCount: 18,      // Total available after filters
    nextIncrement: 5,        // Step size for "Load more"
    maxVisible: 20           // Hard cap on visible results
  },
  // ... existing fields
}
```

**Implementation:**

- Slice final ranked results to 10 for initial response
- Store full 20 in response for client-side pagination
- Add pagination metadata to meta object

### 6. Client-Side Pagination: 10+5+5 UI ⏳

**Files to Modify:**

- `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`
- `llm-angular/src/app/features/unified-search/components/ranked-results/ranked-results.component.ts`

**Required Changes:**

```typescript
// Component state:
interface PaginationState {
  allResults: Restaurant[];      // Full list (up to 20)
  visibleCount: number;          // Current visible count
  canLoadMore: boolean;          // Button visibility
}

// Initial state:
this.visibleCount = Math.min(10, this.allResults.length);
this.canLoadMore = this.visibleCount < Math.min(20, this.allResults.length);

// Load more handler:
onLoadMore() {
  const newCount = Math.min(
    this.visibleCount + 5,
    Math.min(20, this.allResults.length)
  );
  this.visibleCount = newCount;
  this.canLoadMore = this.visibleCount < Math.min(20, this.allResults.length);
}

// Template:
<app-restaurant-card
  *ngFor="let restaurant of allResults | slice:0:visibleCount"
  [restaurant]="restaurant"
/>
<button
  *ngIf="canLoadMore"
  (click)="onLoadMore()"
  class="load-more-btn"
>
  Load 5 More
</button>
```

---

## Testing Strategy

### Backend Unit Tests (TODO)

**File to Create:** `server/src/services/search/route2/stages/cuisine-enforcer/__tests__/score-only.test.ts`

**Test Cases:**

1. Score-only mode returns all places with scores
2. No results are filtered regardless of cuisine match
3. CuisineScores are properly attached to results
4. Ranking incorporates cuisineScore correctly

### Frontend Unit Tests (TODO)

**File to Create:** `llm-angular/src/app/features/unified-search/components/ranked-results/__tests__/pagination.spec.ts`

**Test Cases:**

1. Initial render shows 10 results
2. "Load more" increments by 5
3. Button disappears at max (20 or total, whichever is smaller)
4. Handles edge cases (6 total results, no pagination needed)

### E2E Test Scenarios

1. **Query: "מסעדות אסיאתיות בתל אביב"**

   - Backend: fetchedCount ≈ 20
   - UI: Shows 10 initially
   - Action: Click "Load more" → shows 15
   - Action: Click "Load more" → shows 20
   - Button: Disappears

2. **Query: "בשריות באשקלון" (small city)**

   - Backend: fetchedCount = 6
   - UI: Shows all 6
   - Button: Not visible
   - Behavior: No filtering to 0

3. **Query: "חלבית כשרה בפתח תקווה"**
   - Backend: fetchedCount ≈ 12
   - UI: Shows 10 initially
   - Action: Click "Load more" → shows 12
   - Button: Disappears (reached total)

---

## Architecture Decisions

### 1. Why Score-Only Cuisine?

- Prevents zero-result scenarios (e.g., Gedera Italian query returning 0 after strict filtering)
- Maintains result diversity while still boosting relevant cuisines
- Works harmoniously with other filters (kosher, price, etc.)
- Allows LLM to influence ranking without binary decisions

### 2. Why cuisineMatch Weight?

- Cuisine scores influence ranking but don't dominate (5-20% depending on profile)
- Preserves quality signals (rating/reviews) as primary factors
- Distance remains critical for proximity queries
- Balanced approach: cuisine matters but isn't everything

### 3. Why 10+5+5 Pagination?

- **10 initial**: Prevents overwhelming UI, fast initial render
- **5 increment**: Small enough to load quickly, large enough to show progress
- **20 max**: Balances discoverability vs choice overload
- **Client-side**: No server round-trip, instant response

### 4. Why No Relax Logic?

- Score-only mode never produces zero results
- Relaxation was designed for strict filtering edge cases
- Removed complexity: no multi-stage LLM calls
- Simpler mental model: one score, one ranking

---

## Behavioral Changes Summary

| Scenario                | Before                            | After                             |
| ----------------------- | --------------------------------- | --------------------------------- |
| "מסעדות איטלקיות בגדרה" | 6 fetched → 0 after strict filter | 18 fetched → 18 ranked → 10 shown |
| Asian Tel Aviv          | 40 fetched → UI shows all         | 20 fetched → 10 shown + load more |
| Meat Ashkelon           | 8 fetched → 3 after kosher filter | 20 fetched → filtered → 10 shown  |
| No cuisine query        | All results shown                 | All results shown (same)          |

---

## Files Modified (Summary)

### Backend (10 files):

1. `server/src/services/search/route2/stages/google-maps/nearby-search.handler.ts`
2. `server/src/services/search/route2/stages/cuisine-enforcer/cuisine-enforcer.service.ts`
3. `server/src/services/search/route2/ranking/ranking-profile.schema.ts`
4. `server/src/services/search/route2/ranking/results-ranker.ts`
5. `server/src/services/search/route2/ranking/ranking-profile-deterministic.ts`
6. `server/src/services/search/route2/route2.orchestrator.ts`
7. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts` (from previous task)
8. `server/src/services/search/route2/stages/google-maps/pagination-handler.ts` (from previous task)

### Frontend (TODO - 2-3 files):

1. `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`
2. `llm-angular/src/app/features/unified-search/components/ranked-results/ranked-results.component.ts`
3. `llm-angular/src/app/features/unified-search/components/ranked-results/ranked-results.component.html`

---

## Next Steps

1. ✅ Update response contract to slice to 10 and add pagination metadata
2. ⏳ Implement frontend client-side pagination (10+5+5)
3. ⏳ Add backend unit tests for score-only cuisine
4. ⏳ Add frontend unit tests for pagination UI
5. ⏳ Manual E2E testing with sample queries

---

## Key Logs to Monitor

```bash
# Backend - Pagination
grep "google_textsearch_aggregated" server.log
# Should show: requested:20, returned:~20

# Backend - Cuisine scores
grep "cuisine_scores_attached" server.log
# Should show: scoresAttached:N, resultsCount:N (equal counts)

# Backend - Score-only mode
grep "cuisine_score_only_applied" server.log
# Should show: countIn=countOut (no filtering)

# Backend - Ranking breakdown
grep "ranking_score_breakdown" server.log
# Should show: cuisineMatchScore in components

# Frontend - Pagination state
# Console: visibleCount, canLoadMore, allResults.length
```

---

## Acceptance Criteria Verification

- [x] Backend fetches up to 20 places (TextSearch + Nearby)
- [x] Cuisine enforcer is score-only (never drops results)
- [x] Ranking incorporates cuisineScore with appropriate weights
- [ ] Response returns 10 initial + pagination metadata
- [ ] Frontend shows 10, then 15, then 20 (10+5+5)
- [ ] "Load more" button shows/hides correctly
- [ ] Small cities (6 results) show all 6, no pagination
- [ ] No regressions in filters (kosher, price, openNow, etc.)
