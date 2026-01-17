# Intent/Anchor Routing - Flow Diagram

## Query Analysis

```
Query: "מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"
       (Italian restaurants in Champs-Élysées 800 meters from Arc de Triomphe)

Components:
├─ Food type: "מסעדות איטלקיות" (Italian restaurants)
├─ Named place: "בשאנז אליזה" (in Champs-Élysées)
├─ Distance: "800 מטר" (800 meters)
└─ Anchor: "משער הניצחון" (from Arc de Triomphe)
```

## BEFORE (Bug) - Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Query: "מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │   INTENT STAGE (v2)             │
        │   - Sees "800 מטר" (distance)  │
        │   - Route: NEARBY ❌             │
        │   - Reason: "explicit_distance" │
        │   - Region: FR ✓                │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │   NEARBY MAPPER                 │
        │   - Uses ctx.userLocation ❌     │
        │   - Location: 31.80, 34.78      │
        │   - RadiusMeters: 800           │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │   GOOGLE NEARBY SEARCH          │
        │   - Center: ISRAEL coords ❌     │
        │   - Radius: 800m                │
        │   - Keyword: "איטלקיות"         │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │   RESULT                        │
        │   - 10 restaurants in ISRAEL ❌  │
        │   - NOT in Paris                │
        │   - Wrong country!              │
        └─────────────────────────────────┘
```

## AFTER (Fixed) - Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Query: "מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────────────┐
        │   INTENT STAGE (v3) ✓                           │
        │   - Detects "800 מטר משער הניצחון"             │
        │   - Pattern: "distance from LANDMARK"           │
        │   - Route: LANDMARK ✓                           │
        │   - Reason: "distance_from_landmark" ✓          │
        │   - Region: FR ✓                                │
        └─────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────────────────┐
        │   LANDMARK MAPPER (v2) ✓                        │
        │   - geocodeQuery: "Arc de Triomphe Paris" ✓     │
        │   - radiusMeters: 800 (from query) ✓            │
        │   - keyword: "מסעדות איטלקיות" ✓                │
        │   - afterGeocode: nearbySearch                  │
        │   - reason: "distance_from_landmark"            │
        │   - IGNORES ctx.userLocation ✓                  │
        └─────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────────────────┐
        │   GOOGLE GEOCODE API                            │
        │   - Query: "Arc de Triomphe Paris"              │
        │   - Result: {lat: 48.8738, lng: 2.2950} ✓       │
        │   - Log: anchorSource=GEOCODE_ANCHOR ✓          │
        │   - Log: anchorText="Arc de Triomphe Paris" ✓   │
        └─────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────────────────┐
        │   GOOGLE NEARBY SEARCH                          │
        │   - Center: PARIS coords (48.87, 2.29) ✓        │
        │   - Radius: 800m ✓                              │
        │   - Keyword: "מסעדות איטלקיות" ✓                │
        │   - Region: FR ✓                                │
        │   - Language: he ✓                              │
        └─────────────┬───────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────────────────┐
        │   RESULT ✓                                      │
        │   - Italian restaurants in PARIS ✓              │
        │   - Within 800m of Arc de Triomphe ✓            │
        │   - Correct country! ✓                          │
        └─────────────────────────────────────────────────┘
```

## Decision Matrix

```
┌───────────────────────────┬──────────────┬──────────────────┬────────────────┐
│ Query Pattern             │ Route        │ Anchor Source    │ Uses Location  │
├───────────────────────────┼──────────────┼──────────────────┼────────────────┤
│ "ממני" / "near me"        │ NEARBY       │ USER_LOCATION    │ ctx.userLoc    │
│ "100 מטר ממני"            │ NEARBY       │ USER_LOCATION    │ ctx.userLoc    │
│ "closest to me"           │ NEARBY       │ USER_LOCATION    │ ctx.userLoc    │
├───────────────────────────┼──────────────┼──────────────────┼────────────────┤
│ "800m from Arc de Tr."    │ LANDMARK     │ GEOCODE_ANCHOR   │ geocode result │
│ "500 מטר מאזריאלי"        │ LANDMARK     │ GEOCODE_ANCHOR   │ geocode result │
│ "near Dizengoff"          │ LANDMARK     │ GEOCODE_ANCHOR   │ geocode result │
│ "בשאנז אליזה"            │ LANDMARK     │ GEOCODE_ANCHOR   │ geocode result │
├───────────────────────────┼──────────────┼──────────────────┼────────────────┤
│ "פיצה בגדרה"             │ TEXTSEARCH   │ N/A              │ none           │
│ "restaurant in Tel Aviv"  │ TEXTSEARCH   │ N/A              │ none           │
└───────────────────────────┴──────────────┴──────────────────┴────────────────┘
```

## Key Distinctions

### Pattern Recognition

```
✓ NEARBY Pattern:
  "איטלקית במרחק 3000 מטר ממני"
            └──────────────┘
             "from ME"

✓ LANDMARK Pattern:
  "מסעדות איטלקיות 800 מטר משער הניצחון"
                      └────────────────┘
                       "from LANDMARK"
```

### Anchor Source Flow

```
User Query
    │
    ▼
Intent Stage
    │
    ├─► NEARBY? ────► Nearby Mapper ────► anchorSource: USER_LOCATION
    │                     │
    │                     └─► requires ctx.userLocation (throws if missing)
    │
    ├─► LANDMARK? ──► Landmark Mapper ──► anchorSource: GEOCODE_ANCHOR
    │                     │                     │
    │                     │                     ├─► geocodeQuery extraction
    │                     │                     ├─► radiusMeters extraction
    │                     │                     └─► keyword extraction
    │                     │
    │                     └─► IGNORES ctx.userLocation
    │
    └─► TEXTSEARCH? ► Text Mapper ─────► anchorSource: N/A (no anchor)
```

## Log Trace Example

### User Location Query
```json
[ROUTE2] intent: route=NEARBY, reason=distance_from_user
[ROUTE2] nearby_mapper: keyword=איטלקית, radiusMeters=3000
[GOOGLE] searchNearby: anchorSource=USER_LOCATION, location={lat:31.8,lng:34.78}
```

### Landmark Query (Fixed!)
```json
[ROUTE2] intent: route=LANDMARK, reason=distance_from_landmark, region=FR
[ROUTE2] landmark_mapper: geocodeQuery="Arc de Triomphe Paris", radiusMeters=800
[GOOGLE] landmarkPlan: anchorSource=GEOCODE_ANCHOR, anchorText="Arc de Triomphe Paris"
[GOOGLE] searchNearby: location={lat:48.87,lng:2.29}, radiusMeters=800
```

## Summary

✅ **Fixed**: "X meters from landmark" → LANDMARK route + geocode anchor  
✅ **Preserved**: "X meters from me" → NEARBY route + user location  
✅ **Enhanced**: Logging with anchorSource for traceability  
✅ **No Breaking Changes**: Backward compatible
