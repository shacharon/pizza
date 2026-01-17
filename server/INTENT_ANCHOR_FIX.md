# Intent Stage: Anchor Source Detection Fix

## Problem

Query: `"מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"`  
(Italian restaurants in Champs-Élysées 800 meters from Arc de Triomphe)

**Bug**: Routed to NEARBY and used `ctx.userLocation` (Israel coordinates) while `region=FR`, resulting in wrong location search.

**Root Cause**: Intent stage classified "distance from landmark" as NEARBY route because prompt didn't distinguish between:
- `"X meters from ME"` → should use userLocation (NEARBY)
- `"X meters from LANDMARK"` → should geocode landmark (LANDMARK)

## Solution

### 1. Intent Prompt Enhancement

**File**: `server/src/services/search/route2/stages/intent/intent.prompt.ts`

**Changes**:
- Clarified NEARBY route is ONLY for "from me" patterns (`ממני`, `near me`, `from me`)
- Added explicit LANDMARK detection for "distance from landmark" pattern
- Updated confidence rules: LANDMARK with distance → 0.80-0.95
- Updated reason tokens: `distance_from_user` vs `distance_from_landmark`

**Before**:
```typescript
Route rules:
- NEARBY: phrases like "near me", "closest", "around here", "לידי", "ממני",
  or explicit distance from the user (e.g., "100m from me", "200 מטר ממני").
```

**After**:
```typescript
Route rules:
- NEARBY: phrases like "near me", "closest", "around here", "לידי", "ממני".
  IMPORTANT: Distance from USER location ONLY (e.g., "100m from me", "200 מטר ממני").
  If distance is from a LANDMARK/PLACE (not "me"), use LANDMARK route instead.
- LANDMARK: a specific, named place/landmark as anchor point, especially:
  * Pattern "X meters from <landmark>" (e.g., "800m from Arc de Triomphe", "500 מטר מאזריאלי")
  * Named places/areas to geocode (e.g., "Champs-Élysées", "Azrieli", "מרינה הרצליה")
  * Foreign landmarks (e.g., "שער הניצחון" = Arc de Triomphe)
```

### 2. Landmark Mapper Enhancement

**File**: `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts`

**Changes**:
- Added explicit handling for "X meters from landmark" pattern
- Extract exact distance when specified (e.g., 800 meters)
- Extract landmark name for geocoding (NOT the food type)
- Added reason token: `distance_from_landmark`

**Examples**:
```typescript
// Input: "מסעדות איטלקיות 800 מטר משער הניצחון"
// Output:
{
  geocodeQuery: "Arc de Triomphe Paris",
  radiusMeters: 800,  // from query
  keyword: "מסעדות איטלקיות",
  reason: "distance_from_landmark"
}
```

### 3. Anchor Source Logging

**File**: `server/src/services/search/route2/stages/google-maps.stage.ts`

**Changes**:
- Added `anchorSource` field to logs: `'USER_LOCATION' | 'GEOCODE_ANCHOR'`
- Added `anchorText` for LANDMARK routes (the geocoded landmark name)

**Nearby Search (user location)**:
```javascript
logger.info({
  // ... existing fields
  anchorSource: 'USER_LOCATION'
}, '[GOOGLE] Calling Nearby Search API (New) - anchor: user location');
```

**Landmark Plan (geocoded anchor)**:
```javascript
logger.info({
  // ... existing fields
  anchorSource: 'GEOCODE_ANCHOR',
  anchorText: mapping.geocodeQuery
}, '[GOOGLE] Executing Landmark Plan (two-phase) - anchor: geocoded landmark');
```

## Test Cases

### Case 1: User Location Anchor
**Query**: `"איטלקית במרחק 3000 מטר ממני"`  
**Expected**:
- Intent: `route=NEARBY`, `reason=distance_from_user`
- Uses: `ctx.userLocation`
- Log: `anchorSource=USER_LOCATION`

### Case 2: Landmark Anchor with Distance
**Query**: `"מסעדות איטלקיות 800 מטר משער הניצחון"`  
**Expected**:
- Intent: `route=LANDMARK`, `reason=distance_from_landmark`, `region=FR`
- Landmark Mapper: `geocodeQuery="Arc de Triomphe Paris"`, `radiusMeters=800`
- Google: Geocode → Nearby Search with geocoded coords
- Log: `anchorSource=GEOCODE_ANCHOR`, `anchorText="Arc de Triomphe Paris"`
- Result: Restaurants near Arc de Triomphe in PARIS, France

### Case 3: Named Place (No Distance)
**Query**: `"פיצה בשאנז אליזה"`  
**Expected**:
- Intent: `route=LANDMARK`, `reason=named_landmark|street_landmark`
- Landmark Mapper: `geocodeQuery="Champs-Élysées Paris"`, `radiusMeters=1000-1500`
- Log: `anchorSource=GEOCODE_ANCHOR`

### Case 4: Simple City Search
**Query**: `"פיצה בגדרה"`  
**Expected**:
- Intent: `route=TEXTSEARCH`
- Text Mapper: `textQuery="פיצה בגדרה"`
- Google: searchText (no anchor)

## Guards

1. **NEARBY Mapper**: Already throws if `!ctx.userLocation` (fails fast)
2. **LANDMARK Mapper**: Never uses `ctx.userLocation`, always geocodes anchor
3. **Intent Prompt**: Explicit distinction between "from me" vs "from landmark"

## Log Validation

Before fix:
```json
{
  "route": "NEARBY",
  "reason": "explicit_distance",
  "region": "FR",
  "location": {"lat": 31.801, "lng": 34.780}  // Israel!
}
```

After fix:
```json
{
  "route": "LANDMARK",
  "reason": "distance_from_landmark",
  "region": "FR",
  "anchorSource": "GEOCODE_ANCHOR",
  "anchorText": "Arc de Triomphe Paris",
  "geocodeQuery": "Arc de Triomphe Paris",
  "radiusMeters": 800,
  "keyword": "מסעדות איטלקיות"
}
```

## Files Changed

1. `server/src/services/search/route2/stages/intent/intent.prompt.ts`
2. `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts`
3. `server/src/services/search/route2/stages/google-maps.stage.ts`
4. `server/tests/intent-anchor-routing.test.ts` (new)

## How to Verify

1. Query: `"מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"`
2. Check logs for:
   - Intent: `route=LANDMARK`, `reason=distance_from_landmark`, `region=FR`
   - Landmark Mapper: `geocodeQuery` contains "Arc de Triomphe" or "שער הניצחון"
   - Google: `anchorSource=GEOCODE_ANCHOR`, coords near Paris (~48.8, 2.3), NOT Israel
3. Results: Restaurants in Paris, NOT Israel

## Backward Compatibility

✅ TEXTSEARCH queries: unchanged  
✅ NEARBY "from me" queries: unchanged  
✅ Existing LANDMARK queries: unchanged  
✅ NEW: "distance from landmark" now correctly routes to LANDMARK instead of NEARBY
