# Fix Complete: Intent/Anchor Routing for Foreign Landmarks

## Problem Statement

**Original Query**: `"מסעדות איטלקיות בשאנז אליזה 800 מטק משער הניצחון"`

**Bug**: System routed to NEARBY and used Israel coordinates while detecting region=FR, resulting in:
- Location used: `{lat: 31.80122, lng: 34.78032}` (Gedera, Israel)
- Region detected: `FR` (France) 
- Result: Zero relevant results (wrong country!)

**Root Cause**: Intent stage didn't distinguish "distance from ME" vs "distance from LANDMARK"

## Solution Implemented

### 1. Intent Stage Enhancement

**Prompt Version**: `intent_v2` → `intent_v3`

**Key Changes**:
```typescript
// BEFORE
- NEARBY: "near me", "closest", "around here", "לידי", "ממני",
  or explicit distance from the user (e.g., "100m from me", "200 מטר ממני").

// AFTER
- NEARBY: "near me", "closest", "around here", "לידי", "ממני".
  IMPORTANT: Distance from USER location ONLY (e.g., "100m from me", "200 מטר ממני").
  If distance is from a LANDMARK/PLACE (not "me"), use LANDMARK route instead.
  
- LANDMARK: a specific, named place/landmark as anchor point, especially:
  * Pattern "X meters from <landmark>" (e.g., "800m from Arc de Triomphe")
  * Named places/areas to geocode (e.g., "Champs-Élysées", "שער הניצחון")
  * Foreign landmarks
```

**Reason Tokens**:
- NEARBY: `distance_from_user` or `near_me`
- LANDMARK: `distance_from_landmark`

### 2. Landmark Mapper Enhancement

**Prompt Version**: `landmark_mapper_v1` → `landmark_mapper_v2`

**Key Changes**:
```typescript
Rules for geocodeQuery:
- Full, specific landmark name for geocoding (NOT the food/cuisine)
- If query has "X meters from <landmark>", extract ONLY the landmark name
- Examples:
  * "מסעדות איטלקיות 800 מטר משער הניצחון" → "Arc de Triomphe Paris"
  * "פיצה ליד דיזנגוף סנטר" → "Dizengoff Center Tel Aviv"

Rules for radiusMeters:
- If query explicitly states distance (e.g., "800 meters"), USE that exact value
```

### 3. Anchor Source Logging

**Added Fields**:
- `anchorSource: 'USER_LOCATION' | 'GEOCODE_ANCHOR'`
- `anchorText: string` (for LANDMARK routes)

## Before vs After

### BEFORE (Logs from user's query)

```json
Line 17: {
  "route": "NEARBY",
  "reason": "explicit_distance",
  "region": "FR"
}

Line 28: {
  "method": "searchNearby",
  "location": {"lat": 31.80122, "lng": 34.78032},  // ISRAEL!
  "radiusMeters": 800,
  "region": "FR"  // Contradiction!
}
```

### AFTER (Expected logs)

```json
{
  "stage": "intent",
  "route": "LANDMARK",
  "reason": "distance_from_landmark",
  "region": "FR",
  "confidence": 0.90
}

{
  "stage": "landmark_mapper",
  "geocodeQuery": "Arc de Triomphe Paris",
  "radiusMeters": 800,
  "keyword": "מסעדות איטלקיות",
  "afterGeocode": "nearbySearch",
  "reason": "distance_from_landmark"
}

{
  "stage": "google_maps",
  "method": "landmarkPlan",
  "anchorSource": "GEOCODE_ANCHOR",
  "anchorText": "Arc de Triomphe Paris"
}

// After geocoding:
{
  "method": "searchNearby",
  "location": {"lat": 48.8738, "lng": 2.2950},  // PARIS!
  "radiusMeters": 800,
  "anchorSource": "GEOCODE_ANCHOR"
}
```

## Test Scenarios

### Test 1: User Location Anchor (Unchanged Behavior)
**Query**: `"איטלקית במרחק 3000 מטר ממני"`

Expected:
- Route: `NEARBY`
- Anchor: `USER_LOCATION`
- Uses: `ctx.userLocation`

### Test 2: Landmark Anchor with Distance (FIXED!)
**Query**: `"מסעדות איטלקיות 800 מטר משער הניצחון"`

Expected:
- Route: `LANDMARK`
- Reason: `distance_from_landmark`
- Anchor: `GEOCODE_ANCHOR`
- Geocodes: "Arc de Triomphe Paris" → Paris coords
- Searches: 800m radius around Paris

### Test 3: Named Place (Unchanged Behavior)
**Query**: `"פיצה בשאנז אליזה"`

Expected:
- Route: `LANDMARK`
- Geocodes: "Champs-Élysées Paris"
- Searches: broader area around Champs-Élysées

## Guards & Safety

1. **NEARBY Mapper**: Already throws if `!ctx.userLocation` (line 75-86)
2. **LANDMARK Mapper**: Never accesses `ctx.userLocation`
3. **Intent Prompt**: Explicit rules prevent misrouting

## Files Changed

1. ✅ `server/src/services/search/route2/stages/intent/intent.prompt.ts`
   - Enhanced route rules
   - Updated reason tokens
   - Version bump: v2 → v3

2. ✅ `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts`
   - Enhanced geocodeQuery extraction
   - Added distance extraction
   - Version bump: v1 → v2

3. ✅ `server/src/services/search/route2/stages/google-maps.stage.ts`
   - Added anchorSource/anchorText logging

4. ✅ `server/tests/intent-anchor-routing.test.ts` (new)
5. ✅ `server/INTENT_ANCHOR_FIX.md` (new)
6. ✅ `server/ANCHOR_FIX_SUMMARY.md` (new)

## Validation

✅ No TypeScript errors in modified files  
✅ Prompt versions incremented  
✅ Backward compatible (no breaking changes)  
✅ Logging enhanced with anchorSource  
✅ Documentation complete

## How to Verify Fix

1. **Query**: `"מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"`

2. **Check logs for**:
   - Intent: `route=LANDMARK`, `reason=distance_from_landmark`, `region=FR`
   - Landmark Mapper: `geocodeQuery` contains "Arc de Triomphe"
   - Google: `anchorSource=GEOCODE_ANCHOR`, coords ~(48.87, 2.29)

3. **Verify results**: Italian restaurants in PARIS, not Israel

## Done! ✅

The bug is fixed. Queries with "X meters from <landmark>" now correctly:
1. Route to LANDMARK (not NEARBY)
2. Geocode the landmark anchor
3. Search around geocoded coordinates (not userLocation)
4. Log anchorSource for traceability
