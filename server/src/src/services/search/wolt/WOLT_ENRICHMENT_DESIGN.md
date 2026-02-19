# Wolt Link Enrichment - Design & Implementation Guide

## Overview

Add Wolt restaurant link enrichment to search results using Redis cache + WebSocket patch events.

**Key Constraints:**

- ✅ No database persistence (Redis TTL-based cache only)
- ✅ Non-blocking (initial results returned immediately)
- ✅ WebSocket patches for async updates

---

## 1. Data Contracts

### 1.1 Restaurant DTO Extension

**File:** `server/src/services/search/types/search.types.ts`

```ts
export interface RestaurantResult {
  // ... existing fields

  // External enrichments (async, non-blocking)
  wolt?: {
    status: "FOUND" | "NOT_FOUND" | "PENDING";
    url: string | null;
  };
}
```

**Status Lifecycle:**

- `PENDING`: Cache miss, enrichment job triggered
- `FOUND`: Wolt link found and cached (14d TTL)
- `NOT_FOUND`: No Wolt presence (24h TTL)

---

### 1.2 WebSocket Event Schema

**File:** `server/src/infra/websocket/websocket-protocol.ts`

```ts
export interface WSServerResultPatch {
  type: "RESULT_PATCH";
  requestId: string; // Original search request
  placeId: string; // Restaurant identifier
  patch: {
    wolt?: {
      status: "FOUND" | "NOT_FOUND";
      url: string | null;
    };
  };
}

// Added to WSServerMessage union type ✓
```

**Client Behavior:**

1. Match restaurant by `placeId`
2. Merge `patch.wolt` into `restaurant.wolt`
3. Re-render only affected card (OnPush change detection)

---

### 1.3 Redis Storage Schema

**Namespace:** `ext:wolt:*` (external enrichment, wolt provider)

#### Cache Keys

```ts
// Wolt link cache
ext:wolt:place:<placeId>
Value: { url: string|null, status: 'FOUND'|'NOT_FOUND', updatedAt: ISO }
TTL: 14 days (FOUND) | 24 hours (NOT_FOUND)

// Anti-thrash lock (prevents duplicate parallel jobs)
ext:wolt:lock:<placeId>
Value: '1'
TTL: 60 seconds
```

#### TTL Constants

```ts
export const WOLT_CACHE_TTL_SECONDS = {
  FOUND: 14 * 24 * 60 * 60, // 1,209,600 seconds (14 days)
  NOT_FOUND: 24 * 60 * 60, // 86,400 seconds (24 hours)
  LOCK: 60, // 60 seconds
};
```

**Design Rationale:**

- **FOUND (14d):** Wolt links are stable, rare closures/menu changes
- **NOT_FOUND (24h):** New restaurants may join Wolt frequently
- **LOCK (60s):** Enrichment job timeout, handles crashed workers

---

## 2. Implementation Architecture

### 2.1 Request Flow

```
User Query
    ↓
[Search Orchestrator]
    ↓
Google Places API → RestaurantResult[]
    ↓
[Wolt Enrichment Service] (async, non-blocking)
    ├─ Check Redis cache (ext:wolt:place:<placeId>)
    │   ├─ Cache HIT → Attach { status: 'FOUND', url: '...' }
    │   └─ Cache MISS → Attach { status: 'PENDING', url: null }
    │                    Trigger background job (if lock acquired)
    ↓
Return results immediately (HTTP 200 or WS 'ready')
    ↓
[Background Job: Wolt Matcher Worker]
    ├─ Acquire lock (ext:wolt:lock:<placeId>, SET NX)
    ├─ Search Wolt API (by restaurant name + location)
    ├─ Match restaurant (fuzzy name match, distance threshold)
    ├─ Store in Redis (ext:wolt:place:<placeId>, TTL)
    └─ Publish WS RESULT_PATCH event
        ↓
    [Client WebSocket Handler]
        ├─ Match restaurant by placeId
        ├─ Merge patch.wolt
        └─ Trigger change detection (OnPush)
```

---

### 2.2 Files to Create/Modify

#### Backend

**Create:**

- `server/src/services/search/wolt/wolt-enrichment.contracts.ts` ✓
  - Types, Redis keys, TTL constants
- `server/src/services/search/wolt/wolt-enrichment.service.ts` (NEW)
  - Orchestrator: Check cache → Attach status → Trigger job
- `server/src/services/search/wolt/wolt-matcher.worker.ts` (NEW)
  - Background job: Search Wolt → Match → Cache → Publish WS
- `server/src/services/search/wolt/wolt-api.client.ts` (NEW)
  - Wolt API client (search by name + location)
- `server/src/services/search/wolt/wolt-matcher.ts` (NEW)
  - Fuzzy name matching + distance threshold logic

**Modify:**

