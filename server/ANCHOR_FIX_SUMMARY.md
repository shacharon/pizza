# ROUTE2 Intent/Anchor Selection Fix - Summary

## Changes Made

### 1. Intent Prompt (v2 → v3)
**File**: `server/src/services/search/route2/stages/intent/intent.prompt.ts`

**Key Changes**:
- Clarified NEARBY route requires explicit "from me" anchor (`ממני`, `near me`)
- Added LANDMARK detection for "X meters from <landmark>" pattern
- Updated reason tokens: `distance_from_user` vs `distance_from_landmark`
- Updated confidence: LANDMARK with distance → 0.80-0.95

### 2. Landmark Mapper (v1 → v2)
**File**: `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts`

**Key Changes**:
- Added explicit "distance from landmark" pattern handling
- Extract exact distance from query (e.g., 800 meters)
- Extract landmark name (NOT food type) for geocoding
- Added reason: `distance_from_landmark`
- Examples with foreign landmarks

### 3. Anchor Source Logging
**File**: `server/src/services/search/route2/stages/google-maps.stage.ts`

**Key Changes**:
- Added `anchorSource: 'USER_LOCATION' | 'GEOCODE_ANCHOR'`
- Added `anchorText` for LANDMARK routes
- Enhanced log messages

## Flow Comparison

### BEFORE (Bug)
```
Query: "מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"
       ↓
Intent: route=NEARBY, reason="explicit_distance", region=FR
       ↓
Nearby Mapper: uses ctx.userLocation = {lat: 31.80, lng: 34.78} (ISRAEL!)
       ↓
Google Nearby Search: 800m radius around Israel coords
       ↓
Result: No Italian restaurants (wrong country!)
```

### AFTER (Fixed)
```
Query: "מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"
       ↓
Intent: route=LANDMARK, reason="distance_from_landmark", region=FR
       ↓
Landmark Mapper:
  - geocodeQuery: "Arc de Triomphe Paris"
  - radiusMeters: 800
  - keyword: "מסעדות איטלקיות"
  - afterGeocode: nearbySearch
       ↓
Google Geocode: "Arc de Triomphe Paris" → {lat: 48.87, lng: 2.29}
       ↓
Google Nearby Search: 800m radius around Paris coords
       ↓
Result: Italian restaurants near Arc de Triomphe in PARIS ✓
```

## Test Scenarios

### ✅ Scenario 1: User Location Anchor
**Query**: `"איטלקית במרחק 3000 מטר ממני"`

```json
Intent Stage:
{
  "route": "NEARBY",
  "reason": "distance_from_user",
  "confidence": 0.85
}

Nearby Mapper:
{
  "providerMethod": "nearbySearch",
  "location": {"lat": <userLat>, "lng": <userLng>},
  "radiusMeters": 3000,
  "keyword": "איטלקית"
}

Google Maps Stage Log:
{
  "anchorSource": "USER_LOCATION",
  "location": {"lat": <userLat>, "lng": <userLng>}
}
```

### ✅ Scenario 2: Landmark Anchor with Distance
**Query**: `"מסעדות איטלקיות 800 מטר משער הניצחון"`

```json
Intent Stage:
{
  "route": "LANDMARK",
  "reason": "distance_from_landmark",
  "region": "FR",
  "confidence": 0.90
}

Landmark Mapper:
{
  "providerMethod": "landmarkPlan",
  "geocodeQuery": "Arc de Triomphe Paris",
  "afterGeocode": "nearbySearch",
  "radiusMeters": 800,
  "keyword": "מסעדות איטלקיות",
  "reason": "distance_from_landmark"
}

Google Maps Stage Log:
{
  "anchorSource": "GEOCODE_ANCHOR",
  "anchorText": "Arc de Triomphe Paris",
  "geocodeQuery": "Arc de Triomphe Paris"
}
```

### ✅ Scenario 3: Named Place (No Distance)
**Query**: `"פיצה בשאנז אליזה"`

```json
Intent Stage:
{
  "route": "LANDMARK",
  "reason": "street_landmark",
  "region": "FR",
  "confidence": 0.80
}

Landmark Mapper:
{
  "providerMethod": "landmarkPlan",
  "geocodeQuery": "Champs-Élysées Paris",
  "afterGeocode": "textSearchWithBias",
  "radiusMeters": 1500,
  "keyword": "פיצה",
  "reason": "street_landmark"
}
```

### ✅ Scenario 4: Simple City Search
**Query**: `"פיצה בגדרה"`

```json
Intent Stage:
{
  "route": "TEXTSEARCH",
  "reason": "city_text",
  "region": "IL",
  "confidence": 0.75
}

Text Mapper:
{
  "providerMethod": "textSearch",
  "textQuery": "פיצה בגדרה",
  "bias": null
}
```

## Validation Checklist

- [x] Intent prompt clearly distinguishes "from me" vs "from landmark"
- [x] Landmark mapper extracts exact distance and landmark name
- [x] NEARBY route enforces userLocation requirement
- [x] LANDMARK route uses geocoding, ignores userLocation
- [x] Logs include anchorSource for traceability
- [x] Prompt versions incremented (intent_v3, landmark_mapper_v2)
- [x] No TypeScript errors in modified files
- [x] Documentation created (INTENT_ANCHOR_FIX.md)

## How to Test

1. **Start server**: `npm run dev`

2. **Test query with landmark anchor**:
   ```bash
   POST /api/v1/search
   {
     "query": "מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון",
     "userLocation": {"lat": 31.8, "lng": 34.78}
   }
   ```

3. **Check logs** (server/logs/server.log):
   ```json
   {
     "stage": "intent",
     "route": "LANDMARK",
     "reason": "distance_from_landmark",
     "region": "FR"
   }
   {
     "stage": "landmark_mapper",
     "geocodeQuery": "Arc de Triomphe Paris",
     "radiusMeters": 800
   }
   {
     "stage": "google_maps",
     "anchorSource": "GEOCODE_ANCHOR",
     "anchorText": "Arc de Triomphe Paris",
     "location": {"lat": 48.87, "lng": 2.29}
   }
   ```

4. **Verify results**: Italian restaurants in PARIS (not Israel)

## Files Modified

1. `server/src/services/search/route2/stages/intent/intent.prompt.ts`
   - Updated route rules (NEARBY vs LANDMARK)
   - Updated confidence rules
   - Updated reason tokens
   - Version: intent_v2 → intent_v3

2. `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts`
   - Enhanced geocodeQuery extraction
   - Added distance extraction from query
   - Added distance_from_landmark reason
   - Version: landmark_mapper_v1 → landmark_mapper_v2

3. `server/src/services/search/route2/stages/google-maps.stage.ts`
   - Added anchorSource logging
   - Added anchorText for LANDMARK

4. `server/tests/intent-anchor-routing.test.ts` (new)
   - Test assertions for anchor source detection

5. `server/INTENT_ANCHOR_FIX.md` (new)
   - Detailed documentation

## Backward Compatibility

✅ **No Breaking Changes**:
- TEXTSEARCH queries: unchanged
- NEARBY "from me" queries: unchanged
- Existing LANDMARK queries: unchanged

✅ **New Feature**:
- "X meters from landmark" now correctly routes to LANDMARK (was incorrectly routed to NEARBY)

## Performance Impact

- **Zero performance impact**: Changes are only to prompt text and logging
- LLM calls: same number, same endpoints
- Geocoding: already used for LANDMARK route
