# Performance Logging Added ✅

**Date:** December 28, 2025  
**Purpose:** Diagnose cache performance and result count inconsistencies

---

## Changes Made

### 1. Enhanced Places Provider Logging

**File:** `server/src/services/search/capabilities/places-provider.service.ts`

**Added:**
- ✅ Cache HIT timing (shows how fast cache is)
- ✅ Cache MISS logging (shows when cache doesn't work)
- ✅ Cache key display (first 80 chars for debugging)
- ✅ Total search time including API calls
- ✅ Cache storage confirmation with TTL

**Example Output:**
```
[PlacesProviderService] ❌ CACHE MISS for "pizza in tel aviv"
[PlacesProviderService] 🔑 Cache key: places:pizza in tel aviv:32.0809,34.7806:3000:he:false...
[PlacesProviderService] Searching with mode: textsearch
[PlacesProviderService] Found 10 results (2847ms total)
[PlacesProviderService] 💾 Cached 10 results (TTL: 3600s)
```

**Second search (cache hit):**
```
[PlacesProviderService] ✅ CACHE HIT for "pizza in tel aviv" (2ms, 10 results)
[PlacesProviderService] 🔑 Cache key: places:pizza in tel aviv:32.0809,34.7806:3000:he:false...
```

---

### 2. Enhanced Orchestrator Logging

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Added:**
- ✅ Weak match details (shows which restaurants are dropped and why)
- ✅ Final result count breakdown
- ✅ Periodic cache statistics (10% of requests)

**Example Output:**
```
[SearchOrchestrator] ⚠️ Detected 1 weak matches (score < 30)
[SearchOrchestrator] 📉 Weak matches dropped: [
  { name: 'Some Pizza Place', score: '24.5', rating: 3.2 }
]
[SearchOrchestrator] 📊 Final result count: 9 (9 strong, 1 weak from 10 ranked)
[SearchOrchestrator] ✅ Search complete in 3124ms

[SearchOrchestrator] 📈 Cache Stats: {
  places: { size: 5, hits: 12, misses: 5, hitRate: 0.71 },
  geocoding: { size: 3, hits: 8, misses: 3, hitRate: 0.73 }
}
```

---

## What to Test

### Test 1: Cache Performance (Same Query Twice)

**Query:** "pizza in tel aviv" (in Hebrew: "פיצה בתל אביב")

**Expected Results:**

**First Search:**
- ❌ CACHE MISS
- Total time: ~2000-3000ms
- Google API call happens
- Results cached

**Second Search (within 1 hour):**
- ✅ CACHE HIT
- Total time: ~50-200ms (40-60x faster!)
- No Google API call
- Same results from cache

---

### Test 2: Result Count Consistency

**Query:** "pizza in tel aviv"

**What to Look For:**

1. **Raw results from Google:**
   ```
   [PlacesProviderService] Found 10 results (2847ms total)
   ```

2. **After city filtering:**
   ```
   [SearchOrchestrator] ✂️ City filter: 10 kept, 0 dropped
   ```

3. **After weak match detection:**
   ```
   [SearchOrchestrator] ⚠️ Detected 1 weak matches (score < 30)
   [SearchOrchestrator] 📉 Weak matches dropped: [...]
   ```

4. **Final count:**
   ```
   [SearchOrchestrator] 📊 Final result count: 9 (9 strong, 1 weak from 10 ranked)
   ```

**Why Result Count Varies:**
- Google returns 10 results
- City filter may drop some (wrong city)
- Weak match filter drops low-quality results (score < 30)
- **Final count = 9 or 10 depending on filtering**

---

### Test 3: Cache Key Consistency

**Important:** The cache key includes:
- Query text
- Location coordinates (rounded to 4 decimals)
- Radius
- Language
- `openNow` filter

**Different Cache Keys:**
```
places:pizza in tel aviv:32.0809,34.7806:3000:he:false
places:pizza in tel aviv:32.0809,34.7806:3000:he:true    ← openNow=true
places:pizza in tel aviv:32.0809,34.7806:5000:he:false   ← different radius
```

**If you see CACHE MISS on repeat searches, check:**
- Is the location slightly different? (user moved)
- Is the language different? (he vs en)
- Are filters different? (openNow changed)

---

## How to Run Tests

### Server is Already Running

The server is running on `http://localhost:3000`

### Test from Angular App

1. Open `http://localhost:4200`
2. Search for "פיצה בתל אביב" (pizza in tel aviv)
3. Check server logs in terminal
4. Search again (same query)
5. Check logs for CACHE HIT

### Test from API Directly

```bash
# PowerShell
$body = @{
  query = "pizza in tel aviv"
  locale = "he"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/api/search -Method POST -Body $body -ContentType "application/json"
```

---

## Expected Performance Improvements

### Without Cache (First Search)
- **Total Time:** 2000-3500ms
- **Breakdown:**
  - Intent parsing: 800-1200ms (LLM)
  - Geocoding: 200-400ms (Google API)
  - Places search: 1000-1500ms (Google API)
  - Ranking: 50-100ms
  - Assistant: 400-800ms (LLM)

### With Cache (Repeat Search)
- **Total Time:** 500-1000ms (50-70% faster!)
- **Breakdown:**
  - Intent parsing: 800-1200ms (LLM, not cached by default)
  - Geocoding: **2-5ms** ✅ (cached)
  - Places search: **2-5ms** ✅ (cached)
  - Ranking: 50-100ms
  - Assistant: 400-800ms (LLM)

**Cache Hit Rate Target:** 50-70% after system warms up

---

## Troubleshooting

### Cache Not Working?

**Check logs for:**
```
[PlacesProviderService] ❌ CACHE MISS for "pizza in tel aviv"
[PlacesProviderService] 🔑 Cache key: places:pizza...
```

**Compare cache keys between searches:**
- If keys are different → coordinates/filters are changing
- If keys are same but still MISS → cache might be disabled

**Check cache config:**
```javascript
// Should be true
CacheConfig.placesSearch.enabled = true
```

### Results Always 9 Instead of 10?

**Check logs for:**
```
[SearchOrchestrator] 📉 Weak matches dropped: [
  { name: 'Restaurant Name', score: '24.5', rating: 3.2 }
]
```

**This is NORMAL if:**
- Restaurant has low rating (< 3.5)
- Restaurant is far from search location
- Restaurant has few reviews

**To always get 10 results:**
- Lower weak match threshold (currently 30)
- Or disable weak match filtering

---

## Next Steps

1. ✅ **Test cache performance** - Search twice, check timing
2. ✅ **Monitor cache hit rate** - Should reach 50-70%
3. ✅ **Understand result filtering** - Why 9 vs 10
4. ⏭️ **Tune if needed** - Adjust thresholds based on results

---

**Server Status:** ✅ Running on http://localhost:3000  
**Logging:** ✅ Enhanced  
**Ready to Test:** ✅ Yes!

---

**Test it now and let me know what you see in the logs!** 🚀



