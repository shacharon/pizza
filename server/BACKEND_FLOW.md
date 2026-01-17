# Backend Flow: Where the Magic Happens 🎯

**Last Updated:** January 2026  
**Pipeline Version:** ROUTE2

---

## Overview

This document explains the complete backend flow for search requests, from HTTP entry point to final response delivery. The entire system is orchestrated by the **ROUTE2 pipeline**, a clean, modern search architecture.

---

## 🚀 Quick Flow Summary

```
HTTP Request → Controller → Async Job → Route2 Orchestrator
  → GATE2 (Pre-filter)
  → INTENT (Routing)
  → ROUTE_LLM (Mapping)
  → GOOGLE_MAPS (API Call)
  → Response Build
  → WebSocket Notification
  → Client Receives Results ✨
```

---

## 📍 Entry Point

### `search.controller.ts` (POST /api/v1/search)

**Location:** `server/src/controllers/search/search.controller.ts`

**What it does:**
1. Validates incoming search request
2. Creates LLM provider instance
3. Launches async job (detached from HTTP lifecycle)
4. Returns `202 Accepted` immediately
5. Client subscribes to WebSocket for results

**Key Code:**
```typescript
// Line 33-100: Async job launcher
async function runAsyncSearch(params: {
  requestId: string;
  query: SearchRequest;
  resultUrl: string;
  llmProvider: any;
  userLocation: { lat: number; lng: number } | null;
  traceId?: string;
  sessionId?: string;
}): Promise<void>

// Line 67: THE MAIN CALL
const response = await searchRoute2(query, detachedContext);
```

**Why Async?**
- Prevents timeout on slow searches
- Client doesn't wait for HTTP response
- Results delivered via WebSocket
- Better UX (progressive updates possible)

---

## 🧠 The Brain: Route2 Orchestrator

### `route2.orchestrator.ts` - **THE MAIN BRAIN**

**Location:** `server/src/services/search/route2/route2.orchestrator.ts`

**This is where ALL the magic happens!** 🎩✨

The orchestrator coordinates 4 sequential stages, handles errors, manages context, and builds the final response.

### Main Function: `searchRoute2()`

**Signature:**
```typescript
export async function searchRoute2(
  request: SearchRequest,
  ctx: Route2Context
): Promise<SearchResponse>
```

**Location:** Lines 32-271

---

## 🔄 The 4-Stage Pipeline

### Stage 1: GATE2 🚪

**File:** `stages/gate2.stage.ts`  
**Function:** `executeGate2Stage()`  
**Purpose:** Pre-filter and classify the query

**What it does:**
1. Sends query to LLM (2.5s timeout, 1 retry)
2. Extracts:
   - `foodSignal` (is this a food query?)
   - `language` (he/en/ru/ar/fr/es/other)
   - `region` (IL/US/FR/etc.)
   - `confidence` (0-1)
3. Makes decision: **STOP** | **CLARIFY** | **CONTINUE**

**Decision Logic:**
```typescript
// STOP: Not a food query
if (!gateResult.gate.foodSignal) {
  return emptyResponse("Not a food-related query");
}

// CLARIFY: Low confidence
if (gateResult.gate.confidence < 0.6) {
  return clarificationResponse("Please be more specific");
}

// CONTINUE: Proceed to next stage
```

**Examples:**
- ✅ "pizza in tel aviv" → CONTINUE (foodSignal: true, confidence: 0.95)
- ❌ "weather today" → STOP (foodSignal: false)
- ⚠️ "something unclear" → CLARIFY (confidence: 0.3)

**LLM Prompt:** Lines 47-90 (Gate2 System Prompt)

---

### Stage 2: INTENT 🧭

**File:** `stages/intent/intent.stage.ts`  
**Function:** `executeIntentStage()`  
**Purpose:** Determine the search strategy/route

**What it does:**
1. Analyzes query structure
2. Determines which route to take
3. Returns route decision with confidence

**Three Routes:**

| Route | Trigger | Example | Strategy |
|-------|---------|---------|----------|
| **TEXTSEARCH** | Has location text | "pizza in tel aviv" | Text-based search |
| **NEARBY** | Proximity query | "pizza near me" | Radius search from GPS |
| **LANDMARK** | Landmark reference | "pizza at azrieli" | Geocode → Search |

