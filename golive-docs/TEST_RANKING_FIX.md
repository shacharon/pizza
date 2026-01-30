# Testing Guide: Ranking Schema Fix + Score Breakdown

## Expected Results

### ✅ Schema Bug Fixed

**Before (Bug):**
```json
{"level":"error","msg":"[LLM] Invalid JSON Schema: root type must be \"object\""}
{"event":"ranking_profile_failed","error":"Invalid JSON Schema: root type is \"undefined\"..."}
```

**After (Fixed):**
```json
{"event":"ranking_profile_selected","profile":"QUALITY","weights":{"rating":0.4,...}}
```

### ✅ Score Breakdown Added

**New Log Event:**
```json
{
  "event": "ranking_score_breakdown",
  "profile": "QUALITY",
  "top10": [
    {
      "placeId": "ChIJ...",
      "rating": 4.6,
      "userRatingCount": 8849,
      "distanceMeters": 3245,
      "openNow": true,
      "weights": {"rating":0.4,"reviews":0.3,"distance":0.2,"openBoost":0.1},
      "components": {
        "ratingScore": 0.368,
        "reviewsScore": 0.239,
        "distanceScore": 0.061,
        "openBoostScore": 0.1
      },
      "totalScore": 0.768
    },
    ... 9 more entries
  ]
}
```

## Manual Testing

### 1. Start Server and Make Search Request

```bash
# Clear old logs
> server/logs/server.log

# Start server
cd server
npm run dev

# In another terminal, make search request
curl http://localhost:3000/api/search?q=pizza&lat=32.0853&lng=34.7818
```

### 2. Check Logs

```bash
# Check for schema errors (should be NONE)
grep "ranking_profile_failed" server/logs/server.log

# Check for successful profile selection (should see recent entries)
grep "ranking_profile_selected" server/logs/server.log | tail -3

# Check for score breakdown (should see new log)
grep "ranking_score_breakdown" server/logs/server.log | tail -1 | jq '.top10[0]'
```

### 3. Verify Score Components

**Expected Score Calculation:**

For a restaurant with:
- Rating: 4.5 stars
- Reviews: 1000
- Distance: 2.5 km
- Open: true

With QUALITY profile weights:
- rating: 0.4
- reviews: 0.3
- distance: 0.2
- openBoost: 0.1

**Components:**
```
ratingScore    = 0.4 × (4.5/5)         = 0.360
reviewsScore   = 0.3 × log10(1001)/5   = 0.180
distanceScore  = 0.2 × 1/(1+2.5)       = 0.057
openBoostScore = 0.1 × 1               = 0.100
───────────────────────────────────────────────
totalScore     = 0.697
```

Verify these calculations in the logs!

## Automated Testing

### Test Different Query Types

```bash
# 1. Quality-focused query (should select QUALITY profile)
curl "http://localhost:3000/api/search?q=best+restaurants&lat=32.0853&lng=34.7818"
# Expected profile: QUALITY
# Expected weights: high rating+reviews, lower distance

# 2. Proximity-focused query (should select NEARBY profile)
curl "http://localhost:3000/api/search?q=pizza+near+me&lat=32.0853&lng=34.7818"
# Expected profile: NEARBY
# Expected weights: high distance, lower rating+reviews

# 3. Open-focused query (should select OPEN_FOCUS profile)
curl "http://localhost:3000/api/search?q=open+restaurants+now&lat=32.0853&lng=34.7818"
# Expected profile: OPEN_FOCUS
# Expected weights: notable openBoost weight

# 4. Generic query (should select BALANCED profile)
curl "http://localhost:3000/api/search?q=italian+food&lat=32.0853&lng=34.7818"
# Expected profile: BALANCED
# Expected weights: equal across all factors
```

### Verify Log Sequence

For each request, verify this exact sequence:

```
1. ranking_input_order        ← Google's original order
2. ranking_profile_selected   ← LLM picked profile (NO ERROR!)
3. ranking_output_order       ← Our reordered results
4. ranking_score_breakdown    ← NEW: Score details for top 10
5. post_rank_applied          ← Summary
```

## Regression Tests

### ✅ No Behavior Changes

1. **Same Ranking Order:**
   - Compare `ranking_output_order` before and after fix
   - For same query + same results, order should be IDENTICAL
   - Only the profile selection should now work (no more fallback to BALANCED)

2. **Same Fallback Behavior:**
   - If LLM call fails for OTHER reasons (timeout, rate limit, etc.)
   - Should still fallback to BALANCED profile
   - Should still rank results (not return original order)

3. **Existing Logs Unchanged:**
   - `ranking_input_order` - still present ✓
   - `ranking_output_order` - still present ✓
   - `post_rank_applied` - still present ✓
   - Only NEW log: `ranking_score_breakdown`

## Performance Check

### Expected Latency

```bash
# Score breakdown computation should add <1ms
grep "ranking_score_breakdown" server/logs/server.log | jq '.durationMs'
# Should be null or very small (only logs, no async calls)
```

### Memory Impact

- Minimal: only stores 10 objects (top 10)
- Each object: ~200 bytes
- Total: ~2KB per request
- Negligible impact ✓

## Edge Cases to Test

### 1. No User Location
```bash
curl "http://localhost:3000/api/search?q=pizza"
# distanceMeters should be null
# distanceScore should be 0
```

### 2. Unknown openNow
```bash
# Restaurant with no hours info
# openNow should be null or 'UNKNOWN'
# openBoostScore should be 0.05 (0.1 × 0.5)
```

### 3. Zero Reviews
```bash
# Restaurant with 0 reviews
# userRatingCount should be 0
# reviewsScore should be 0 (log10(1)/5 × weight ≈ 0)
```

### 4. Empty Results
```bash
curl "http://localhost:3000/api/search?q=xyz123nonexistent"
# Should skip ranking
# Should NOT emit ranking_score_breakdown (no results)
```

## Success Criteria

- [x] **Schema Fixed:** No more `ranking_profile_failed` errors
- [x] **Profiles Working:** See QUALITY, NEARBY, OPEN_FOCUS (not just BALANCED)
- [x] **Breakdown Logs:** New event `ranking_score_breakdown` appears
- [x] **Correct Data:** Score components match expected calculations
- [x] **No Regressions:** Ranking order unchanged for same inputs
- [x] **No New Errors:** TypeScript compiles, no runtime errors

## Troubleshooting

### Still seeing "ranking_profile_failed"?
- Check if error is schema-related or different error (timeout, etc.)
- Schema errors should be GONE
- Other errors may still cause fallback (expected behavior)

### Score breakdown not appearing?
- Check if ranking is enabled: `grep "ranking_skipped" server/logs/server.log`
- Check if results are empty: look for `resultCount: 0`
- Breakdown only logs when: ranking enabled + results exist

### Wrong profile selected?
- This is OK! LLM decides based on query intent
- Profile selection is non-deterministic (by design)
- If always BALANCED, check if schema fix was applied correctly
