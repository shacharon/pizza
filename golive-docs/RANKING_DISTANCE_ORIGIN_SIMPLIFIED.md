# Ranking Distance Origin Logic Simplification

## Summary

Simplified the distance origin selection logic for ranking to **always use CITY_CENTER** when an explicit city is mentioned in the query, regardless of user proximity to that city.

## Problem Statement

The previous implementation had proximity-based logic:
- If user was NEAR the explicit city (< 5km) → use USER_LOCATION (more precise)
- If user was FAR from the explicit city → use CITY_CENTER

This added complexity and didn't match the expected behavior: when a user explicitly mentions a city, they want results ranked by distance from that city's center, not from their current location.

## Solution

### Simplified Rules

**Before:**
1. explicit_city_mentioned + cityCenter resolved:
   - If user near city (< 5km) → USER_LOCATION
   - Else → CITY_CENTER
2. No explicit city but userLocation → USER_LOCATION
3. Neither → NONE

**After:**
1. explicit_city_mentioned + cityCenter resolved → **CITY_CENTER** (always)
2. No explicit city but userLocation → USER_LOCATION
3. Neither → NONE

### Files Changed

#### 1. `server/src/services/search/route2/ranking/distance-origin.ts`

**Removed:**
- `PROXIMITY_THRESHOLD_KM` constant (5km threshold)
- Proximity check logic (lines 72-89)
- Conditional logic based on user distance to city

**Added:**
- Simplified logic that always uses CITY_CENTER for explicit cities
- Still calculates `userToCityDistanceKm` for observability (logs), but doesn't use it for decision making

**Key Changes:**
```typescript
// BEFORE: Proximity-based logic
if (isExplicitCity && hasCityText && cityCenter) {
  if (userLocation) {
    const distanceKm = haversineDistance(...);
    if (distanceKm < PROXIMITY_THRESHOLD_KM) {
      return { origin: 'USER_LOCATION', ... };  // User near city
    }
    return { origin: 'CITY_CENTER', ... };      // User far from city
  }
  return { origin: 'CITY_CENTER', ... };
}

// AFTER: Always use CITY_CENTER
if (isExplicitCity && hasCityText && cityCenter) {
  const userToCityDistanceKm = userLocation
    ? haversineDistance(...)  // For observability only
    : undefined;
  
  return {
    origin: 'CITY_CENTER',
    refLatLng: cityCenter,
    hadUserLocation: !!userLocation,
    userToCityDistanceKm  // Logged but not used for decision
  };
}
```

#### 2. `server/src/services/search/route2/ranking/distance-origin.test.ts`

**Updated Tests:**
- Test 1: Already expected CITY_CENTER ✅ (no change)
- Test 2: USER_LOCATION for no explicit city ✅ (no change)
- Test 3: NONE when no anchor ✅ (no change)
- Test 4: Fallback to USER_LOCATION ✅ (no change)
- Test 5: NONE when geocoding failed ✅ (no change)
- Test 6: CITY_CENTER for far user ✅ (updated comments)
- **Test 7:** Changed from `USER_LOCATION` to `CITY_CENTER` when user near city ✅
- **Test 8:** Updated comments to reflect simplified logic ✅
- Test 9: CITY_CENTER for explicit city ✅ (updated comments)

**Test Results:**
```
✅ 9 tests passed
✅ 0 tests failed
```

## Behavior Examples

### Example 1: User in Tel Aviv searches "בתי קפה באשקלון" (cafes in Ashkelon)

**Before:**
- User location: Tel Aviv (32.0853, 34.7818)
- City center: Ashkelon (31.669, 34.571)
- Distance: ~50km (far from city)
- **Result:** CITY_CENTER (Ashkelon) ✅

**After:**
- Same as before (no change for far user)
- **Result:** CITY_CENTER (Ashkelon) ✅

---

### Example 2: User in Tel Aviv center searches "בתי קפה בתל אביב" (cafes in Tel Aviv)

