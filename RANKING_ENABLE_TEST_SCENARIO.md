# Ranking Enable - Test Scenario

## Quick Test to Verify Ranking is Working

### 1. Start the Server
```bash
cd server
npm start
```

### 2. Make a Search Request
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "פיצה ברחובות",
    "userLocation": { "lat": 31.8947, "lng": 34.8078 }
  }'
```

### 3. Check Logs
```bash
tail -f server/logs/server.log | grep -E "ranking_input_order|ranking_output_order|post_rank_applied|pagination_meta"
```

### 4. Expected Log Sequence

**Step 1: Input Order (Google's original order)**
```json
{
  "event": "ranking_input_order",
  "count": 30,
  "first10": [
    { "idx": 0, "placeId": "ChIJAbc...", "rating": 4.5, "userRatingCount": 1200 },
    { "idx": 1, "placeId": "ChIJDef...", "rating": 4.3, "userRatingCount": 800 },
    ...
  ]
}
```

**Step 2: LLM Profile Selection**
```json
{
  "event": "ranking_profile_selected",
  "profile": "QUALITY_FOCUSED",
  "weights": { "rating": 0.4, "reviews": 0.3, "distance": 0.2, "openBoost": 0.1 }
}
```

**Step 3: Output Order (After ranking)**
```json
{
  "event": "ranking_output_order",
  "count": 30,
  "first10": [
    { "idx": 0, "placeId": "ChIJGhi...", "rating": 4.7, "userRatingCount": 500 },
    { "idx": 1, "placeId": "ChIJAbc...", "rating": 4.5, "userRatingCount": 1200 },
    ...
  ]
}
```
**→ Notice `placeId` order changed!**

**Step 4: Ranking Applied**
```json
{
  "event": "post_rank_applied",
  "profile": "QUALITY_FOCUSED",
  "resultCount": 30,
  "mode": "LLM_SCORE"
}
```

**Step 5: Pagination Metadata**
```json
{
  "event": "pagination_meta",
  "fetchedCount": 30,
  "returnedCount": 30,
  "clientVisibleCount": 10,
  "clientNextIncrement": 5,
  "serverPagination": false
}
```

### 5. Verify Order Changed

**Compare the `placeId` arrays:**
- Input order: `[ChIJAbc, ChIJDef, ChIJGhi, ...]`
- Output order: `[ChIJGhi, ChIJAbc, ChIJDef, ...]`

If the order is different → **Ranking is working! ✅**

### 6. Test Frontend Pagination

1. Open frontend (http://localhost:4200)
2. Search for "פיצה ברחובות"
3. Observe:
   - Initially shows **10 results**
   - Click "Load More" → shows **15 results**
   - Click "Load More" → shows **20 results**
   - Maximum **30 results** shown

### 7. Disable Ranking (Test Fallback)

**Option A: Set env var**
```bash
RANKING_LLM_ENABLED=false npm start
```

**Option B: Change mode**
```bash
RANKING_DEFAULT_MODE=GOOGLE npm start
```

**Expected logs:**
```json
{
  "event": "ranking_skipped",
  "reason": "feature_disabled",
  "enabled": false,
  "mode": "GOOGLE"
}
```

### 8. Common Issues & Fixes

**Issue 1: No ranking logs appear**
- Check: Is `RANKING_LLM_ENABLED=true` in `.env`?
- Check: Is `RANKING_DEFAULT_MODE=LLM_SCORE` in `.env`?
- Check: Does the search return results? (ranking skipped if 0 results)

**Issue 2: Order doesn't change**
- Possible: LLM selected weights that preserve Google order (rare but valid)
- Check: LLM profile weights in `post_rank_applied` log
- Try: Different query to test with different result distributions

**Issue 3: Pagination doesn't work**
- Check: Frontend state management (search.store.ts)
- Check: `pagination_meta` log shows `fetchedCount: 30`
- Verify: Response includes all 30 results

### 9. Success Criteria

✅ **Ranking Enabled:**
- `ranking_input_order` log appears
- `ranking_output_order` log appears with different order
- `post_rank_applied` log shows profile and weights
- No `ranking_skipped` log

✅ **Pagination Working:**
- `pagination_meta` log shows: `fetchedCount: 30, clientVisibleCount: 10, clientNextIncrement: 5`
- Frontend shows 10 results initially
- "Load More" button appears
- Clicking loads +5 results each time

✅ **Production Ready:**
- Can disable via `RANKING_LLM_ENABLED=false`
- Graceful fallback to Google order
- No breaking changes to existing API

---

**Status:** Ready for testing - start server and follow steps above