**Output:**
```typescript
interface IntentResult {
  route: 'TEXTSEARCH' | 'NEARBY' | 'LANDMARK';
  region: string;        // e.g., "IL"
  language: string;      // e.g., "he"
  confidence: number;    // 0-1
  reason: string;        // Debug token
}
```

**Location:** Lines 46-131

---

### Stage 3: ROUTE_LLM 🤖

**File:** `stages/route-llm/route-llm.dispatcher.ts`  
**Function:** `executeRouteLLM()`  
**Purpose:** Convert intent → Google API parameters

**What it does:**
1. Dispatches to route-specific mapper based on intent
2. LLM converts natural language → structured params
3. Returns exact parameters for Google Places API

**Mapper Dispatch:**
```typescript
switch (intent.route) {
  case 'TEXTSEARCH':
    return await executeTextSearchMapper(intent, request, context);
  
  case 'NEARBY':
    return await executeNearbyMapper(intent, request, context);
  
  case 'LANDMARK':
    return await executeLandmarkMapper(intent, request, context);
}
```

#### 3a. TextSearch Mapper

**File:** `stages/route-llm/textsearch.mapper.ts`  
**Purpose:** Build text search parameters

**Input:** "pizza in tel aviv"  
**Output:**
```typescript
{
  providerMethod: 'textSearch',
  textQuery: 'pizza restaurant tel aviv',
  region: 'IL',
  language: 'he',
  bias: null,  // or { center, radiusMeters }
  reason: 'place_type_preserved'
}
```

**Key Features:**
- Preserves language (no translation)
- Removes filler words ("תמצא לי", "please", etc.)
- Adds place-type if needed ("מסעדה", "restaurant")
- Cleans query for optimal Google results

**LLM Prompt:** Lines 18-68

#### 3b. Nearby Mapper

**File:** `stages/route-llm/nearby.mapper.ts`  
**Purpose:** Build proximity search parameters

**Input:** "pizza near me" (with GPS coords)  
**Output:**
```typescript
{
  providerMethod: 'nearbySearch',
  location: { lat: 32.0853, lng: 34.7818 },
  radiusMeters: 500,
  keyword: 'pizza',
  region: 'IL',
  language: 'he',
  reason: 'distance_default'
}
```

**Key Features:**
- Extracts explicit distance ("200 מטר", "500m")
- Defaults to 500m if not specified
- Extracts food keyword
- Requires GPS coordinates (fails if missing)

**LLM Prompt:** Lines 18-49

#### 3c. Landmark Mapper

**File:** `stages/route-llm/landmark.mapper.ts`  
**Purpose:** Plan two-phase search (geocode + search)

**Input:** "pizza at azrieli center"  
**Output:**
```typescript
{
  providerMethod: 'landmarkPlan',
  geocodeQuery: 'Azrieli Center Tel Aviv',
  afterGeocode: 'nearbySearch',  // or 'textSearchWithBias'
  radiusMeters: 800,
  keyword: 'pizza',
  region: 'IL',
  language: 'he',
  reason: 'poi_landmark'
}
```

**Key Features:**
- Full landmark name for geocoding
- Chooses search strategy after geocoding
- Radius based on landmark type (500-2000m)

**LLM Prompt:** Lines 18-60

---

### Stage 4: GOOGLE_MAPS 🗺️

**File:** `stages/google-maps.stage.ts` ⭐ **NEWLY MIGRATED TO PLACES API (NEW)**  
**Function:** `executeGoogleMapsStage()`  
**Purpose:** Execute actual Google Places API calls

**What it does:**
1. Dispatches to appropriate search method
2. Builds request body (New API format)
3. Calls Google Places API (New)
4. Maps response to internal format
5. Handles pagination (no delay needed!)
6. Returns normalized results

**Three Search Methods:**

#### 4a. Text Search

**Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`

**Request:**
```json
{
  "textQuery": "pizza restaurant tel aviv",
  "languageCode": "he",
  "regionCode": "IL",
  "includedType": "restaurant",
  "locationBias": {
    "circle": {
      "center": {"latitude": 32.0853, "longitude": 34.7818},
      "radius": 1000
    }
  }
}
```

**Headers:**
```
X-Goog-Api-Key: {GOOGLE_API_KEY}
X-Goog-FieldMask: places.id,places.displayName,...
Content-Type: application/json
```

**Code:** Lines 115-203

#### 4b. Nearby Search

**Endpoint:** `POST https://places.googleapis.com/v1/places:searchNearby`

**Request:**
```json
{
  "locationRestriction": {
    "circle": {
      "center": {"latitude": 32.0853, "longitude": 34.7818},
      "radius": 500
    }
  },
  "languageCode": "he",
  "regionCode": "IL",
  "includedType": "restaurant",
  "rankPreference": "DISTANCE"
}
```

**Code:** Lines 469-565

#### 4c. Landmark Plan (Two-Phase)

**Phase 1: Geocode**
- Uses legacy Geocoding API
- Converts landmark → coordinates

**Phase 2: Search**
- Uses `searchNearby` or `searchText` with bias
- Based on landmark type

**Code:** Lines 577-688

---

### Response Mapping

**Function:** `mapGooglePlaceToResult()` (Lines 399-453)

**Transforms:**
```typescript
// Google Places API (New) format:
{
  id: "places/ChIJ...",
  displayName: { text: "Pizza Place" },
  location: { latitude: 32.0853, longitude: 34.7818 },
  userRatingCount: 120,
  priceLevel: "PRICE_LEVEL_MODERATE",
  currentOpeningHours: { openNow: true },
  photos: [{ name: "places/.../photos/..." }]
}

// ↓ Maps to ↓

// Internal RestaurantResult format:
{
  id: "ChIJ...",
  placeId: "ChIJ...",
  source: "google_places",
  name: "Pizza Place",
  location: { lat: 32.0853, lng: 34.7818 },
  userRatingsTotal: 120,
  priceLevel: 2,  // Converted from enum
  openNow: true,
  photoUrl: "https://places.googleapis.com/v1/.../media?...",
  photos: ["https://places.googleapis.com/v1/.../media?..."]
}
```

**Key Transformations:**
- Resource name → Simple ID
- `displayName.text` → `name`
- `location.latitude/longitude` → `location.lat/lng`
- `userRatingCount` → `userRatingsTotal`
- `PRICE_LEVEL_*` enum → 0-4 integer
- `currentOpeningHours.openNow` → `openNow`
- Photo resource names → Full URLs

---

### Stage 5: Build Response 📦

**Location:** `route2.orchestrator.ts` Lines 195-256

**What it does:**
1. Constructs `SearchResponse` DTO
2. Adds metadata (timing, confidence, source)
3. Creates assist payload
4. Generates refinement chips (empty for now)
5. Logs completion
6. Publishes WebSocket event

**Response Structure:**
```typescript
{
  requestId: "uuid",
  sessionId: "session-id",
  query: {
    original: "pizza in tel aviv",
    parsed: { /* structured intent */ },
    language: "he"
  },
  results: [/* RestaurantResult[] */],
  chips: [/* RefinementChip[] */],
  assist: {
    type: 'guide',
    message: ''
  },
  meta: {
    tookMs: 1250,
    mode: 'textsearch',
    confidence: 0.95,
    source: 'route2',
    failureReason: 'NONE'
  }
}
```

---

## 📊 Complete Example Flow

### Query: "pizza in tel aviv"

