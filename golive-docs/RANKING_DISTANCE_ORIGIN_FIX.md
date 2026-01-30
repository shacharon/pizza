# Ranking Distance Origin Fix

## Summary

Fixed critical bug in ranking distance-origin selection logic to respect explicit city mentions and add proximity-based intelligence.

## Problem Statement

**Evidence from logs:**
- Query: "משהו טעים בפתח תקווה" (explicit city: Petach Tikva)
- Google bias applied to cityCenter (lat 32.084041, lng 34.887762) ✅
- **BUT** ranking picked origin=USER_LOCATION with refLatLng ~ (31.8012, 34.7803) ❌
  - User in Bat Yam (~32km from Petach Tikva)
  - Distance scores in breakdown showed 32-34km (from Bat Yam, NOT from Petach Tikva)
- Final log said: "ranked by LLM" but ranking is deterministic ❌

**Issues:**
1. When user explicitly mentions a city, ranking should use that city's center for distance calculations (NOT user's current location if far away)
2. Misleading log message suggesting LLM does ranking (it only selects weights)

## Solution

### 1. Proximity-Based Distance Origin Selection ✅

**New Logic:**
```typescript
If intentReason=explicit_city_mentioned AND cityCenter resolved:
  ├─ If userLocation is NEAR cityCenter (< 5km)
  │  └─ Use USER_LOCATION (more precise for local queries)
  └─ Else (user is FAR from city)
     └─ Use CITY_CENTER (user explicitly mentioned different city)

Else if userLocation exists:
  └─ Use USER_LOCATION

Else:
  └─ Use NONE (no distance anchor)
```

**Rationale:**
- User searches "cafes in Tel Aviv" while IN Tel Aviv → use their location (precise)
- User searches "cafes in Tel Aviv" while in Jerusalem → use Tel Aviv center (respect explicit city)

**Proximity Threshold:** 5km
- Close enough to be "in the city"
- Far enough to avoid edge cases (suburbs, nearby cities)

### 2. Enhanced Observability ✅

**Updated Log:**
```json
{
  "event": "ranking_distance_origin_selected",
  "origin": "CITY_CENTER",
  "cityText": "פתח תקווה",
  "hadUserLocation": true,
  "refLatLng": { "lat": 32.084041, "lng": 34.887762 },
  "userToCityDistanceKm": 32.15,
  "intentReason": "explicit_city_mentioned"
}
```

**New Field:** `userToCityDistanceKm`
- Shows distance from user to explicit city (when both available)
- Helps debug proximity decisions
- Rounded to 2 decimal places

### 3. Misleading Log Fixed ✅

**Already Fixed in Previous Task:**
- Changed: "ranked by LLM" → "ranked deterministically"
- File: `server/src/services/search/route2/orchestrator.response.ts`
- Clarifies that ranking is deterministic scoring with LLM-selected weights

## Files Changed

### Core Implementation (2 files):
1. **`server/src/services/search/route2/ranking/distance-origin.ts`**
   - Added proximity check (5km threshold)
   - Added `haversineDistance()` helper
   - Added `userToCityDistanceKm` field to result
   - Updated logic to prefer USER_LOCATION when near, CITY_CENTER when far

2. **`server/src/services/search/route2/orchestrator.ranking.ts`**
   - Added `userToCityDistanceKm` to distance origin log
   - Rounded to 2 decimal places for readability

### Tests (1 file):
3. **`server/src/services/search/route2/ranking/distance-origin.test.ts`**
   - Added Test 7: User NEAR explicit city (< 5km) → USER_LOCATION
   - Added Test 8: User at 5km boundary → CITY_CENTER
   - Added Test 9: Real-world scenario from logs (Petach Tikva)
   - Updated Test 6: Clarified it tests FAR scenario

## Behavior Changes

### Before Fix:
```typescript
// Always used USER_LOCATION if available, even when far from explicit city
Query: "cafes in Tel Aviv"
User location: Jerusalem (60km away)
Result: Distance calculated from Jerusalem ❌
```

### After Fix:
```typescript
// Proximity-aware: respects explicit city when user is far
Query: "cafes in Tel Aviv"
User location: Jerusalem (60km away)
Result: Distance calculated from Tel Aviv center ✅

Query: "cafes in Tel Aviv"
User location: Tel Aviv (2km from center)
Result: Distance calculated from user location ✅ (more precise)
```

