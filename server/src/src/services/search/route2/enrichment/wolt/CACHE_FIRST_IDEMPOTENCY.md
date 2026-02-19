# Wolt Enrichment: Cache-First with Idempotent Job Enqueuing

## Overview

The Wolt enrichment service implements a **cache-first, idempotent** approach to attach Wolt delivery links to restaurant results. It ensures that:

1. **Cache-first**: Redis cache is checked before setting PENDING status
2. **Idempotent**: Only one background job is enqueued per `placeId` across all instances
3. **Non-blocking**: HTTP response returns immediately (enrichment completes via WebSocket)
4. **Backward Compatible**: Updates both `providers.wolt` (new) and `wolt` (legacy) fields

---

## Data Flow

### Initial State (Result Mapper)

When `mapGooglePlaceToResult` creates a restaurant:

```typescript
{
  placeId: "ChIJ123",
  name: "Pizza House",
  providers: {
    wolt: { status: 'PENDING', url: null }  // NEW
  },
  wolt: { status: 'PENDING', url: null }    // DEPRECATED
}
```

### Cache Check in Enrichment Service

**Function:** `enrichWithWoltLinks()`

For each restaurant:

#### Case 1: Cache HIT (FOUND)
```typescript
// Redis: ext:wolt:place:ChIJ123 = { status: 'FOUND', url: 'https://wolt.com/...' }

restaurant.providers.wolt = { status: 'FOUND', url: 'https://wolt.com/...' }  // NEW
restaurant.wolt = { status: 'FOUND', url: 'https://wolt.com/...' }            // DEPRECATED

// Result: No job enqueued (already cached)
```

#### Case 2: Cache HIT (NOT_FOUND)
```typescript
// Redis: ext:wolt:place:ChIJ123 = { status: 'NOT_FOUND', url: null }

restaurant.providers.wolt = { status: 'NOT_FOUND', url: null }  // NEW
restaurant.wolt = { status: 'NOT_FOUND', url: null }            // DEPRECATED

// Result: No job enqueued (already cached)
```

#### Case 3: Cache MISS
```typescript
// Redis: ext:wolt:place:ChIJ123 = null

restaurant.providers.wolt = { status: 'PENDING', url: null }  // NEW
restaurant.wolt = { status: 'PENDING', url: null }            // DEPRECATED

// Next: Try acquire lock for idempotent job enqueuing
```

---

## Idempotency Strategy

### Primary Guard: Redis Lock (SET NX)

**Lock Key:** `ext:wolt:lock:<placeId>`
**TTL:** 60 seconds
**Operation:** Redis `SET key value EX 60 NX`

```typescript
// Lock acquisition (atomic operation)
const lockKey = `ext:wolt:lock:${placeId}`;
const result = await redis.set(lockKey, '1', 'EX', 60, 'NX');

if (result === 'OK') {
  // ✅ Lock acquired - this worker won the race
  // Enqueue background job
  queue.enqueue({ requestId, placeId, name, cityText });
} else {
  // ⏭️ Lock already held - another worker is handling this place
  // Skip job enqueuing (idempotent behavior)
}
```

### Why SET NX is Idempotent

**SET NX** = "Set if Not eXists"
- **First request**: Lock doesn't exist → SET succeeds → returns 'OK' → enqueue job
- **Concurrent requests**: Lock exists → SET fails → returns null → skip enqueuing
- **Across all instances**: Redis is shared, so lock works across all backend pods/nodes

### Secondary Guard: Job Queue Deduplication

**File:** `wolt-job-queue.ts`

```typescript
enqueue(job: WoltEnrichmentJob): void {
  // Safety net: Check if job for same placeId already in queue
  const existingJob = this.queue.find(j => j.placeId === job.placeId);
  if (existingJob) {
    logger.info('Job already in queue, skipped (idempotency guard)');
    return;
  }
  
  this.queue.push(job);
}
```

### Multi-Layer Idempotency

| Layer | Mechanism | Scope | Purpose |
|-------|-----------|-------|---------|
| 1. Redis Lock | SET NX | Cross-instance | Primary idempotency (distributed) |
| 2. Job Queue | Array search | Single instance | Safety net (local) |
| 3. Cache Check | GET before lock | Cross-instance | Avoid work if already done |

---

## Redis Keys

### Cache Key (Result Storage)
```
Key:    ext:wolt:place:<placeId>
Value:  JSON { status: 'FOUND' | 'NOT_FOUND', url: string | null, updatedAt: ISO8601 }
TTL:    7 days (604800 seconds)
```