```typescript
// 1. HTTP Request
POST /api/v1/search
Body: {
  query: "pizza in tel aviv",
  userLocation: null,
  sessionId: "abc123"
}

// 2. Controller (search.controller.ts)
→ Creates requestId: "req-xyz"
→ Validates request
→ Returns 202 Accepted { requestId, resultUrl }
→ Launches async job

// 3. Async Job → Route2 Orchestrator
→ Calls searchRoute2(request, context)

// 4. Stage 1: GATE2
LLM Input: "pizza in tel aviv"
LLM Output: {
  foodSignal: true,
  language: "en",
  region: "IL",
  confidence: 0.95,
  decision: "CONTINUE"
}
→ Decision: CONTINUE ✅

// 5. Stage 2: INTENT
Analysis: "pizza in tel aviv"
→ Has location text ("tel aviv")
→ No proximity words ("near me")
→ No landmark pattern
Output: {
  route: "TEXTSEARCH",
  region: "IL",
  language: "en",
  confidence: 0.92
}

// 6. Stage 3: ROUTE_LLM (TextSearch Mapper)
LLM Input: 
  Query: "pizza in tel aviv"
  Region: IL
  Language: en

LLM Output: {
  providerMethod: "textSearch",
  textQuery: "pizza restaurant tel aviv",
  region: "IL",
  language: "en",
  bias: null,
  reason: "place_type_preserved"
}

// 7. Stage 4: GOOGLE_MAPS
→ Builds request body
→ POST https://places.googleapis.com/v1/places:searchText
Headers:
  X-Goog-Api-Key: {key}
  X-Goog-FieldMask: places.id,places.displayName,...
Body: {
  textQuery: "pizza restaurant tel aviv",
  languageCode: "en",
  regionCode: "IL",
  includedType: "restaurant"
}

Google Response: {
  places: [
    {
      id: "places/ChIJ...",
      displayName: { text: "Pizza Hut" },
      location: { latitude: 32.0853, longitude: 34.7818 },
      rating: 4.2,
      userRatingCount: 150,
      priceLevel: "PRICE_LEVEL_MODERATE",
      currentOpeningHours: { openNow: true },
      photos: [{ name: "places/.../photos/..." }]
    },
    // ... 19 more results
  ]
}

→ Maps to internal format
→ Returns 20 RestaurantResult objects

// 8. Build Response
→ Constructs SearchResponse
→ Total time: 1,250ms
→ Result count: 20

// 9. WebSocket Notification
→ Publishes to channel 'search'
→ Event: { type: 'ready', requestId, resultUrl, resultCount: 20 }

// 10. Client Receives
→ Frontend fetches GET /search/{requestId}/result
→ Displays 20 pizza restaurants
→ User is happy! 🍕✨
```

---

## 🎯 Key Files Reference

| File | Role | Key Functions | Lines |
|------|------|---------------|-------|
| **`route2.orchestrator.ts`** | 🧠 **Main Brain** | `searchRoute2()` | 32-271 |
| `search.controller.ts` | Entry point | `runAsyncSearch()` | 33-100 |
| `gate2.stage.ts` | Pre-filter | `executeGate2Stage()` | 118-288 |
| `intent.stage.ts` | Router | `executeIntentStage()` | 46-131 |
| `textsearch.mapper.ts` | Text search mapper | `executeTextSearchMapper()` | 82-190 |
| `nearby.mapper.ts` | Nearby mapper | `executeNearbyMapper()` | 66-236 |
| `landmark.mapper.ts` | Landmark mapper | `executeLandmarkMapper()` | 74-152 |
| **`google-maps.stage.ts`** | 🗺️ **API Caller** | `executeGoogleMapsStage()` | 28-106 |
| | | `executeTextSearch()` | 115-203 |
| | | `executeNearbySearch()` | 469-565 |
| | | `executeLandmarkPlan()` | 577-688 |
| | | `mapGooglePlaceToResult()` | 399-453 |

---

## 🔍 Architecture Patterns

### 1. **Stage Pattern**
Each stage:
- Has clear input/output types
- Logs start/completion
- Handles errors independently
- Returns typed result

### 2. **Discriminated Unions**
```typescript
type RouteLLMMapping = 
  | { providerMethod: 'textSearch', textQuery: string, ... }
  | { providerMethod: 'nearbySearch', location: Coords, ... }
  | { providerMethod: 'landmarkPlan', geocodeQuery: string, ... }
```

Enables type-safe pattern matching!

### 3. **Context Passing**
```typescript
interface Route2Context {
  requestId: string;
  traceId?: string;
  sessionId?: string;
  startTime: number;
  llmProvider: LLMProvider;
  userLocation: Coords | null;
  userRegionCode?: string;
}
```

Passed through entire pipeline, enriched at each stage.

### 4. **Retry with Fallback**
LLM calls include:
- Initial attempt (2.5s timeout)
- 1 retry on timeout (150-250ms backoff)
- Fallback logic if both fail

