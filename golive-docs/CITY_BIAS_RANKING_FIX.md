# City Bias + Ranking Distance Fix

## Problem Statement

For explicit-city queries (e.g., "בתי קפה באשקלון", "מסעדות איטלקיות בגדרה"), the system had two issues:

1. **City bias not properly applied**: Logs showed "cityText_pending_geocode" but geocoding/bias wasn't consistently applied to Google requests
2. **Wrong distance anchor in ranking**: Distance calculations used `userLocation` (device GPS) instead of city center, causing incorrect distances (25km+ instead of 0-5km)

## Solution

### 1. City Center Geocoding with Caching

**File**: `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

Added in-memory cache for city geocoding (1 hour TTL):

```typescript
const CITY_GEOCODE_CACHE = new Map<string, { coords: { lat: number; lng: number }; cachedAt: number }>();
const CITY_GEOCODE_CACHE_TTL_MS = 3600_000; // 1 hour
```

**Flow**:
1. When `cityText` exists and no `mapping.bias`:
   - Check cache first (key = `cityText_regionCode`)
   - If cache miss: call `callGoogleGeocodingAPI(cityText)`
   - Cache result for 1 hour
2. Apply city center as location bias with 10km radius
3. Store `cityCenter` in mapping for ranking

**Logs**:
```json
{
  "event": "city_center_resolved",
  "cityText": "אשקלון",
  "lat": 31.669,
  "lng": 34.571,
  "servedFromCache": true,
  "radiusMeters": 10000,
  "biasSource": "cityCenter"
}
```

```json
{
  "event": "google_textsearch_bias_applied",
  "biasType": "cityCenter",
  "lat": 31.669,
  "lng": 34.571,
  "radiusMeters": 10000
}
```

### 2. Ranking Distance Source Fix

**File**: `server/src/services/search/route2/orchestrator.ranking.ts`

Changed distance anchor priority:
```typescript
// OLD: Always used ctx.userLocation
userLocation: ctx.userLocation ?? null

// NEW: Priority: cityCenter > userLocation
const distanceAnchor = cityCenter || ctx.userLocation || null;
const distanceSource = cityCenter ? 'cityCenter' : (ctx.userLocation ? 'userLocation' : null);
```

**Log**:
```json
{
  "event": "ranking_distance_source",
  "source": "cityCenter",
  "hadUserLocation": false,
  "hasCityText": true,
  "anchorLat": 31.810,
  "anchorLng": 34.777
}
```

### 3. Schema Updates

**File**: `server/src/services/search/route2/stages/route-llm/schemas.ts`

Added `cityCenter` field to `TextSearchMappingSchema`:

```typescript
export const TextSearchMappingSchema = TextSearchLLMResponseSchema.extend({
  bias: LocationBiasSchema.nullable().optional(),
  cityText: z.string().min(1).optional(),
  cityCenter: LocationSchema.nullable().optional() // NEW: Resolved city center coordinates
}).strict();
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ User Query: "מסעדות איטלקיות בגדרה"                    │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│ INTENT Stage: Extract cityText="גדרה"                  │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│ TEXTSEARCH Stage: Has cityText, no bias yet            │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│ GEOCODE: Check cache → call Google Geocoding API       │
│ Result: {lat: 31.810, lng: 34.777} (Gedera center)    │
│ Cache for 1 hour                                        │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│ APPLY BIAS: mapping.bias = {                           │
│   type: 'locationBias',                                 │
│   center: {lat: 31.810, lng: 34.777},                  │
│   radiusMeters: 10000                                   │
│ }                                                       │
│ mapping.cityCenter = {lat: 31.810, lng: 34.777}       │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│ GOOGLE TEXTSEARCH: Request includes locationBias       │
│ Returns results within ~10km of Gedera center          │
└─────────────────────────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────┐
│ RANKING: Use cityCenter as distance anchor             │
│ distanceMeters = distance from Gedera center (not Tel  │
│ Aviv userLocation)                                      │
│ Result: distanceMeters = 300-5000m (typical)          │
└─────────────────────────────────────────────────────────┘
```

## Before vs After

### Query: "בתי קפה באשקלון" (cafes in Ashkelon)

#### Before (❌ Wrong)
```json
// Google request: NO locationBias (or wrong bias from userLocation in Tel Aviv)
{
  "textQuery": "בתי קפה אשקלון",
  "regionCode": "IL"
  // NO locationBias field
}

// Ranking distance: From Tel Aviv (user's device)
{
  "distanceMeters": 25000,  // 25km+ from Tel Aviv to Ashkelon
  "distanceSource": "userLocation"
}
```

#### After (✅ Correct)
```json
// Google request: WITH locationBias to Ashkelon center
{
  "textQuery": "בתי קפה אשקלון",
  "regionCode": "IL",
  "locationBias": {
    "circle": {
      "center": { "latitude": 31.669, "longitude": 34.571 },
      "radius": 10000
    }
  }
}