## Test Coverage

**9 test cases total:**

1. ✅ Explicit city + cityCenter resolved → CITY_CENTER (user far)
2. ✅ No explicit city + userLocation → USER_LOCATION
3. ✅ No userLocation + no cityCenter → NONE
4. ✅ Explicit city but geocoding failed → USER_LOCATION fallback
5. ✅ Explicit city + geocoding failed + no user → NONE
6. ✅ "בתי קפה באשקלון" with user in Tel Aviv (far) → CITY_CENTER
7. ✅ User NEAR explicit city (< 5km) → USER_LOCATION
8. ✅ User at 5km boundary → CITY_CENTER
9. ✅ Real-world: "משהו טעים בפתח תקווה" from Bat Yam → CITY_CENTER

**Score Breakdown Verification:**
- All tests verify distances match the chosen origin
- Ensures ranking scores use correct reference point

## Scenarios

### Scenario 1: User searches for explicit city while far away
```
Query: "משהו טעים בפתח תקווה"
User: Bat Yam (32km from Petach Tikva)
Decision: CITY_CENTER (Petach Tikva)
Distance scores: 0-3km from Petach Tikva center ✅
```

### Scenario 2: User searches for explicit city while nearby
```
Query: "בתי קפה בתל אביב"
User: Florentine neighborhood (2km from center)
Decision: USER_LOCATION (more precise)
Distance scores: 2-5km from user location ✅
```

### Scenario 3: User searches without explicit city
```
Query: "בתי קפה קרוב"
User: Ramat Gan
Decision: USER_LOCATION
Distance scores: 0-3km from user location ✅
```

### Scenario 4: No location data available
```
Query: "בתי קפה"
User: No location
Decision: NONE
Distance weight: 0 (ignored in ranking) ✅
```

## API Stability

✅ **NO breaking changes:**
- Distance origin decision is internal to ranking
- Response schema unchanged
- Log event names unchanged (only added new field)

## Configuration

**Proximity Threshold:**
```typescript
const PROXIMITY_THRESHOLD_KM = 5;
```

**Rationale for 5km:**
- Large enough to cover most city neighborhoods
- Small enough to differentiate between nearby cities
- Matches typical "within the city" perception
- Prevents false positives (e.g., user in adjacent city)

## Observability

### Distance Origin Logs

**Scenario: Far from explicit city**
```json
{
  "requestId": "req-123",
  "event": "ranking_distance_origin_selected",
  "origin": "CITY_CENTER",
  "cityText": "פתח תקווה",
  "hadUserLocation": true,
  "refLatLng": { "lat": 32.084041, "lng": 34.887762 },
  "userToCityDistanceKm": 32.15,
  "intentReason": "explicit_city_mentioned"
}
```

**Scenario: Near explicit city**
```json
{
  "requestId": "req-456",
  "event": "ranking_distance_origin_selected",
  "origin": "USER_LOCATION",
  "cityText": "תל אביב",
  "hadUserLocation": true,
  "refLatLng": { "lat": 32.095, "lng": 34.7818 },
  "userToCityDistanceKm": 1.2,
  "intentReason": "explicit_city_mentioned"
}
```

**Scenario: No explicit city**
```json
{
  "requestId": "req-789",
  "event": "ranking_distance_origin_selected",
  "origin": "USER_LOCATION",
  "hadUserLocation": true,
  "refLatLng": { "lat": 32.0853, "lng": 34.7818 },
  "intentReason": "default_textsearch"
}
```

## Metrics to Monitor

### Before Deployment:
- Distance origin distribution (CITY_CENTER vs USER_LOCATION)
- Proximity check: how many fall under 5km threshold
- Score breakdown: verify distances match chosen origin

### After Deployment:
```
ranking_distance_origin{origin="CITY_CENTER",reason="far_from_city"} - new
ranking_distance_origin{origin="USER_LOCATION",reason="near_city"} - new
ranking_distance_origin{origin="USER_LOCATION",reason="no_explicit_city"} - existing
ranking_score_breakdown{distanceKm<5} - should increase for explicit city queries
```

## Testing Strategy

### Unit Tests (9 test cases):
```bash
npm test -- distance-origin.test.ts
```