### 5. **Structured Logging**
Every stage logs:
```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  stage: 'gate2',
  event: 'stage_started',
  // ... contextual data
}, '[ROUTE2] gate2 started');
```

Perfect for debugging in production!

---

## 💡 The "Magic" Explained

The system's power comes from **3 key transformations**:

### 1. Natural Language → Structured Intent
```
"pizza near me" → { route: 'NEARBY', radius: 500, keyword: 'pizza' }
```
**Done by:** GATE2 + INTENT + ROUTE_LLM stages

### 2. Structured Intent → API Parameters
```
{ route: 'NEARBY', ... } → Google Places API request body
```
**Done by:** Route-specific mappers (textsearch/nearby/landmark)

### 3. API Response → Clean DTOs
```
Google Places format → RestaurantResult[]
```
**Done by:** `mapGooglePlaceToResult()` function

All coordinated by **`route2.orchestrator.ts`** - the maestro! 🎼

---

## 🚦 Error Handling

### Gate2 Timeout
- Initial attempt: 2.5s
- Retry once: 150-250ms backoff
- Fallback: Return CONTINUE with low confidence

### LLM Failures
- All mappers have fallbacks
- Nearby mapper: Rule-based extraction
- Structured logging for debugging

### Google API Errors
- HTTP errors thrown immediately
- Empty results handled gracefully
- Pagination errors stop gracefully

### Pipeline Errors
- Caught at orchestrator level
- Logged with full context
- WebSocket error notification sent
- Job marked as FAILED

---

## 🔧 Configuration

### Feature Flags
```typescript
// config/route2.flags.ts
export const ROUTE2_ENABLED = process.env.ROUTE2_ENABLED !== 'false';
```

### Environment Variables
```env
GOOGLE_API_KEY=AIza...         # Required: Google Places API key
OPENAI_API_KEY=sk-...          # Required: LLM for mappers
ROUTE2_ENABLED=true            # Optional: Enable/disable pipeline
```

### Timeouts
- Gate2 LLM: 2.5s (+ 1 retry)
- Intent LLM: 3.5s (+ 1 retry)
- TextSearch Mapper: 3.5s (no retry)
- Nearby Mapper: 4.5s (+ 1 retry)
- Landmark Mapper: 4.0s (no retry)
- Google API: 30s (per request)
- Total Pipeline: 30s (async job timeout)

---

## 📈 Performance Characteristics

**Typical Timings:**
- Gate2: 50-150ms
- Intent: 80-200ms
- Route_LLM: 100-300ms
- Google Maps: 300-800ms
- **Total: 600-1500ms** ⚡

**Optimization Points:**
- LLM calls are parallelizable (not currently done)
- Google pagination is now immediate (no 2s delay)
- Field masking reduces response size
- Structured logging is async

---

## 🧪 Testing

### Manual Testing Flow
```bash
# 1. Start server
cd server && npm run dev

# 2. Send request
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza in tel aviv"}'

# 3. Watch logs
tail -f server/logs/server.log | grep ROUTE2

# 4. Fetch results
curl http://localhost:3000/api/v1/search/{requestId}/result
```

### Log Patterns to Look For
```
[ROUTE2] Pipeline selected
[ROUTE2] gate2 started
[ROUTE2] gate2 completed
[ROUTE2] Proceeding to intent
[ROUTE2] Intent routing decided
[ROUTE2] Route-LLM mapping completed
[GOOGLE] Calling Text Search API (New)
[GOOGLE] Text Search completed
[ROUTE2] Pipeline completed
```

---

## 📚 Related Documentation

- [MIGRATION.md](MIGRATION.md) - Google Places API migration details
- [route2/README.md](services/search/route2/README.md) - Pipeline overview
- [search.contracts.ts](contracts/search.contracts.ts) - API contracts

---

## 🤝 Contributing

When modifying the pipeline:

1. **Keep stages independent** - Each stage should be testable in isolation
2. **Maintain type safety** - Use discriminated unions
3. **Log everything** - Structured logs with `requestId`
4. **Handle errors gracefully** - Never crash the pipeline
5. **Update this doc** - Keep the flow diagram current!

---

**Happy Coding! 🚀**

*This document was last updated after the Google Places API (New) migration in January 2026.*
