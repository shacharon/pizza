# Backend Architecture - High-Level Flow

## Overview

The backend uses a **multi-stage LLM pipeline (Route2)** to process search queries and return restaurant results. It supports both **sync** and **async** execution modes.

---

## Request Modes

### **Sync Mode** (Default)
- Client waits for full response
- Returns complete results in HTTP response body
- Use for: Quick searches, testing

### **Async Mode** (`?mode=async`)
- Returns `202 Accepted` immediately with `requestId`
- Pipeline runs in background
- Progress updates via **WebSocket**
- Final results via `GET /api/v1/search/:requestId/result`
- Use for: Production, long-running searches

---

## Pipeline Stages (Route2)

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST /api/v1/search                          │
│                    (?mode=sync|async)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 0: Request Validation & Job Creation                    │
│  ────────────────────────────────────────────────────────────   │
│  • Validate request body (query, sessionId, userLocation?)     │
│  • Generate requestId                                          │
│  • Create job in JobStore (Redis or InMemory)                 │
│  • Fork: Sync → Block / Async → Return 202                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1: GATE2 (Food Signal Detection)                        │
│  ────────────────────────────────────────────────────────────   │
│  LLM: GPT-4o-mini                                              │
│  Input: User query                                             │
│  Output: { foodSignal: "YES"|"NO"|"UNCERTAIN", confidence }   │
│  ────────────────────────────────────────────────────────────   │
│  Decision:                                                      │
│  • foodSignal = "NO" → FAIL (not food-related)                │
│  • foodSignal = "YES" → Continue to Intent                    │
│  • foodSignal = "UNCERTAIN" → Continue with lower confidence  │
│                                                                 │
│  Timeout: 2500ms                                               │
│  Cache: None                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2: INTENT (Route Selection)                             │
│  ────────────────────────────────────────────────────────────   │
│  LLM: GPT-4o-mini                                              │
│  Input: User query                                             │
│  Output: {                                                     │
│    route: "NEARBY"|"TEXTSEARCH"|"LANDMARK",                   │
│    language: "he"|"en"|"ru"|...,                              │
│    region: "IL"|"US"|...,                                     │
│    confidence: 0-1,                                           │
│    reason: "explanation"                                      │
│  }                                                             │
│  ────────────────────────────────────────────────────────────   │
│  Routes:                                                        │
│  • NEARBY: "near me", "close by" → uses userLocation          │
│  • TEXTSEARCH: "pizza in Tel Aviv" → broad text search        │
│  • LANDMARK: "near Dizengoff Center" → geocode then search    │
│                                                                 │
│  Timeout: 1500ms                                               │
│  Cache: None                                                   │
│  ────────────────────────────────────────────────────────────   │
│  Edge Case: NEARBY + no userLocation → fallback to TEXTSEARCH │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3: BASE FILTERS (LLM)                                   │
│  ────────────────────────────────────────────────────────────   │
│  LLM: GPT-4o-mini                                              │
│  Input: User query                                             │
│  Output: {                                                     │
│    cuisine: "italian"|null,                                   │
│    dietary: ["vegan", "kosher"],                              │
│    openState: "OPEN_NOW"|null,                                │
│    priceRange: "$$"|null,                                     │
│    ...50+ filter fields                                       │
│  }                                                             │
│  ────────────────────────────────────────────────────────────   │
│  Applied:                                                       │
│  • Pre-Google: includedTypes (e.g., "italian_restaurant")     │
│  • Post-Google: openNow, rating, accessibility, etc.          │
│                                                                 │
│  Timeout: 4000ms                                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 4: ROUTE-LLM (Mapper)                                   │
│  ────────────────────────────────────────────────────────────   │
│  Dispatcher: Based on intent.route                             │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ NEARBY Mapper   │  │TEXTSEARCH Mapper│  │ LANDMARK Mapper ││
│  │ ──────────────  │  │ ──────────────  │  │ ──────────────  ││
│  │ Output:         │  │ Output:         │  │ Output:         ││
│  │ • location      │  │ • textQuery     │  │ • geocodeQuery  ││
│  │ • radiusMeters  │  │ • region        │  │ • afterGeocode  ││
│  │ • keyword       │  │ • language      │  │ • radiusMeters  ││
│  │ • region        │  │ • (no bias)     │  │ • keyword       ││
│  │ • language      │  │                 │  │ • region        ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
│                                                                 │
│  LLM: GPT-4o-mini                                              │
│  Timeout: 3500-4500ms (varies by mapper)                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 5: GOOGLE MAPS API                                      │
│  ────────────────────────────────────────────────────────────   │
│  Provider: Google Places API (New)                             │
│  Methods:                                                       │
│  • textSearch: General text-based search                       │
│  • nearbySearch: Location + radius + keyword                   │
│  • geocode + search: Two-phase (for landmarks)                 │
│  ────────────────────────────────────────────────────────────   │
│  Caching: Multi-tier                                           │
│  • L0: In-flight deduplication                                 │
│  • L1: In-memory (60s, max 500 entries)                        │
│  • L2: Redis (15 min default, 2 min for "open now" queries)   │
│  ────────────────────────────────────────────────────────────   │
│  Retry Logic:                                                   │
│  • If results.length <= 1 and bias exists → retry without bias │
│  ────────────────────────────────────────────────────────────   │
│  Output: Array of Google Place objects with:                   │
│  • id, displayName, formattedAddress                           │
│  • location (lat/lng)                                          │
│  • rating, userRatingCount                                     │
│  • currentOpeningHours, regularOpeningHours                    │
│  • types, primaryType                                          │
│  • photos, websiteUri, internationalPhoneNumber                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 6: POST-FILTERS (Deterministic)                         │
│  ────────────────────────────────────────────────────────────   │
│  Applied Filters (from Base Filters):                          │
│  • openState: OPEN_NOW, OPEN_TODAY, OPEN_TOMORROW              │
│  • openAt: ISO timestamp (is open at specific time?)           │
│  • openBetween: { start, end } (is open in time range?)        │
│  ────────────────────────────────────────────────────────────   │
│  Logic:                                                         │
│  • For each place, check currentOpeningHours.openNow           │
│  • If openingHours = UNKNOWN → keep by default (no removal)    │
│  • Track: before/after counts, unknownExcluded count           │
│  ────────────────────────────────────────────────────────────   │
│  Performance: ~1-5ms for 20 results                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 7: RESPONSE BUILD                                       │
│  ────────────────────────────────────────────────────────────   │
│  Convert Google Places → Frontend DTO:                         │
│  • Map fields to SearchResult schema                           │
│  • Add metadata: intentUsed, source, failureReason             │
│  • Wrap in { success, results[], metadata }                    │
│  ────────────────────────────────────────────────────────────   │
│  Performance: ~2-10ms for 20 results                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 8: JOBSTORE WRITE + WEBSOCKET PUBLISH                   │
│  ────────────────────────────────────────────────────────────   │
│  JobStore Operations:                                           │
│  • setStatus(requestId, "DONE_SUCCESS")                        │
│  • setResult(requestId, response)                              │
│  ────────────────────────────────────────────────────────────   │
│  WebSocket Publish (Async mode only):                          │
│  • Channel: "search"                                           │
│  • Type: "results"                                             │
│  • Backlog: Messages queued if client not yet subscribed       │
│  • TTL: 2 minutes                                              │
│  ────────────────────────────────────────────────────────────   │
│  Sync Mode: Skip WebSocket, return response directly           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
                 ┌───────┴───────┐
                 │               │
          [Sync Mode]      [Async Mode]
                 │               │
                 ▼               ▼
        ┌────────────┐   ┌──────────────┐
        │ HTTP 200   │   │ WS: results  │
        │ + results  │   │ Client polls │
        │            │   │ GET /result  │
        └────────────┘   └──────────────┘