**Example:**
```bash
redis> GET ext:wolt:place:ChIJ123abc
"{\"status\":\"FOUND\",\"url\":\"https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house\",\"updatedAt\":\"2026-02-03T12:00:00Z\"}"
```

### Lock Key (Idempotency Guard)
```
Key:    ext:wolt:lock:<placeId>
Value:  "1" (arbitrary, lock presence is what matters)
TTL:    60 seconds
```

**Example:**
```bash
redis> SET ext:wolt:lock:ChIJ123abc 1 EX 60 NX
"OK"  # Lock acquired

redis> SET ext:wolt:lock:ChIJ123abc 1 EX 60 NX
(nil)  # Lock already held (concurrent request)
```

---

## Code Flow: enrichWithWoltLinks()

### Step-by-Step Execution

```typescript
export async function enrichWithWoltLinks(
  results: RestaurantResult[],
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<RestaurantResult[]> {
```

#### 1. Feature Flag Check
```typescript
if (!isWoltEnrichmentEnabled()) {
  return results;  // Skip enrichment if disabled
}
```

#### 2. Get Redis Client
```typescript
const redis = await getWoltRedisClient();
if (!redis) {
  return results;  // Skip if Redis unavailable
}
```

#### 3. Enrich All Restaurants in Parallel
```typescript
await Promise.all(
  results.map(restaurant => 
    enrichSingleRestaurant(redis, restaurant, requestId, cityText, ctx)
  )
);
```

### enrichSingleRestaurant() Logic

```typescript
async function enrichSingleRestaurant(
  redis: RedisClient,
  restaurant: RestaurantResult,
  requestId: string,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  
  // STEP 1: Check cache
  const cached = await checkWoltCache(redis, restaurant.placeId);
  
  if (cached) {
    // Cache HIT: Populate both new and legacy fields
    restaurant.providers = {
      ...restaurant.providers,
      wolt: { status: cached.status, url: cached.url }  // NEW
    };
    restaurant.wolt = cached;  // DEPRECATED
    
    return;  // Done - no job needed
  }
  
  // STEP 2: Cache MISS - Set PENDING
  restaurant.providers = {
    ...restaurant.providers,
    wolt: { status: 'PENDING', url: null }  // NEW
  };
  restaurant.wolt = { status: 'PENDING', url: null };  // DEPRECATED
  
  // STEP 3: Try acquire lock (idempotent key)
  const lockResult = await tryAcquireLock(redis, restaurant.placeId);
  
  if (lockResult.acquired) {
    // Lock ACQUIRED: Enqueue job (only this worker)
    await triggerMatchJob(requestId, restaurant, cityText, ctx);
  } else {
    // Lock HELD: Skip (another worker handling it)
    logger.info('Lock held, skipping job enqueue (idempotent)');
  }
}
```

---

## Concurrency Scenarios

### Scenario 1: Single Request

```
Request 1 arrives for "Pizza House" (ChIJ123)
├─ Check cache: MISS
├─ Set PENDING
├─ Try lock: ✅ ACQUIRED (no lock exists)
└─ Enqueue job → Background worker processes

Result: 1 job enqueued
```

### Scenario 2: Concurrent Requests (Same Place)

```
Request 1 arrives for "Pizza House" (ChIJ123)
Request 2 arrives for "Pizza House" (ChIJ123)  [same time]
Request 3 arrives for "Pizza House" (ChIJ123)  [same time]

Request 1:
├─ Check cache: MISS
├─ Set PENDING
├─ Try lock: ✅ ACQUIRED
└─ Enqueue job

Request 2:
├─ Check cache: MISS
├─ Set PENDING
├─ Try lock: ❌ HELD (Request 1 owns lock)
└─ Skip job (idempotent)

Request 3:
├─ Check cache: MISS
├─ Set PENDING
├─ Try lock: ❌ HELD (Request 1 owns lock)
└─ Skip job (idempotent)

Result: 1 job enqueued (idempotent ✅)
```

### Scenario 3: Subsequent Request (Cache Hit)

```
Request 1 completes → Worker writes cache → Publishes RESULT_PATCH

Request 4 arrives for "Pizza House" (ChIJ123)  [later]
├─ Check cache: ✅ HIT (status: FOUND, url: ...)
├─ Set providers.wolt = FOUND
└─ Done (no lock attempt, no job)

Result: 0 jobs enqueued (cache hit)
```

### Scenario 4: Multi-Instance Deployment

