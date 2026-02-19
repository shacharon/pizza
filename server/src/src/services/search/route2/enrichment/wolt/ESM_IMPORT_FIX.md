# Wolt Job Queue ESM Import Fix (2026-02-03)

## Issue

**Error:** `require is not defined`

**Root Cause:** `getJobQueue()` function used CommonJS `require()` in an ES module context, causing initialization to fail.

**Impact:** All Wolt enrichment jobs failed with `wolt_job_queue_init_error`, preventing any job enqueuing.

---

## Fix Applied

**File:** `server/src/services/search/route2/enrichment/wolt/wolt-enrichment.service.ts`

### Change 1: Convert getJobQueue() to async with ESM import

**Lines 214-241 (OLD):**

```typescript
// Lazy-initialized job queue
let jobQueueInstance: any = null;

/**
 * Get or create job queue instance
 */
function getJobQueue(): any {
  if (jobQueueInstance) {
    return jobQueueInstance;
  }

  // Lazy load to avoid circular dependencies
  // Will be initialized on first use
  try {
    const { getWoltJobQueue } = require("./wolt-job-queue.instance.js"); // ❌ FAILS in ESM
    jobQueueInstance = getWoltJobQueue();
    return jobQueueInstance;
  } catch (err) {
    logger.error(
      {
        event: "wolt_job_queue_init_error",
        error: err instanceof Error ? err.message : String(err),
      },
      "[WoltEnrichment] Failed to initialize job queue"
    );
    return null;
  }
}
```

**Lines 214-241 (NEW):**

```typescript
// Lazy-initialized job queue
let jobQueueInstance: any = null;

/**
 * Get or create job queue instance (async for ESM dynamic import)
 */
async function getJobQueue(): Promise<any> {
  // ✅ Made async
  if (jobQueueInstance) {
    return jobQueueInstance;
  }

  // Lazy load to avoid circular dependencies (ESM-safe dynamic import)
  try {
    const { getWoltJobQueue } = await import("./wolt-job-queue.instance.js"); // ✅ ESM import
    jobQueueInstance = getWoltJobQueue();
    return jobQueueInstance;
  } catch (err) {
    logger.error(
      {
        event: "wolt_job_queue_init_error",
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined, // ✅ Added stack trace
      },
      "[WoltEnrichment] Failed to initialize job queue"
    );
    return null;
  }
}
```

**Changes:**

- Line 218: Updated comment to mention async/ESM
- Line 220: Changed `function getJobQueue(): any` → `async function getJobQueue(): Promise<any>`
- Line 225: Updated comment to mention ESM-safe
- Line 227: Changed `require('./wolt-job-queue.instance.js')` → `await import('./wolt-job-queue.instance.js')`
- Line 235: Added `stack: err instanceof Error ? err.stack : undefined`

---

### Change 2: Update caller to await async getJobQueue()

**Lines 243-265 (OLD):**

```typescript
async function triggerMatchJob(
  requestId: string,
  restaurant: RestaurantResult,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  const queue = getJobQueue();  // ❌ Not awaited

  if (!queue) {
    logger.warn(
      {
        event: 'wolt_job_queue_unavailable',
        requestId,
        placeId: restaurant.placeId,
      },
      '[WoltEnrichment] Job queue unavailable, skipping background job'
    );
    logEnqueueSkipped(requestId, 'queue_unavailable', restaurant.placeId);
    return;
  }
```

**Lines 243-265 (NEW):**

```typescript
async function triggerMatchJob(
  requestId: string,
  restaurant: RestaurantResult,
  cityText: string | null,
  ctx: Route2Context
): Promise<void> {
  const queue = await getJobQueue();  // ✅ Awaited

  if (!queue) {
    logger.warn(
      {
        event: 'wolt_job_queue_unavailable',
        requestId,
        placeId: restaurant.placeId,
      },
      '[WoltEnrichment] Job queue unavailable, skipping background job'
    );
    logEnqueueSkipped(requestId, 'queue_unavailable', restaurant.placeId);
    return;
  }
```

**Changes:**

- Line 252: Changed `const queue = getJobQueue()` → `const queue = await getJobQueue()`

---

## Summary

**Total changes:** 4 lines modified in 2 locations

1. **Line 220:** Made `getJobQueue()` async with `Promise<any>` return type
2. **Line 227:** Replaced `require()` with `await import()`
3. **Line 235:** Added error `stack` to log
4. **Line 252:** Added `await` when calling `getJobQueue()`

**No refactoring:** Architecture unchanged, lazy initialization preserved

**No behavior change:** Function still returns queue instance or null, same error handling

---

## Verification

### Expected Logs (Success):

**On first enrichment call:**

```json
{
  "level": "info",
  "event": "wolt_enrichment_config",
  "enabledFlag": true,
  "hasRedisUrl": true,
  "redisUrlHost": "redis://localhost:6379"
}
```

**On first job queue access:**

```json
{
  "level": "info",
  "event": "wolt_worker_boot",
  "enabledFlag": true,
  "nodeEnv": "development"
}
```

**On each cache miss:**

```json
{
  "level": "info",
  "event": "wolt_job_enqueued",
  "requestId": "req-123",
  "restaurantId": "ChIJ...",
  "placeId": "ChIJ...",
  "name": "Restaurant Name",
  "cityText": "תל אביב",
  "statusSet": "PENDING",
  "reason": "cache_miss"
}
```

### Should NOT See:

```json
{
  "level": "error",
  "event": "wolt_job_queue_init_error",
  "error": "require is not defined"
}
```

---

## Test Command

```bash
# Start server
cd server && npm run dev

# Make a search request (from another terminal)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"query": "פיצה תל אביב", "llmProvider": "openai"}'

# Check logs
grep "wolt_worker_boot\|wolt_job_enqueued\|wolt_job_queue_init_error" logs/server.log
```

**Expected output:**

```
✅ wolt_worker_boot
✅ wolt_job_enqueued (at least once)
❌ No wolt_job_queue_init_error
```

---

## Technical Details

### Why Dynamic Import?

- **ESM modules** don't support `require()` (CommonJS)
- **Static imports** at top of file would work, but might cause circular dependency issues
- **Dynamic `import()`** maintains lazy loading and avoids circular deps
- **Async nature** fits well since `triggerMatchJob()` is already async

### Why Add Stack Trace?

- Helps debug if a different error occurs in the future
- Minimal overhead (only logged on error)
- Only included when `err` is an Error instance

---

## Files Modified

1. ✅ `server/src/services/search/route2/enrichment/wolt/wolt-enrichment.service.ts`
   - Lines 220, 227, 235, 252

## Verification Status

- ✅ No linter errors
- ✅ Minimal diff (4 lines)
- ✅ No refactoring
- ✅ Lazy init preserved
- ✅ ESM-safe import
- ✅ Error stack added to logs
