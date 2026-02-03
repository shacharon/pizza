# Wolt Enrichment: Quick Diffs Reference

## File Modified

**`server/src/services/search/route2/enrichment/wolt/wolt-enrichment.service.ts`**

---

## Diff 1: Service Header Documentation

```diff
 /**
  * Wolt Enrichment Service
  * 
  * Cache-first enrichment that attaches Wolt link data to restaurant results.
  * - Checks Redis cache for each restaurant (by placeId)
- * - If cache hit: attach wolt.status/url from cache
- * - If cache miss: attach wolt.status='PENDING', trigger background job
+ * - If cache hit: attach providers.wolt.status/url from cache (FOUND | NOT_FOUND)
+ * - If cache miss: attach providers.wolt.status='PENDING', trigger background job
  * 
+ * Idempotency: Redis locks (SET NX) ensure only one job per placeId across all instances
- * Non-blocking: Always returns immediately with enriched results.
+ * Non-blocking: Always returns immediately with enriched results
+ * Backward Compatible: Updates both providers.wolt (new) and wolt (legacy) fields
  */
```

---

## Diff 2: enrichWithWoltLinks() Documentation

```diff
 /**
- * Enrich restaurant results with Wolt link data
+ * Enrich restaurant results with Wolt link data (cache-first, idempotent)
  * 
  * For each restaurant:
  * 1. Check Redis cache (ext:wolt:place:<placeId>)
- *    - Hit: attach wolt.status/url from cache
- *    - Miss: attach wolt.status='PENDING', url=null
- * 2. On cache miss: attempt lock (ext:wolt:lock:<placeId>)
- *    - Lock acquired: enqueue background match job
- *    - Lock held: skip (another worker handling it)
+ *    - Hit: attach providers.wolt + wolt (legacy) with cached status/url
+ *    - Miss: attach providers.wolt.status='PENDING' + wolt.status='PENDING'
+ * 2. On cache miss: attempt lock (ext:wolt:lock:<placeId>) for idempotency
+ *    - Lock acquired: enqueue background match job (once per placeId)
+ *    - Lock held: skip (another worker handling it, idempotent)
+ * 
+ * Idempotency Strategy:
+ * - Redis lock key: ext:wolt:lock:<placeId> (TTL: 60s)
+ * - SET NX (only if not exists) ensures single job per placeId
+ * - Multiple concurrent requests for same place: only first acquires lock
+ * - Job queue has secondary deduplication guard (safety net)
  * 
  * @param results Restaurant results to enrich (mutates in-place)
  * @param requestId Request ID for logging and WS events
  * @param cityText Optional city context from intent stage
  * @param ctx Route2 context
  * @returns Enriched results (same array, mutated)
  */
```

---

## Diff 3: enrichSingleRestaurant() Documentation

```diff
 /**
  * Enrich a single restaurant with Wolt data
+ * 
+ * Steps:
+ * 1. Check cache → populate providers.wolt + wolt (legacy) if found
+ * 2. If miss → set PENDING, try acquire lock (idempotent key: ext:wolt:lock:<placeId>)
+ * 3. If lock acquired → enqueue background job (once per place)
+ * 4. If lock held → skip (another worker handling it)
  */
```

---

## Diff 4: Cache HIT Logic

```diff
   if (cached) {
-    // Cache HIT: Attach cached data
-    restaurant.wolt = cached;
+    // Cache HIT: Attach cached data to BOTH new and legacy fields
+    const providerState = {
+      status: cached.status,
+      url: cached.url,
+    };
+    
+    // NEW: Structured providers field
+    restaurant.providers = {
+      ...restaurant.providers,
+      wolt: providerState,
+    };
+    
+    // DEPRECATED: Legacy wolt field (backward compatibility)
+    restaurant.wolt = cached;
+    
     logWoltEvent('wolt_cache_hit', {
       requestId,
       placeId,
       restaurantName,
       cityText,
       status: cached.status,
     });
 
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
       status: cached.status,
       ageMs: cachedAgeMs,
       hasUrl: Boolean(cached.url),
     });
     return;
   }
```

---

## Diff 5: Cache MISS Logic

```diff
-  // Cache MISS: Attach PENDING status
-  restaurant.wolt = {
-    status: 'PENDING',
+  // Cache MISS: Attach PENDING status to BOTH new and legacy fields
+  const pendingState = {
+    status: 'PENDING' as const,
     url: null,
   };
+  
+  // NEW: Structured providers field
+  restaurant.providers = {
+    ...restaurant.providers,
+    wolt: pendingState,
+  };
+  
+  // DEPRECATED: Legacy wolt field (backward compatibility)
+  restaurant.wolt = pendingState;
 
   logWoltEvent('wolt_cache_miss', {
     requestId,
     placeId,
     restaurantName,
     cityText,
   });
```

---

## Summary Stats

| Metric | Value |
|--------|-------|
| Files Modified | 1 |
| Lines Added | ~30 |
| Lines Removed | ~10 |
| Net Change | ~20 lines |
| Backward Compatible | ✅ Yes (dual writes) |
| Breaking Changes | ❌ None |

---

## Key Changes

1. **Dual Field Writes**: Both `providers.wolt` (new) and `wolt` (legacy) populated
2. **Spread Operator**: `...restaurant.providers` preserves other provider states
3. **Type Safety**: `as const` for TypeScript literal type inference
4. **Documentation**: Explicit idempotency strategy documented

---

## Idempotency Mechanism (Already Existed)

**No changes needed** - existing implementation already uses Redis SET NX:

```typescript
// Already in codebase (no changes)
async function tryAcquireLock(redis: RedisClient, placeId: string) {
  const lockKey = WOLT_REDIS_KEYS.lock(placeId);  // ext:wolt:lock:<placeId>
  const result = await redis.set(
    lockKey,
    '1',
    'EX',
    WOLT_CACHE_TTL_SECONDS.LOCK,  // 60 seconds
    'NX'  // Only set if key does NOT exist (idempotent)
  );
  
  if (result === 'OK') {
    return { acquired: true, reason: 'acquired' };
  } else {
    return { acquired: false, reason: 'held' };  // Already locked
  }
}
```

**Idempotency guaranteed by:**
- ✅ Redis `SET NX` atomic operation
- ✅ Lock TTL (60s) prevents deadlocks
- ✅ Cross-instance (all pods share Redis)
- ✅ First-win semantics (only first request acquires lock)

---

## Redis Keys

### Cache Key
```
Pattern: ext:wolt:place:<placeId>
TTL:     7 days
Action:  READ before setting PENDING ✅
```

### Lock Key (Idempotent)
```
Pattern: ext:wolt:lock:<placeId>
TTL:     60 seconds
Action:  SET NX (atomic, only if not exists) ✅
```

---

## Testing Commands

```bash
# Build backend
cd server && npm run build

# Test idempotency (manual Redis test)
redis-cli
127.0.0.1:6379> SET ext:wolt:lock:test_place 1 EX 60 NX
OK  # First request succeeds

127.0.0.1:6379> SET ext:wolt:lock:test_place 1 EX 60 NX
(nil)  # Second request fails (idempotent)
```

---

## Related Documentation

- **Comprehensive Guide**: `CACHE_FIRST_IDEMPOTENCY.md`
- **Implementation Summary**: `WOLT_ENRICHMENT_PROVIDERS_FIELD.md`
- **Phase 1 Summary**: `PROVIDER_STATE_IMPLEMENTATION.md`