- `server/src/infra/websocket/websocket-protocol.ts` ✓
  - Added `WSServerResultPatch` to `WSServerMessage` union
- `server/src/services/search/types/search.types.ts` ✓
  - Extended `RestaurantResult` with `wolt?` field
- `server/src/services/search/route2/orchestrator.response.ts` (TBD)
  - Call `WoltEnrichmentService.enrich()` before returning results

#### Frontend

**Modify:**

- `llm-angular/src/app/features/unified-search/services/websocket.service.ts`
  - Parse `RESULT_PATCH` event type
- `llm-angular/src/app/features/unified-search/state/search-results.store.ts`
  - `patchRestaurant(placeId, patch)` method
- `llm-angular/src/app/features/unified-search/components/restaurant-card/`
  - Show Wolt CTA when `wolt.status === 'FOUND'`

---

## 3. Redis Operations (Examples)

### 3.1 Check Cache (Orchestrator)

```ts
import {
  WOLT_REDIS_KEYS,
  WoltCacheEntry,
} from "./wolt-enrichment.contracts.js";

async function getWoltEnrichment(placeId: string): Promise<WoltEnrichment> {
  const key = WOLT_REDIS_KEYS.place(placeId);
  const cached = await redis.get(key);

  if (cached) {
    const entry: WoltCacheEntry = JSON.parse(cached);
    return { status: entry.status, url: entry.url };
  }

  // Cache miss → trigger background job
  return { status: "PENDING", url: null };
}
```

---

### 3.2 Acquire Lock (Worker)

```ts
import {
  WOLT_REDIS_KEYS,
  WOLT_CACHE_TTL_SECONDS,
} from "./wolt-enrichment.contracts.js";

async function acquireEnrichmentLock(placeId: string): Promise<boolean> {
  const lockKey = WOLT_REDIS_KEYS.lock(placeId);
  const acquired = await redis.set(
    lockKey,
    "1",
    "EX",
    WOLT_CACHE_TTL_SECONDS.LOCK,
    "NX" // Only set if not exists
  );

  if (!acquired) {
    logger.warn({ placeId }, "Wolt enrichment lock already held, skipping");
    return false;
  }

  return true;
}
```

---

### 3.3 Store Result (Worker)

```ts
import {
  WOLT_REDIS_KEYS,
  WOLT_CACHE_TTL_SECONDS,
  WoltCacheEntry,
} from "./wolt-enrichment.contracts.js";

async function cacheWoltResult(
  placeId: string,
  woltUrl: string | null
): Promise<void> {
  const cacheEntry: WoltCacheEntry = {
    url: woltUrl,
    status: woltUrl ? "FOUND" : "NOT_FOUND",
    updatedAt: new Date().toISOString(),
  };

  const ttl = woltUrl
    ? WOLT_CACHE_TTL_SECONDS.FOUND
    : WOLT_CACHE_TTL_SECONDS.NOT_FOUND;

  await redis.setex(
    WOLT_REDIS_KEYS.place(placeId),
    ttl,
    JSON.stringify(cacheEntry)
  );

  logger.info(
    {
      placeId,
      status: cacheEntry.status,
      ttl,
    },
    "Wolt enrichment cached"
  );
}
```

---

### 3.4 Publish WS Patch (Worker)

```ts
import { WSServerResultPatch } from "../../infra/websocket/websocket-protocol.js";
import { wsManager } from "../../infra/websocket/websocket-manager.js";

function publishWoltPatch(
  requestId: string,
  placeId: string,
  status: "FOUND" | "NOT_FOUND",
  url: string | null
): void {
  const patchEvent: WSServerResultPatch = {
    type: "RESULT_PATCH",
    requestId,
    placeId,
    patch: {
      wolt: { status, url },
    },
  };

  wsManager.publishToChannel("search", requestId, undefined, patchEvent);

  logger.debug(
    {
      requestId,
      placeId,
      status,
    },
    "Published Wolt RESULT_PATCH event"
  );
}
```

---

## 4. Acceptance Criteria

✅ **Initial response returns restaurants immediately**

- Orchestrator fetches Google Places → maps to `RestaurantResult[]`
- Wolt enrichment is async, non-blocking

✅ **Cache miss → status='PENDING', url=null**

- Check Redis: `ext:wolt:place:<placeId>`
- Not found → attach `{ status: 'PENDING', url: null }`
- Trigger background job (if lock acquired)

✅ **Enrichment completes → WS RESULT_PATCH updates specific restaurant**

- Job finishes → store in Redis with TTL
- Publish `WSServerResultPatch` with `placeId`
- Client matches by `placeId`, merges `patch.wolt`

✅ **No database persistence**

- Only Redis (TTL-based eviction)
- FOUND: 14d, NOT_FOUND: 24h

✅ **Anti-thrash lock prevents duplicate jobs**

