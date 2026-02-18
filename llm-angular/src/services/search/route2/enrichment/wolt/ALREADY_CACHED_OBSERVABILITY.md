# STEP 2.5 — "already_cached" Observability Enhancement

**Date:** 2026-02-03  
**Objective:** Reveal what "already_cached" actually means without behavior changes

---

## Changes Made

### 1. Enhanced `logEnqueueSkipped` Function

**File:** `server/src/services/search/route2/enrichment/wolt/wolt-enrichment.service.ts`

**Lines:** 109-132

Added optional `cachedDetails` parameter to log cache entry metadata:

```typescript
function logEnqueueSkipped(
  requestId: string,
  reason:
    | "flag_disabled"
    | "no_results"
    | "redis_down"
    | "already_cached"
    | "lock_held"
    | "queue_unavailable",
  placeId?: string,
  cachedDetails?: { status: string; ageMs: number; hasUrl: boolean }
): void {
  logger.info(
    {
      event: "wolt_enqueue_skipped",
      requestId,
      reason,
      ...(placeId && { placeId }),
      ...(cachedDetails && {
        cachedStatus: cachedDetails.status, // FOUND | NOT_FOUND
        cachedAgeMs: cachedDetails.ageMs, // Age in milliseconds
        cachedHasUrl: cachedDetails.hasUrl, // Boolean
      }),
    },
    `[WoltEnrichment] Enqueue skipped: ${reason}`
  );
}
```

### 2. Enhanced Call Site for `already_cached`

**File:** `server/src/services/search/route2/enrichment/wolt/wolt-enrichment.service.ts`

**Lines:** 312-341

When cache hit occurs, we now:

1. Read the raw cache entry to get `updatedAt` timestamp
2. Compute `cachedAgeMs` (time since last update)
3. Extract `cachedStatus` and `cachedHasUrl` from cached object
4. Pass all details to `logEnqueueSkipped`

```typescript
if (cached) {
  // Cache HIT: Attach cached data
  restaurant.wolt = cached;
  logWoltEvent('wolt_cache_hit', { ... });

  // Read raw cache entry to get updatedAt for observability
  let cachedAgeMs = 0;
  try {
    const key = WOLT_REDIS_KEYS.place(placeId);
    const rawCached = await redis.get(key);
    if (rawCached) {
      const entry: WoltCacheEntry = JSON.parse(rawCached);
      cachedAgeMs = Date.now() - new Date(entry.updatedAt).getTime();
    }
  } catch {
    // Ignore errors reading cache for log metadata
  }

  logEnqueueSkipped(requestId, 'already_cached', placeId, {
    status: cached.status,        // FOUND | NOT_FOUND
    ageMs: cachedAgeMs,           // Age in ms
    hasUrl: Boolean(cached.url),  // true if FOUND, false if NOT_FOUND
  });
  return;
}
```

---

## Expected Log Output

### Before (old logs from server.log)

```json
{
  "level": "info",
  "event": "wolt_enqueue_skipped",
  "requestId": "req-1770125977814-glrqlm36z",
  "reason": "already_cached",
  "placeId": "ChIJ3fIA445LHRURFH_Ww1-rgMU",
  "msg": "[WoltEnrichment] Enqueue skipped: already_cached"
}
```

### After (with new code, after server restart)

```json
{
  "level": "info",
  "event": "wolt_enqueue_skipped",
  "requestId": "req-...",
  "reason": "already_cached",
  "placeId": "ChIJ...",
  "cachedStatus": "FOUND",
  "cachedAgeMs": 3456789,
  "cachedHasUrl": true,
  "msg": "[WoltEnrichment] Enqueue skipped: already_cached"
}
```

**OR for NOT_FOUND entries:**

```json
{
  "level": "info",
  "event": "wolt_enqueue_skipped",
  "requestId": "req-...",
  "reason": "already_cached",
  "placeId": "ChIJ...",
  "cachedStatus": "NOT_FOUND",
  "cachedAgeMs": 1234567,
  "cachedHasUrl": false,
  "msg": "[WoltEnrichment] Enqueue skipped: already_cached"
}
```

---

## Verification Steps

1. **Restart the server** (or wait for hot-reload if using nodemon)
2. **Run a search query** that triggers Wolt enrichment:
   ```bash
   # Example: Search for restaurants in Tel Aviv
   curl -X POST http://localhost:3000/api/search \
     -H "Content-Type: application/json" \
     -d '{"query": "המבורגר בתל אביב", "sessionId": "test-123"}'
   ```
3. **Check logs** for `wolt_enqueue_skipped` with `reason="already_cached"`:
   ```bash
   grep "wolt_enqueue_skipped.*already_cached" server/logs/server.log | tail -5
   ```

---

## PASS Criteria

✅ Logs show `cachedStatus` (FOUND | NOT_FOUND)  
✅ Logs show `cachedAgeMs` (time since cache entry was created/updated)  
✅ Logs show `cachedHasUrl` (true for FOUND, false for NOT_FOUND)  
✅ No behavior changes (enrichment logic unchanged)

---

## Analysis Use Cases

### 1. Cache Freshness

**Question:** How old is our cached data?

```bash
# Find stale cached entries (> 1 hour old)
grep "cachedAgeMs" server/logs/server.log | \
  jq 'select(.cachedAgeMs > 3600000)'
```

### 2. NOT_FOUND vs FOUND Ratio

**Question:** What % of cached entries are NOT_FOUND?

```bash
# Count by status
grep "already_cached" server/logs/server.log | \
  jq -r '.cachedStatus' | sort | uniq -c
```

### 3. Unnecessary Cache Reads

**Question:** Are we reading NOT_FOUND entries too often?

```bash
# Find NOT_FOUND entries with young age (< 5 min)
grep "cachedStatus.*NOT_FOUND" server/logs/server.log | \
  jq 'select(.cachedAgeMs < 300000)'
```

---

## Notes

- **No Behavior Change:** The code only adds log fields; it doesn't change enrichment logic
- **Performance:** One extra Redis read per cached restaurant (for `updatedAt` metadata)
- **Error Handling:** If reading cache metadata fails, `cachedAgeMs` defaults to 0
- **Other Skip Reasons:** Only `already_cached` gets the extra fields; other reasons remain unchanged