```
Instance A: Request 1 for "Pizza House"
Instance B: Request 2 for "Pizza House"  [concurrent]
Instance C: Request 3 for "Pizza House"  [concurrent]

All instances share Redis:

Instance A:
├─ Check cache: MISS
├─ SET NX lock: ✅ OK (first to acquire)
└─ Enqueue job

Instance B:
├─ Check cache: MISS
├─ SET NX lock: ❌ null (lock exists)
└─ Skip job

Instance C:
├─ Check cache: MISS
├─ SET NX lock: ❌ null (lock exists)
└─ Skip job

Result: 1 job enqueued across all instances (distributed idempotency ✅)
```

---

## WebSocket Patch Flow

After background job completes:

### Worker Publishes RESULT_PATCH
```typescript
wsManager.publishToChannel('search', requestId, undefined, {
  type: 'RESULT_PATCH',
  requestId,
  placeId: 'ChIJ123',
  patch: {
    providers: {  // NEW
      wolt: { status: 'FOUND', url: 'https://wolt.com/...' }
    },
    wolt: {       // DEPRECATED
      status: 'FOUND',
      url: 'https://wolt.com/...'
    }
  }
});
```

### Frontend Receives and Merges
```typescript
// SearchStore.patchRestaurant()
const mergedProviders = {
  ...restaurant.providers,
  ...patch.providers  // Deep merge preserves other providers
};

restaurant.providers = mergedProviders;
restaurant.wolt = patch.wolt;  // Legacy field
```

---

## Configuration

### Environment Variables

```bash
# Enable Wolt enrichment (default: disabled)
ENABLE_WOLT_ENRICHMENT=true

# Redis connection (required if enrichment enabled)
REDIS_URL=redis://localhost:6379
```

### Redis Connection Settings

**File:** `wolt-enrichment.service.ts`

```typescript
await getRedisClient({
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: 2,    // Fast fail on Redis errors
  connectTimeout: 2000,         // 2s connection timeout
  commandTimeout: 2000,         // 2s command timeout
});
```

---

## Observability

### Structured Logging Events

| Event | When | Fields |
|-------|------|--------|
| `wolt_cache_hit` | Cache found | placeId, status, restaurantName |
| `wolt_cache_miss` | Cache not found | placeId, restaurantName |
| `wolt_lock_acquired` | Lock acquired | placeId, restaurantName |
| `wolt_lock_skipped` | Lock held (idempotent) | placeId, restaurantName |
| `wolt_lock_failed` | Lock error | placeId, lockError |
| `wolt_job_enqueued` | Job enqueued | placeId, requestId, name, cityText |
| `wolt_enqueue_skipped` | Job not enqueued | reason, placeId |

### Enqueue Skip Reasons

```typescript
type SkipReason =
  | 'flag_disabled'      // ENABLE_WOLT_ENRICHMENT=false
  | 'no_results'         // Empty results array
  | 'redis_down'         // Redis unavailable
  | 'already_cached'     // Cache hit
  | 'lock_held'          // Another worker handling it (idempotent)
  | 'lock_error'         // Redis error during lock
  | 'queue_unavailable'; // Job queue not initialized
```

### Example Log Output

```json
{
  "event": "wolt_cache_miss",
  "requestId": "req_abc123",
  "placeId": "ChIJ123",
  "restaurantName": "Pizza House",
  "cityText": "Tel Aviv"
}

{
  "event": "wolt_lock_acquired",
  "requestId": "req_abc123",
  "placeId": "ChIJ123",
  "restaurantName": "Pizza House"
}

{
  "event": "wolt_job_enqueued",
  "requestId": "req_abc123",
  "placeId": "ChIJ123",
  "name": "Pizza House",
  "cityText": "Tel Aviv",
  "statusSet": "PENDING",
  "reason": "cache_miss"
}
```

---

## Performance Characteristics

### Happy Path (Cache Hit)
```
Total Time: ~5-10ms per restaurant
├─ Redis GET: 2-5ms
└─ Field mutation: <1ms

No job enqueued, no lock attempted
```

### Cold Path (Cache Miss, Lock Acquired)
```
Total Time: ~10-20ms per restaurant
├─ Redis GET (miss): 2-5ms
├─ Redis SET NX (lock): 3-8ms
└─ Job enqueue: 2-5ms (non-blocking)

HTTP response not blocked by background job
Background job processes asynchronously (~500-2000ms)
```

### Cold Path (Cache Miss, Lock Held)
```
Total Time: ~10-15ms per restaurant
├─ Redis GET (miss): 2-5ms
└─ Redis SET NX (lock fails): 3-8ms

No job enqueued (idempotent skip)
```

### Parallelization

All restaurants enriched in parallel:
```typescript
await Promise.all(
  results.map(restaurant => enrichSingleRestaurant(...))
);
```

**10 restaurants**: ~15-20ms total (not 10 × 15ms)