- `ext:wolt:lock:<placeId>` with 60s TTL
- `SET NX` ensures single job per `placeId`

---

## 5. Future Enhancements (Out of Scope)

- **Admin cache invalidation:** `DELETE ext:wolt:place:<placeId>` endpoint
- **Bulk enrichment:** Pre-cache popular restaurants (cron job)
- **Monitoring:** Track cache hit rate, job success/failure metrics
- **Fallback:** If Wolt API down, skip enrichment gracefully (no PENDING state)
- **Other providers:** Extend `RESULT_PATCH` for TripAdvisor, OpenTable links

---

## 6. Testing Strategy

### Unit Tests

- `wolt-enrichment.service.test.ts`: Cache hit/miss logic
- `wolt-matcher.test.ts`: Fuzzy name matching, distance threshold
- `wolt-api.client.test.ts`: Mock Wolt API responses

### Integration Tests

- `wolt-enrichment.integration.test.ts`:
  - Cache miss → job triggered → WS patch published
  - Cache hit → immediate response (no job)
  - Lock held → no duplicate job

### E2E Tests

- Search → verify `wolt.status='PENDING'` in initial response
- Wait for WS `RESULT_PATCH` → verify `wolt.status='FOUND'`
- Verify Wolt CTA renders in restaurant card

---

## 7. Configuration (Environment Variables)

```bash
# Wolt API
WOLT_API_BASE_URL=https://consumer-api.wolt.com
WOLT_API_KEY=<secret>  # If authentication required

# Feature flag
ENABLE_WOLT_ENRICHMENT=true

# Cache overrides (optional, use defaults from contracts)
WOLT_CACHE_TTL_FOUND_SECONDS=1209600    # 14 days
WOLT_CACHE_TTL_NOT_FOUND_SECONDS=86400  # 24 hours
WOLT_LOCK_TTL_SECONDS=60                # 60 seconds

# Job execution
WOLT_JOB_TIMEOUT_MS=5000                # 5 seconds
WOLT_MATCH_DISTANCE_THRESHOLD_METERS=100  # 100m radius
```

---

## 8. Rollout Plan

### Phase 1: Backend Only (No UI)

- Implement service, worker, cache
- Verify WS events published
- Monitor logs, cache hit rate

### Phase 2: Frontend Integration

- Parse `RESULT_PATCH` events
- Update search results store
- Add Wolt CTA to restaurant card

### Phase 3: Optimization

- Tune TTLs based on cache hit metrics
- Add bulk pre-caching for popular restaurants
- Monitor job execution time, failure rate

---

## 9. Observability

### Logs

- `wolt_enrichment_cache_hit` / `wolt_enrichment_cache_miss`
- `wolt_enrichment_job_started` / `wolt_enrichment_job_completed`
- `wolt_enrichment_lock_acquired` / `wolt_enrichment_lock_held`

### Metrics (Future)

- Cache hit rate (`cache_hits / (cache_hits + cache_misses)`)
- Job success rate
- Average job execution time
- WS patch delivery latency

---

## 10. Next Steps (Implementation Order)

1. **Wolt API Client** (`wolt-api.client.ts`)

   - Research Wolt API endpoints (search by name + location)
   - Implement client with retries, timeouts

2. **Wolt Matcher** (`wolt-matcher.ts`)

   - Fuzzy name matching (Levenshtein distance? Simple contains?)
   - Distance threshold (100m default)

3. **Wolt Enrichment Service** (`wolt-enrichment.service.ts`)

   - Cache check → Attach status → Trigger job

4. **Wolt Matcher Worker** (`wolt-matcher.worker.ts`)

   - Acquire lock → Call API → Match → Cache → Publish WS

5. **Orchestrator Integration** (`orchestrator.response.ts`)

   - Call `WoltEnrichmentService.enrich(results)` before return

6. **Frontend WebSocket Handler**

   - Parse `RESULT_PATCH` event
   - Update search results store

7. **Frontend Restaurant Card**
   - Show Wolt CTA when `wolt.status === 'FOUND'`

---

## 11. Questions to Resolve

- [ ] **Wolt API:** Which endpoint to use? Authentication required?
- [ ] **Matching logic:** Fuzzy name match threshold? Distance threshold?
- [ ] **Job queue:** Use existing queue infrastructure or spawn async tasks?
- [ ] **Graceful degradation:** If enrichment fails, how to handle? (Skip silently? Retry?)
- [ ] **UI design:** Wolt CTA button text? Icon? Color?

---

**Contract Files:**

- ✅ `server/src/services/search/wolt/wolt-enrichment.contracts.ts` (Created)
- ✅ `server/src/infra/websocket/websocket-protocol.ts` (Modified)
- ✅ `server/src/services/search/types/search.types.ts` (Modified)