```

---

## Assistant Messages (Optional, Disabled by Default)

When `ASSISTANT_MODE=ON`:

```
Every stage can publish assistant messages via WebSocket:

┌─────────────────────────────────────────┐
│  Assistant Message Flow                 │
│  ────────────────────────────────────   │
│  Stage → AssistantLLMRewriter           │
│         → (translate + tone adjust)     │
│         → WebSocket publish             │
│         → Client receives friendly msg  │
└─────────────────────────────────────────┘

Example messages:
• "מחפש מסעדות..." (Searching restaurants...)
• "מצאתי 15 תוצאות" (Found 15 results)
• "מסנן לפי פתוח עכשיו" (Filtering by open now)
```

**Default**: `ASSISTANT_MODE=OFF` (messages not sent)

---

## Timing & Performance

### Typical Sync Request (no cache)
```
├─ GATE2:          ~800ms   (LLM)
├─ INTENT:         ~600ms   (LLM)
├─ BASE_FILTERS:   ~1200ms  (LLM)
├─ ROUTE_LLM:      ~1500ms  (LLM - mapper)
├─ GOOGLE_MAPS:    ~400ms   (API call)
├─ POST_FILTER:    ~3ms     (deterministic)
├─ RESPONSE_BUILD: ~5ms     (mapping)
├─ JOBSTORE:       ~2ms     (write)
└─ TOTAL:          ~4500ms  ⚡

Unaccounted time: ~100-200ms (framework overhead, logging)
```

### With L2 Cache Hit (Google API cached)
```
├─ GATE2:          ~800ms   (LLM)
├─ INTENT:         ~600ms   (LLM)
├─ BASE_FILTERS:   ~1200ms  (LLM)
├─ ROUTE_LLM:      ~1500ms  (LLM)
├─ GOOGLE_MAPS:    ~5ms     (Redis cache hit)
├─ POST_FILTER:    ~3ms
├─ RESPONSE_BUILD: ~5ms
└─ TOTAL:          ~4100ms  ⚡⚡
```

### Async Mode (User Experience)
```
┌──────────────────────────────────────────┐
│ T=0ms:    POST → 202 Accepted            │
│ T=50ms:   WS connected & subscribed      │
│ T=800ms:  WS: "Analyzing query..."       │
│ T=2200ms: WS: "Searching restaurants..." │
│ T=4500ms: WS: Final results received     │
│ T=4502ms: GET /result → 200 + results    │
└──────────────────────────────────────────┘