**Before:**
- User location: Tel Aviv (32.0953, 34.7818)
- City center: Tel Aviv (32.0853, 34.7818)
- Distance: ~1.1km (near city, < 5km)
- **Result:** USER_LOCATION ❌ (inconsistent - explicit city ignored)

**After:**
- User location: Tel Aviv (32.0953, 34.7818)
- City center: Tel Aviv (32.0853, 34.7818)
- Distance: ~1.1km (logged for observability)
- **Result:** CITY_CENTER (Tel Aviv) ✅ (consistent - honors explicit city)

---

### Example 3: User in Tel Aviv searches "בתי קפה" (cafes, no city)

**Before:**
- User location: Tel Aviv (32.0853, 34.7818)
- No explicit city
- **Result:** USER_LOCATION ✅

**After:**
- Same as before (no change)
- **Result:** USER_LOCATION ✅

## API Stability

✅ **NO breaking changes:**
- `DistanceOriginDecision` interface unchanged
- `resolveDistanceOrigin()` function signature unchanged
- All return types identical
- `userToCityDistanceKm` still populated (for logs)

## Observability

### Logs Unchanged

The `ranking_distance_origin_selected` log event still includes:
- `origin`: 'CITY_CENTER' | 'USER_LOCATION' | 'NONE'
- `refLatLng`: Coordinates used for distance calculation
- `hadUserLocation`: Whether user location was available
- `userToCityDistanceKm`: Distance between user and city (for observability)
- `cityText`: Explicit city name (if any)

**Example Log (User near explicit city):**
```json
{
  "event": "ranking_distance_origin_selected",
  "origin": "CITY_CENTER",
  "refLatLng": { "lat": 32.0853, "lng": 34.7818 },
  "hadUserLocation": true,
  "userToCityDistanceKm": 1.1,
  "cityText": "תל אביב",
  "intentReason": "explicit_city_mentioned"
}
```

**Key Point:** `userToCityDistanceKm` is still logged, but the decision is **always CITY_CENTER** when explicit city is mentioned.

## UX Benefits

### Consistency

**Before:**
- "בתי קפה בתל אביב" (user in Tel Aviv center) → ranked from USER_LOCATION
- "בתי קפה בתל אביב" (user in Haifa) → ranked from CITY_CENTER
- **Inconsistent:** Same query, different ranking anchors

**After:**
- "בתי קפה בתל אביב" → **always** ranked from CITY_CENTER (Tel Aviv)
- **Consistent:** Explicit city always honored

### User Intent

When a user explicitly mentions a city, they expect:
- ✅ Results centered around that city
- ✅ Distance measured from that city's center
- ❌ NOT results centered around their current location

**Example:**
- User in Tel Aviv searches "בתי קפה באשקלון"
- User wants cafes in Ashkelon, NOT cafes near their current Tel Aviv location
- **After fix:** Results correctly ranked by distance from Ashkelon center

## Performance Impact

✅ **Improved performance:**
- Removed proximity check logic (haversine calculation still done for logs, but simpler code path)
- One fewer conditional branch
- Clearer logic = easier to maintain

**Before:**
```typescript
if (isExplicitCity && hasCityText && cityCenter) {
  if (userLocation) {
    const distanceKm = haversineDistance(...);  // Calculate
    if (distanceKm < PROXIMITY_THRESHOLD_KM) {  // Check threshold
      return { origin: 'USER_LOCATION', ... };
    }
    return { origin: 'CITY_CENTER', ... };
  }
  return { origin: 'CITY_CENTER', ... };
}
```

**After:**
```typescript
if (isExplicitCity && hasCityText && cityCenter) {
  const userToCityDistanceKm = userLocation
    ? haversineDistance(...)  // Calculate (for logs only)
    : undefined;
  
  return { origin: 'CITY_CENTER', ... };  // Simple, deterministic
}
```

