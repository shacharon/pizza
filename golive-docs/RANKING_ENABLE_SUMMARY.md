# Ranking Feature Enable Summary

## Task Completed
Enabled existing in-house ranking mechanism with proof logs for ordering and paging behavior.

## 1. Feature Flag Configuration

### Location
**File:** `server/src/services/search/config/ranking.config.ts`

### Environment Variables
```bash
# Enable LLM-driven ranking (default: true in dev)
RANKING_LLM_ENABLED=true

# Ranking mode: GOOGLE (preserve order) | LLM_SCORE (LLM-driven)
RANKING_DEFAULT_MODE=LLM_SCORE
```

### Default Behavior
- **DEV:** Enabled by default (`RANKING_LLM_ENABLED !== 'false'`)
- **PROD:** Controlled by environment variable
- **Mode:** `LLM_SCORE` by default (LLM selects weights, deterministic ranking)

### How to Disable (PROD)
```bash
# In production .env:
RANKING_LLM_ENABLED=false
# OR
RANKING_DEFAULT_MODE=GOOGLE
```

## 2. Changes Made

### File: `ranking.config.ts`
- **Line 44:** Changed default from `'true'` check to `!== 'false'` (enabled by default)
- **Line 45:** Changed default mode from `'GOOGLE'` to `'LLM_SCORE'`

### File: `orchestrator.ranking.ts`
- **Lines 95-106:** Added `ranking_input_order` log (BEFORE ranking)
  - Shows first 10 places in original Google order
  - Includes: idx, placeId, rating, userRatingCount
- **Lines 135-143:** Added `ranking_output_order` log (AFTER ranking)
  - Shows first 10 places after ranking applied
  - Includes: idx, placeId, score
- Both logs include `requestId` for tracing

### File: `orchestrator.response.ts`
- **Lines 229-242:** Added `pagination_meta` log
  - Shows: fetchedCount (e.g., 30), returnedCount (30)
  - Documents client-side pagination: visibleCount=10, nextIncrement=5

## 3. Log Output Examples

### When Ranking is Enabled

**1. Input Order (from Google):**
```json
{
  "level": "info",
  "requestId": "req-123",
  "event": "ranking_input_order",
  "count": 30,
  "first10": [
    { "idx": 0, "placeId": "ChIJAbc123", "rating": 4.5, "userRatingCount": 1200 },
    { "idx": 1, "placeId": "ChIJDef456", "rating": 4.3, "userRatingCount": 800 },
    { "idx": 2, "placeId": "ChIJGhi789", "rating": 4.7, "userRatingCount": 500 },
    ...
  ],
  "msg": "[RANKING] Input order (Google)"
}
```

**2. Output Order (after ranking):**
```json
{
  "level": "info",
  "requestId": "req-123",
  "event": "ranking_output_order",
  "count": 30,
  "first10": [
    { "idx": 0, "placeId": "ChIJGhi789", "rating": 4.7, "userRatingCount": 500 },
    { "idx": 1, "placeId": "ChIJAbc123", "rating": 4.5, "userRatingCount": 1200 },
    { "idx": 2, "placeId": "ChIJDef456", "rating": 4.3, "userRatingCount": 800 },
    ...
  ],
  "msg": "[RANKING] Output order (ranked)"
}
```

**Note:** Compare `placeId` order between input/output to verify ranking changed the order.

**3. Ranking Applied:**
```json
{
  "level": "info",
  "requestId": "req-123",
  "event": "post_rank_applied",
  "profile": "QUALITY_FOCUSED",
  "weights": {
    "rating": 0.4,
    "reviews": 0.3,
    "distance": 0.2,
    "openBoost": 0.1
  },
  "resultCount": 30,
  "hadUserLocation": true,
  "mode": "LLM_SCORE",
  "msg": "[RANKING] Results ranked deterministically"
}
```

**4. Pagination Metadata:**
```json
{
  "level": "info",
  "requestId": "req-123",
  "event": "pagination_meta",
  "fetchedCount": 30,
  "returnedCount": 30,
  "clientVisibleCount": 10,
  "clientNextIncrement": 5,
  "serverPagination": false,
  "msg": "[ROUTE2] Pagination metadata (client-side)"
}
```

### When Ranking is Disabled

**Skipped Log:**
```json
{
  "level": "info",
  "requestId": "req-123",
  "event": "ranking_skipped",
  "reason": "feature_disabled",
  "enabled": false,
  "mode": "GOOGLE",
  "msg": "[RANKING] Skipping LLM ranking (feature disabled or mode not LLM_SCORE)"
}
```

## 4. Paging Behavior (Client-Side)

### How It Works
1. **Backend:** Fetches 30 results from Google (configured via `CANDIDATE_POOL_SIZE`)
2. **Backend:** Ranks all 30 results using LLM-selected weights
3. **Backend:** Returns ALL 30 results in response
4. **Frontend:** Shows first 10 results initially
5. **Frontend:** On "Load More" click, shows +5 more (15, 20, 25, 30...)

### Configuration
```bash
# In .env:
CANDIDATE_POOL_SIZE=30      # Fetch 30 from Google
DISPLAY_RESULTS_SIZE=10     # Not used (frontend controls display)
```

### Frontend Behavior
- **Initial:** 10 results visible
- **Load More:** +5 results per click
- **Max:** 30 results total (all fetched results)
- **Implementation:** `llm-angular/src/app/state/search.store.ts` (local state)

## 5. Verification

### Check Logs
```bash
# In server/logs/server.log, look for:
grep "ranking_input_order" server.log
grep "ranking_output_order" server.log
grep "post_rank_applied" server.log
grep "pagination_meta" server.log
```

### Verify Order Changed
Compare `first10` array between `ranking_input_order` and `ranking_output_order`:
- If `placeId` order differs → Ranking is working ✅
- If order is same → Ranking may have kept original order (rare)

### Verify Paging
1. Check `pagination_meta` log shows: `fetchedCount: 30, clientVisibleCount: 10`
2. Frontend loads +5 on each "Load More" click
3. No server requests on "Load More" (all client-side)

## 6. Rollback (If Needed)

To disable ranking in production:
```bash
# Set in production .env:
RANKING_LLM_ENABLED=false
```

Or revert to Google's original order:
```bash
RANKING_DEFAULT_MODE=GOOGLE
```

## 7. Files Changed

1. `server/src/services/search/config/ranking.config.ts` - Enable by default
2. `server/src/services/search/route2/orchestrator.ranking.ts` - Add before/after logs
3. `server/src/services/search/route2/orchestrator.response.ts` - Add pagination meta log
4. `RANKING_ENABLE_SUMMARY.md` - This documentation

## 8. Notes

- **No LLM Call to Rank:** False! LLM IS called to SELECT weights/profile (lines 106-111)
- **Deterministic Ordering:** After LLM selects weights, `rankResults()` applies them deterministically
- **Stable Ordering:** Tie-breaker uses original Google index for stability
- **No New Implementation:** Used existing `rankResults()` function, just enabled it

---

**Status:** ✅ Complete - Ranking enabled by default in dev with proof logs
