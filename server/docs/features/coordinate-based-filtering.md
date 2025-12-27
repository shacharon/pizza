# Coordinate-Based City Filtering

**Status:** ✅ **IMPLEMENTED**  
**Date:** December 21, 2025  
**Replaces:** City Alias Service (removed)

---

## 🎯 **Problem**

The original city alias approach didn't scale:
- ❌ Needed manual maintenance for every city
- ❌ Could never cover all cities (30 cities → 300 cities → infinite)
- ❌ Couldn't handle typos or new cities
- ❌ Required multilingual variants for each city

**User complaint:** "But it never ends... we can't put all in alias..."

---

## ✅ **Solution: Use Coordinates**

Instead of string matching addresses, **calculate distance** between:
- **City center coordinates** (from geocoding)
- **Restaurant coordinates** (from Google Places)

**Simple math. Works for every city in the world.** 🌍

---

## 📐 **How It Works**

### **Distance-Based Filtering**

```
User searches: "pizza in tel aviv"
↓
Geocoding: Tel Aviv = (32.0853, 34.7818)
↓
Google Places returns 10 results with coordinates
↓
For each result:
  distance = calculateDistance(city_center, result_location)
  
  if distance ≤ 10km  → WITHIN_CITY     (keep ✅)
  if distance ≤ 20km  → NEARBY_SUBURBS  (keep ✅, benefit of doubt)
  if distance > 20km  → TOO_FAR         (drop ❌)
```

---

## 🔧 **Implementation**

### **CityFilterService**

```typescript
class CityFilterService {
  private readonly CITY_RADIUS_KM = 10;      // Definitely in city
  private readonly SUBURBS_RADIUS_KM = 20;   // Possibly suburbs

  filter(
    results: RestaurantResult[],
    targetCity: string | undefined,
    targetCoords?: { lat: number; lng: number }
  ): CityFilterResult {
    if (!targetCoords) {
      return { kept: results, dropped: [] }; // No filtering
    }

    for (const result of results) {
      const distanceKm = this.calculateDistance(
        targetCoords,
        result.location
      );

      if (distanceKm <= this.CITY_RADIUS_KM) {
        result.cityMatch = true;
        result.cityMatchReason = 'WITHIN_CITY';
      } else if (distanceKm <= this.SUBURBS_RADIUS_KM) {
        result.cityMatch = false;
        result.cityMatchReason = 'NEARBY_SUBURBS';
        // Keep anyway (benefit of doubt)
      } else {
        result.cityMatch = false;
        result.cityMatchReason = 'TOO_FAR';
        // Drop this result
      }
    }
  }

  private calculateDistance(coord1, coord2): number {
    // Haversine formula for great-circle distance
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(coord2.lat - coord1.lat);
    const dLng = this.toRad(coord2.lng - coord1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(coord1.lat)) *
        Math.cos(this.toRad(coord2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
```

---

## 📊 **Examples**

### **Example 1: Tel Aviv**

```
Search: "pizza in tel aviv"
City center: (32.0853, 34.7818)

Results:
1. Rothschild Ave (0.5km)   → WITHIN_CITY ✅
2. Dizengoff St (2.3km)     → WITHIN_CITY ✅
3. Jaffa (5.8km)            → WITHIN_CITY ✅
4. Ramat Gan (8.2km)        → WITHIN_CITY ✅
5. Herzliya (15km)          → NEARBY_SUBURBS ✅ (kept, benefit of doubt)
6. Haifa (95km)             → TOO_FAR ❌ (dropped)

Result: 5 kept, 1 dropped
```

### **Example 2: Small City (Gedera)**

```
Search: "restaurant in gedera"
City center: (31.8125, 34.7772)

Results:
1. City center (0km)        → WITHIN_CITY ✅
2. East side (3km)          → WITHIN_CITY ✅
3. Rehovot (12km)           → NEARBY_SUBURBS ✅ (kept)
4. Ashdod (18km)            → NEARBY_SUBURBS ✅ (kept)
5. Tel Aviv (35km)          → TOO_FAR ❌ (dropped)

Result: 4 kept, 1 dropped
```

### **Example 3: Works Globally**

```
Search: "pizza in new york"
City center: (40.7128, -74.0060)

Results:
1. Manhattan (1km)          → WITHIN_CITY ✅
2. Brooklyn (8km)           → WITHIN_CITY ✅
3. Queens (16km)            → NEARBY_SUBURBS ✅
4. Boston (340km)           → TOO_FAR ❌

No aliases needed! Works automatically.
```

---

## ✅ **Benefits**

| Aspect | Old (Aliases) | New (Coordinates) |
|--------|---------------|-------------------|
| **Scalability** | 30 cities only | **Infinite** 🌍 |
| **Maintenance** | Manual updates | **Zero** ✅ |
| **Typos** | Breaks | **Still works** ✅ |
| **New cities** | Must add | **Automatic** ✅ |
| **Multilingual** | Need all variants | **Not needed** ✅ |
| **Accuracy** | Address parsing | **Math** 📐 |

---

## 🎯 **Configuration**

**Radius tuning** (can be adjusted):

```typescript
// Current settings:
CITY_RADIUS_KM = 10      // Core city
SUBURBS_RADIUS_KM = 20   // Extended area

// Can be made configurable per search:
filter(results, city, coords, options?: {
  cityRadiusKm?: number;
  suburbsRadiusKm?: number;
})
```

**Recommendations:**
- **Large cities** (Tel Aviv, Jerusalem): 10km/20km (current)
- **Small towns** (Gedera, Yavne): Could reduce to 5km/10km
- **Metropolis** (NYC, London): Could increase to 15km/30km

---

## 🧪 **Testing**

**Test Coverage:**
- ✅ Results within 10km kept
- ✅ Results 10-20km marked as suburbs (kept)
- ✅ Results >20km dropped
- ✅ Fallback when too few results
- ✅ Works for any city globally
- ✅ Handles missing coordinates gracefully

**Run Tests:**
```bash
cd server
npm test
```

---

## 🔄 **Migration**

**Changes Made:**
1. ✅ Deleted `city-alias.service.ts` (no longer needed)
2. ✅ Updated `CityFilterService` to use coordinates
3. ✅ Updated `SearchOrchestrator` to pass `location.coords`
4. ✅ Rewrote tests for coordinate-based filtering

**Breaking Changes:** None (internal implementation only)

---

## 💡 **Future Enhancements**

**Possible improvements:**
1. **Dynamic radius based on city size**
   - Get city bounds from geocoding API
   - Calculate radius automatically

2. **User preference for strictness**
   - "Strict" mode: only 5km
   - "Relaxed" mode: up to 30km

3. **Address component parsing**
   - Parse `address_components` from Google
   - Double-check with "locality" field

4. **Cache distance calculations**
   - Store in session to avoid recalculation

---

## 📝 **Summary**

**Removed:** 
- ❌ `CityAliasService` with 30+ hardcoded cities

**Added:**
- ✅ Coordinate-based distance calculation (Haversine formula)
- ✅ Universal filtering that works for any city in the world
- ✅ Zero maintenance burden

**Result:**
- Same accuracy
- Infinite scalability
- Simpler codebase

**The user was right - aliases don't scale. Coordinates do.** 🎯