## Testing

### Unit Tests

All 9 tests pass:
1. ✅ Explicit city → CITY_CENTER
2. ✅ No explicit city + userLocation → USER_LOCATION
3. ✅ No anchor → NONE
4. ✅ Explicit city (geocoding failed) → USER_LOCATION fallback
5. ✅ Explicit city (no geocode, no user) → NONE
6. ✅ Integration: Ashkelon query from Tel Aviv → CITY_CENTER
7. ✅ User NEAR explicit city → CITY_CENTER (updated)
8. ✅ User at 5km threshold → CITY_CENTER (updated)
9. ✅ Real-world: Petach Tikva from Bat Yam → CITY_CENTER

### Test Coverage

```bash
npx tsx --test src/services/search/route2/ranking/distance-origin.test.ts
```

**Results:**
```
TAP version 13
# tests 9
# suites 1
# pass 9
# fail 0
# cancelled 0
# skipped 0
# duration_ms 667.6884
```

## Rollout Plan

1. ✅ Code complete (2 files changed)
2. ✅ Tests passing (9/9 pass)
3. ✅ Linter passing (no errors)
4. 🔄 **Next:** Deploy to staging
5. 🔄 **Next:** Test with real queries:
   - "בתי קפה בתל אביב" (user in Tel Aviv)
   - "בתי קפה באשקלון" (user in Tel Aviv)
   - "בתי קפה" (user in Tel Aviv, no explicit city)
6. 🔄 **Next:** Monitor logs for `ranking_distance_origin_selected`
7. 🔄 **Next:** Deploy to production

## Success Criteria

✅ **All goals achieved:**
1. ✅ Explicit city ALWAYS uses CITY_CENTER
2. ✅ Simplified logic (removed proximity check)
3. ✅ All tests passing (9/9)
4. ✅ No breaking changes (API unchanged)
5. ✅ Observability preserved (logs include distance)
6. ✅ UX consistency improved

## Risk Assessment

**Risk Level:** 🟢 Low

**Mitigations:**
- ✅ Well-tested (9 unit tests)
- ✅ No breaking changes (API unchanged)
- ✅ Simplification (less code = fewer bugs)
- ✅ Logs unchanged (observability maintained)
- ✅ Backward compatible (existing behavior for no-city queries unchanged)

**Potential Issues:**
- Users very close to explicit city may see slightly different rankings
- **Impact:** Minimal - explicit city intent is more important than 1-2km precision

**Rollback Plan:**
- Revert 2 files to previous version
- No database changes needed
- No cache invalidation needed

## Questions & Answers

**Q: Why remove the proximity check?**
A: Explicit city intent should always be honored. If a user says "cafes in Tel Aviv", they want Tel Aviv results, not results near their current location.

**Q: What if user is IN the explicit city?**
A: Still use CITY_CENTER. The difference is minimal (1-2km) and consistency is more important.

**Q: What about "near me" queries?**
A: Unchanged. If no explicit city is mentioned, we use USER_LOCATION (same as before).

**Q: What if geocoding fails?**
A: Fallback to USER_LOCATION (same as before).

**Q: Is the distance still logged?**
A: Yes. `userToCityDistanceKm` is still calculated and logged for observability, just not used for decision making.

**Q: What about performance?**
A: Improved. Removed one conditional branch, simpler code path.

## Next Steps

1. Deploy to staging
2. Test with real queries:
   - Explicit city queries (various distances)
   - "Near me" queries (no explicit city)
   - Geocoding failure scenarios
3. Monitor logs for `ranking_distance_origin_selected`
4. Verify UX consistency
5. Deploy to production
6. Monitor user engagement metrics

---

**Status:** ✅ Complete
**Tests:** ✅ 9/9 passing
**Linter:** ✅ No errors
**Breaking Changes:** ✅ None
**Risk:** 🟢 Low
**UX Impact:** ✅ Improved consistency