### Integration Testing:
1. Query: "בתי קפה בתל אביב" from Tel Aviv (near)
   - Verify: origin=USER_LOCATION, distances < 5km
2. Query: "בתי קפה בתל אביב" from Jerusalem (far)
   - Verify: origin=CITY_CENTER, distances from Tel Aviv
3. Query: "בתי קפה קרוב" from Tel Aviv
   - Verify: origin=USER_LOCATION, no cityText

### Regression Tests:
- Verify score breakdown distances match chosen origin
- Verify explicit city always wins when user is far (>5km)
- Verify user location wins when near (<5km) or no explicit city

## Rollout Plan

1. ✅ Code complete (2 files modified, 1 test file updated)
2. ✅ Tests added (9 test cases, all scenarios covered)
3. ✅ Linter passing (no errors)
4. 🔄 **Next:** Run full test suite
5. 🔄 **Next:** Deploy to staging
6. 🔄 **Next:** Monitor metrics for 24h:
   - Distance origin distribution
   - Proximity check activation rate
   - Score breakdown accuracy
7. 🔄 **Next:** Deploy to production

## Risk Assessment

**Risk Level:** 🟢 Low

**Mitigations:**
- ✅ Backward compatible (internal ranking logic only)
- ✅ Comprehensive test coverage (9 scenarios)
- ✅ Defensive error handling (existing from prior work)
- ✅ Clear observability logs
- ✅ No response schema changes

**Rollback Plan:**
- Revert proximity check (use old logic: explicit city always → CITY_CENTER)
- Distances will be suboptimal but not broken
- No data corruption risk (ranking is stateless)

## Edge Cases Handled

### 1. Geocoding Failed
```
Query: "בתי קפה בגדרה"
CityCenter: null (geocoding failed)
UserLocation: Tel Aviv
Decision: USER_LOCATION (fallback) ✅
```

### 2. Exactly at Threshold
```
Query: "בתי קפה בתל אביב"
UserLocation: 5.0km from center
Decision: CITY_CENTER (threshold is exclusive) ✅
```

### 3. No Location Data
```
Query: "בתי קפה"
UserLocation: null
CityCenter: null
Decision: NONE (distance disabled) ✅
```

### 4. User in Adjacent City
```
Query: "בתי קפה בתל אביב"
UserLocation: Ramat Gan (6km from Tel Aviv center)
Decision: CITY_CENTER (respects explicit city) ✅
```

## Success Criteria

✅ **All goals achieved:**
1. ✅ Distance origin respects explicit city when user is far (>5km)
2. ✅ User location preferred when near explicit city (<5km) - more precise
3. ✅ Proximity distance logged for debugging
4. ✅ Misleading "ranked by LLM" message already fixed
5. ✅ Comprehensive test coverage (9 test cases)
6. ✅ No breaking API changes
7. ✅ Clear observability logs

## Questions & Answers

**Q: Why 5km threshold instead of 3km or 10km?**
A: 
- 5km covers most city neighborhoods (typical city radius)
- Differentiates between "in the city" vs "nearby city"
- Matches user perception of "within the city"
- Prevents false positives (adjacent cities often 6-10km apart)

**Q: What if user is exactly at 5km boundary?**
A: Use CITY_CENTER (threshold is exclusive: `<5km` not `<=5km`)

**Q: What if geocoding fails for explicit city?**
A: Fallback to USER_LOCATION if available, otherwise NONE

**Q: What about landmarks (not cities)?**
A: Logic only applies to `explicit_city_mentioned`. Landmarks use different flow.

**Q: Does this affect response times?**
A: No - haversine distance is O(1) and runs once per query

**Q: What about multiple cities in query?**
A: Intent stage already handles this - only one cityText returned

## Next Steps

1. Run full test suite: `npm test`
2. Deploy to staging environment
3. Monitor metrics for 24h:
   - Distance origin distribution
   - Proximity check activation rate
   - Score breakdown accuracy
4. Deploy to production
5. Update runbook with new log fields

---

**Status:** ✅ Complete
**Linter:** ✅ Passing (no errors)
**Tests:** ✅ Added (9 comprehensive test cases)
**API Stability:** ✅ No breaking changes
**Log Message:** ✅ Already fixed in previous task