User sees progress in real-time, feels faster!
```

---

## Error Handling

### Stage Failures
```
Any stage can fail → Pipeline stops → Error response

Common failures:
• GATE2: LLM timeout → DONE_FAILED (errorType: "GATE_ERROR")
• INTENT: LLM timeout → fallback to TEXTSEARCH
• GOOGLE_MAPS: API error → DONE_FAILED (errorType: "SEARCH_FAILED")
• No userLocation for NEARBY → fallback to TEXTSEARCH
```

### LLM Retry Logic
```
All LLM calls have:
• Timeout: 1500-4500ms (varies by stage)
• Retries: 3 attempts
• Backoff: [0ms, 500ms, 1500ms]
• Retry on: 429, 5xx, network errors
• Fail fast on: 400, 401, schema errors
```

### Graceful Degradation
```
• Redis down → L1 cache only (no crash)
• JobStore Redis down → InMemory fallback
• Google cache error → direct API call
• Assistant rewriter fails → raw message used
```

---

## Data Stores

### JobStore
```
Purpose: Track async job status/results
Implementations:
• RedisJobStore (prod): Persistent, survives restarts
• InMemoryJobStore (dev): Fast, lost on restart

Storage:
• Key: search:job:{requestId}
• TTL: 24 hours
• Fields: status, progress, result, error
```

### Google Cache (Redis)
```
Purpose: Reduce Google API costs, improve latency
Tiers:
• L0: In-flight (Map) - dedup concurrent identical requests
• L1: In-memory (Map) - 60s TTL, max 500 entries, FIFO eviction
• L2: Redis - 15 min default, 2 min for "open now" queries

Key format: g:search:{md5(category+lat+lng+radius+region+lang)}
```

### WebSocket Backlog
```
Purpose: Queue messages sent before client subscribes
Storage: In-memory Map
Key: {channel}|{requestId}
TTL: 2 minutes
Max items: 50 per backlog (FIFO)

Behavior:
• Publish before subscribe → enqueue
• Client subscribes → drain all messages in order
```

---

## Configuration

### Environment Variables

```bash
# LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
LLM_JSON_TIMEOUT_MS=5000

# Google
GOOGLE_API_KEY=AIza...

# Redis
REDIS_URL=redis://localhost:6379
ENABLE_REDIS_JOBSTORE=true
ENABLE_REDIS_CACHE=true

# Cache
GOOGLE_CACHE_TTL_SECONDS=900
REDIS_CACHE_PREFIX=cache:

# Assistant (optional)
ASSISTANT_MODE=OFF

# Pipeline
ROUTE2_ENABLED=true
```

---

## Observability

### Structured Logs (JSON)
```json
{
  "event": "pipeline_completed",
  "requestId": "req-1234",
  "pipelineVersion": "route2",
  "durationMs": 4521,
  "queueDelayMs": 0,
  "resultCount": 15,
  "durations": {
    "gate2Ms": 789,
    "intentMs": 612,
    "routeLLMMs": 1523,
    "baseFiltersMs": 1234,
    "googleMapsMs": 412,
    "postFilterMs": 3,
    "responseBuildMs": 5
  },
  "durationsSumMs": 4578,
  "unaccountedMs": -57
}
```

### Key Events
- `pipeline_selected` - Pipeline starts
- `stage_started` - Each stage begins
- `stage_completed` - Each stage ends (with durationMs)
- `provider_call` - LLM calls (with tokens, cost)
- `CACHE_HIT` / `CACHE_MISS` - Cache operations
- `pipeline_completed` - Full duration decomposition

---

## Testing

### Manual Test
```bash
# Sync mode
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza near me","sessionId":"test"}'

# Async mode
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"italian in tel aviv","sessionId":"test"}'

# Get result
curl http://localhost:3000/api/v1/search/{requestId}/result
```

### Load Test (k6)
```javascript
import http from 'k6/http';

export default function() {
  http.post('http://localhost:3000/api/v1/search?mode=async', 
    JSON.stringify({
      query: 'sushi in haifa',
      sessionId: `test-${__VU}-${__ITER}`
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
```

---

## Architecture Principles

1. **Fail Fast**: LLM timeouts stop pipeline, return error
2. **Graceful Degradation**: Cache/Redis failures → fallback, don't crash
3. **Observable**: Every stage logs start/end with duration
4. **Cost Aware**: Cache aggressively, log token usage & cost
5. **Type Safe**: Zod validation on LLM outputs
6. **Async First**: WebSocket + polling for production UX

---

## Future Improvements

- [ ] Add Redis L2 cache for LLM responses (intent, base filters)
- [ ] Implement rate limiting per sessionId
- [ ] Add A/B testing framework for prompts
- [ ] Parallelize independent stages (gate2 + base filters)
- [ ] Add Prometheus metrics
- [ ] Implement circuit breaker for Google API
- [ ] Add request prioritization queue