---

## Error Handling

### Redis Unavailable
```typescript
if (!redis) {
  // All restaurants stay with mapper's initial PENDING state
  // No jobs enqueued
  return results;
}
```

### Cache Read Error
```typescript
try {
  const cached = await redis.get(key);
} catch (err) {
  logger.warn('Cache read error (non-fatal)');
  return null;  // Treat as cache miss
}
```

### Lock Acquisition Error
```typescript
try {
  await redis.set(lockKey, '1', 'EX', 60, 'NX');
} catch (err) {
  logger.warn('Lock acquisition error');
  // Result stays PENDING (no retry mechanism)
  return { acquired: false, reason: 'error' };
}
```

### Job Queue Unavailable
```typescript
if (!queue) {
  logger.warn('Job queue unavailable');
  // Result stays PENDING
  // No job enqueued
  return;
}
```

---

## Testing Idempotency

### Manual Test (Redis CLI)

```bash
# Simulate concurrent requests acquiring lock
redis-cli

# First request (should succeed)
127.0.0.1:6379> SET ext:wolt:lock:ChIJ123 1 EX 60 NX
OK

# Second request (should fail - lock held)
127.0.0.1:6379> SET ext:wolt:lock:ChIJ123 1 EX 60 NX
(nil)

# Wait 60 seconds (TTL expires)
127.0.0.1:6379> TTL ext:wolt:lock:ChIJ123
(integer) -2

# Third request (should succeed - lock expired)
127.0.0.1:6379> SET ext:wolt:lock:ChIJ123 1 EX 60 NX
OK
```

### Unit Test Pattern

```typescript
test('should not enqueue duplicate jobs for same placeId', async () => {
  const results = [
    { placeId: 'ChIJ123', name: 'Pizza House' }
  ];
  
  // First call - should enqueue job
  await enrichWithWoltLinks(results, 'req1', null, ctx);
  
  // Second call (concurrent) - should NOT enqueue (lock held)
  await enrichWithWoltLinks(results, 'req2', null, ctx);
  
  // Verify: Only 1 job in queue
  expect(jobQueue.getQueueSize()).toBe(1);
});
```

---

## Migration from Legacy `wolt` Field

### Current State (Dual Field)

Both fields populated:
```typescript
restaurant.providers.wolt = { status: 'FOUND', url: '...' }  // NEW (preferred)
restaurant.wolt = { status: 'FOUND', url: '...' }            // DEPRECATED
```

### Future State (After Migration)

Only new field:
```typescript
restaurant.providers.wolt = { status: 'FOUND', url: '...' }
// restaurant.wolt removed
```

### Migration Steps

1. **Phase 1 (Current)**: Write both fields, read from `providers.wolt` (preferred) or `wolt` (fallback)
2. **Phase 2**: Monitor metrics - ensure all consumers use `providers.wolt`
3. **Phase 3**: Remove `restaurant.wolt` writes from enrichment service
4. **Phase 4**: Remove `wolt` field from `RestaurantResult` type

---

## SOLID Compliance

### Single Responsibility ✅
- `enrichWithWoltLinks()`: Only handles Wolt enrichment
- `tryAcquireLock()`: Only handles lock acquisition
- `checkWoltCache()`: Only handles cache reads

### Open/Closed ✅
- Extensible for future providers (tripadvisor, yelp) via `providers` object
- No changes needed to core enrichment logic

### Liskov Substitution ✅
- `ProviderState` interface can substitute legacy `WoltEnrichment` type
- Both have same shape: `{ status, url }`

### Interface Segregation ✅
- `WoltEnrichment` vs `WoltCacheEntry` vs `ProviderState`
- Each interface serves specific purpose

### Dependency Inversion ✅
- Depends on `RedisClient` abstraction (not concrete Redis implementation)
- Depends on `WoltJobQueue` abstraction (not concrete Bull/BullMQ)

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| **Cache Strategy** | Cache-first: Redis GET before setting PENDING |
| **Idempotency Key** | Redis lock: `ext:wolt:lock:<placeId>` (SET NX) |
| **Lock TTL** | 60 seconds |
| **Cache TTL** | 7 days (604800 seconds) |
| **Concurrency** | Distributed lock (works across all instances) |
| **Performance** | Non-blocking (~15-20ms with cache miss) |
| **Error Handling** | Fail-safe (results stay PENDING on errors) |
| **Backward Compat** | Dual field writes (`providers.wolt` + `wolt`) |
| **SOLID** | ✅ All principles followed |

**Result**: Robust, idempotent, cache-first enrichment that scales across multiple backend instances without duplicate background jobs.
