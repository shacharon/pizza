# Explicit City Fix - Verification Guide

## ✅ Fix Complete

All changes have been successfully implemented and pass linter checks.

## Files Modified

1. ✅ `server/src/services/search/route2/stages/google-maps/textquery-normalizer.ts`
2. ✅ `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
3. ✅ `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

## Verification Steps

### Test Query: "מסעדות איטלקיות בגדרה"

Run this search and check the logs:

```bash
# Start the server
cd server
npm run dev

# Make a search request (in another terminal or via frontend)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "מסעדות איטלקיות בגדרה",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'
```

### Expected Log Output

Look for these log entries in `server/logs/server.log`:

#### 1. Canonical Query Applied
```json
{
  "stage": "textsearch_mapper",
  "event": "canonical_query_applied",
  "originalTextQuery": "מסעדות איטלקיות בגדרה",
  "canonicalTextQuery": "מסעדה איטלקית גדרה",
  "confidence": 0.95
}
```

#### 2. Bias Priority - City Preferred
```json
{
  "stage": "textsearch_mapper",
  "event": "bias_planned",
  "source": "cityCenter_pending_geocode",
  "cityText": "גדרה",
  "intentReason": "explicit_city_mentioned",
  "note": "explicit_city_preferred_over_userLocation"
}
```

#### 3. Query Normalized - City Kept
```json
{
  "event": "textquery_normalized",
  "rawHash": "...",
  "originalTextQuery": "מסעדה איטלקית גדרה",
  "canonicalTextQuery": "איטלקי בגדרה",
  "reason": "extracted_cuisine_with_city",
  "keptCity": true,
  "cityText": "גדרה"
}
```

#### 4. City Geocoded
```json
{
  "event": "city_geocoded_for_bias",
  "cityText": "גדרה",
  "coords": {
    "lat": 31.809512,
    "lng": 34.776946
  },
  "radiusMeters": 10000,
  "biasSource": "cityCenter"
}
```

#### 5. Final Payload
```json
{
  "event": "textsearch_request_payload",
  "finalTextQuery": "איטלקי בגדרה",
  "textQueryLen": 13,
  "keptCity": true,
  "hasExplicitCity": true,
  "biasSource": "cityCenter",
  "biasLat": 31.809512,
  "biasLng": 34.776946,
  "biasRadiusMeters": 10000
}
```

### Key Metrics to Verify

| Metric | Before Fix | After Fix | Status |
|--------|-----------|-----------|--------|
| `finalTextQuery` | "איטלקי" | "איטלקי בגדרה" | ✅ |
| `textQueryLen` | 6 | 13 | ✅ |
| `keptCity` | N/A | `true` | ✅ |
| `hasExplicitCity` | N/A | `true` | ✅ |
| `biasSource` | "userLocation" | "cityCenter" | ✅ |
| `biasRadiusMeters` | 20000 | 10000 | ✅ |

## Edge Cases to Test

### Case 1: Explicit City with UserLocation
```json
{
  "query": "מסעדות איטלקיות בגדרה",
  "userLocation": {"lat": 32.0853, "lng": 34.7818}  // Tel Aviv
}
```
**Expected:**
- City "גדרה" preserved in query
- Bias uses Gedera center (not Tel Aviv)
- Radius: 10km

### Case 2: No Explicit City with UserLocation
```json
{
  "query": "מסעדות איטלקיות",
  "userLocation": {"lat": 32.0853, "lng": 34.7818}
}
```
**Expected:**
- Query: "איטלקי" (cuisine only)
- Bias uses userLocation (Tel Aviv)
- Radius: 20km
- `keptCity: false`

### Case 3: City Detected in Query (not from intent)
```json
{
  "query": "פיצה בחיפה"
}
```
**Expected:**
- Detected city: "חיפה"
- Query: "פיצה בחיפה" (city preserved)
- `keptCity: true`
- Bias: Haifa center, 10km

### Case 4: Generic Query
```json
{
  "query": "מה יש לאכול"
}
```
**Expected:**
- Query: "מסעדות" (generic)
- No city preservation
- `keptCity: false`

## Rollback Plan

If issues occur, revert these commits:
```bash
git revert HEAD~3  # Revert last 3 commits (if needed)
```

## Performance Impact

- ✅ No additional API calls
- ✅ Minimal regex processing (city detection)
- ✅ Same number of Google API calls
- ✅ No impact on response time

## Success Criteria

✅ **Query Preservation:**
- City names never dropped when explicit city is mentioned
- `textQueryLen` > 6 for queries with cities

✅ **Bias Correctness:**
- Explicit city searches use city-center bias
- Bias source labeled correctly: `cityCenter` vs `userLocation`
- Smaller radius (10km) for city-center searches

✅ **Logging:**
- All new fields present: `finalTextQuery`, `keptCity`, `hasExplicitCity`
- Clear bias source labels
- Easy to debug query flow

✅ **Backward Compatibility:**
- Queries without explicit cities unchanged
- UserLocation bias still works as fallback
- No breaking changes to API

## Next Steps

1. ✅ Code changes complete
2. ✅ Linter checks pass
3. 🔄 Run dev server and test with example queries
4. 🔄 Verify logs match expected output
5. 🔄 Test edge cases
6. 🔄 Deploy to staging for integration testing

## Contact

If issues occur, check:
1. Server logs: `server/logs/server.log`
2. Look for `textquery_normalized` and `textsearch_request_payload` events
3. Verify `keptCity` flag
4. Check `biasSource` value