// Ranking distance: From Ashkelon city center
{
  "distanceMeters": 800,  // 0.8km from city center
  "distanceSource": "cityCenter",
  "anchorLat": 31.669,
  "anchorLng": 34.571
}
```

### Query: "מסעדות איטלקיות בגדרה" (Italian restaurants in Gedera)

#### Before (❌ Wrong)
```json
// Ranking: Wrong anchor
{
  "distanceMeters": 30000,  // From user location
  "hadUserLocation": true
}
```

#### After (✅ Correct)
```json
// City center resolved
{
  "event": "city_center_resolved",
  "cityText": "גדרה",
  "lat": 31.810,
  "lng": 34.777,
  "servedFromCache": false
}

// Bias applied
{
  "event": "google_textsearch_bias_applied",
  "biasType": "cityCenter",
  "lat": 31.810,
  "lng": 34.777,
  "radiusMeters": 10000
}

// Ranking: Correct anchor
{
  "event": "ranking_distance_source",
  "source": "cityCenter",
  "hadUserLocation": true,  // User has GPS but we prefer cityCenter
  "hasCityText": true,
  "anchorLat": 31.810,
  "anchorLng": 34.777
}

// Results
{
  "distanceMeters": 450,  // 0.45km from Gedera center
  "rating": 4.5
}
```

## New Logging Events

### 1. `city_center_resolved`
```json
{
  "requestId": "req-xxx",
  "event": "city_center_resolved",
  "cityText": "אשקלון",
  "lat": 31.669,
  "lng": 34.571,
  "servedFromCache": true,
  "radiusMeters": 10000,
  "hadOriginalBias": false,
  "biasSource": "cityCenter"
}
```

### 2. `google_textsearch_bias_applied`
```json
{
  "requestId": "req-xxx",
  "event": "google_textsearch_bias_applied",
  "biasType": "cityCenter",
  "lat": 31.669,
  "lng": 34.571,
  "radiusMeters": 10000
}
```

### 3. `ranking_distance_source`
```json
{
  "requestId": "req-xxx",
  "event": "ranking_distance_source",
  "source": "cityCenter",
  "hadUserLocation": false,
  "hasCityText": true,
  "anchorLat": 31.810,
  "anchorLng": 34.777
}
```

## Code Changes Summary

### 1. `text-search.handler.ts`
- ✅ Added in-memory cache for city geocoding (1 hour TTL)
- ✅ Check cache before calling Geocoding API
- ✅ Store `cityCenter` in enrichedMapping
- ✅ Log `city_center_resolved` with cache status
- ✅ Log `google_textsearch_bias_applied` when bias is actually sent to Google

### 2. `schemas.ts`
- ✅ Added `cityCenter` field to `TextSearchMappingSchema`

### 3. `orchestrator.ranking.ts`
- ✅ Accept `cityCenter` parameter
- ✅ Prioritize cityCenter over userLocation for distance anchor
- ✅ Log `ranking_distance_source` with source and coordinates

### 4. `route2.orchestrator.ts`
- ✅ Extract `cityCenter` from mapping
- ✅ Pass `cityCenter` to `applyRankingIfEnabled`

## Acceptance Tests

### Test 1: "בתי קפה באשקלון"

**Expected Results**:
1. ✅ Logs show `city_center_resolved` with Ashkelon coordinates
2. ✅ Logs show `google_textsearch_bias_applied` with `biasType: "cityCenter"`
3. ✅ Google request includes `locationBias` field
4. ✅ Ranking shows `ranking_distance_source` with `source: "cityCenter"`
5. ✅ Top results have `distanceMeters: 0-5000` (not 25,000+)

### Test 2: "מסעדות איטלקיות בגדרה"

**Expected Results**:
1. ✅ City center geocoded (or served from cache): lat=31.810, lng=34.777
2. ✅ Google request includes bias to Gedera center (10km radius)
3. ✅ Ranking computes distance from Gedera center (not Tel Aviv userLocation)
4. ✅ Top results have small distances (~300-3000m typical)

### Test 3: Cache Hit

**Expected Results**:
1. ✅ First search: `servedFromCache: false` (API call)
2. ✅ Second search (same city, < 1 hour): `servedFromCache: true` (no API call)
3. ✅ After 1 hour: `servedFromCache: false` (cache expired, re-geocode)

## Performance Impact

- **Cache hit**: 0ms (instant)
- **Cache miss**: ~200-500ms (geocoding API call)
- **Cache TTL**: 1 hour (configurable via `CITY_GEOCODE_CACHE_TTL_MS`)
- **Memory footprint**: ~50 bytes per cached city (negligible)

## Backward Compatibility

- ✅ Queries without cityText: unchanged behavior (use userLocation if available)
- ✅ Queries with userLocation but no cityText: unchanged (use userLocation)
- ✅ Priority: cityCenter > userLocation (explicit city takes precedence)

## Future Enhancements

1. **Redis cache**: Move cache to Redis for multi-instance consistency
2. **Configurable TTL**: Make TTL configurable via env var
3. **Preload popular cities**: Warm cache on server startup
4. **Fallback to approximate center**: Use bounding box center if geocoding fails
