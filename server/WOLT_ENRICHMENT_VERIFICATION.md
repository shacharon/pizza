# Wolt Enrichment Flow - Backend Verification

**Date**: 2026-02-03  
**Status**: ✅ VERIFIED & FIXED

## Verification Summary

Scanned backend Wolt enrichment flow and verified:

1. ✅ Every restaurant result includes `wolt:{status,url?}` in initial DTO
2. ✅ Worker writes wolt status to Redis on success AND catch/failure
3. ✅ Worker publishes RESULT_PATCH on success AND catch/failure
4. ✅ Minimal logs added: `wolt_patch_publish_attempt` / `wolt_patch_published`

---

## Issues Found & Fixed

### 1. ❌ Initial DTO Missing Wolt Field

**Issue**: `result-mapper.ts` did not include `wolt` field in base restaurant DTO  
**Impact**: Restaurants without enrichment enabled had inconsistent schema  
**Fix**: Added default `wolt: { status: 'PENDING', url: null }` to all results

**File**: `server/src/services/search/route2/stages/google-maps/result-mapper.ts`

```typescript
// ADDED: Wolt enrichment placeholder (will be updated by enrichment service if enabled)
wolt: {
  status: 'PENDING' as const,
  url: null
}
```

### 2. ❌ Missing Log Before Publish

**Issue**: Worker published RESULT_PATCH but lacked `wolt_patch_publish_attempt` log  
**Impact**: Difficult to debug publish failures or track publish attempts  
**Fix**: Added `wolt_patch_publish_attempt` log before `publishToChannel` call

**File**: `server/src/services/search/route2/enrichment/wolt/wolt-worker.ts`

```typescript
logger.info(
  {
    event: "wolt_patch_publish_attempt",
    requestId,
    placeId,
    status,
  },
  "[WoltWorker] Attempting to publish RESULT_PATCH"
);

// ... publishToChannel call ...

logger.info(
  {
    event: "wolt_patch_published",
    requestId,
    placeId,
    status,
  },
  "[WoltWorker] RESULT_PATCH published successfully"
);
```

### 3. ✅ Fallback Logs Updated

**File**: `server/src/services/search/route2/enrichment/wolt/wolt-job-queue.ts`

Updated both safety guard paths to use same log pattern:

- Worker unavailable fallback (line ~148)
- Job processing error fallback (line ~201)

Both now emit:

1. `wolt_patch_publish_attempt` (before publish)
2. `wolt_patch_published` (after publish)

---

## Verified Flow

### 1. Initial Restaurant DTO (Google Maps Stage)

**Location**: `server/src/services/search/route2/stages/google-maps/result-mapper.ts`

Every restaurant from Google Places API now includes:

```typescript
{
  placeId: string,
  name: string,
  // ... other fields
  wolt: {
    status: 'PENDING',
    url: null
  }
}
```

### 2. Wolt Enrichment Service

**Location**: `server/src/services/search/route2/enrichment/wolt/wolt-enrichment.service.ts`

Called from orchestrator (line 349 in `route2.orchestrator.ts`):

```typescript
await enrichWithWoltLinks(finalResults, requestId, cityText, ctx);
```

For each restaurant:

1. **Cache HIT**: Updates `wolt.status` and `wolt.url` from Redis cache
2. **Cache MISS**:
   - Keeps `wolt.status = 'PENDING'`
   - Attempts to acquire lock (Redis SET NX)
   - If lock acquired: enqueues background job
   - If lock held: skips (another worker handling it)

### 3. Background Worker Processing

**Location**: `server/src/services/search/route2/enrichment/wolt/wolt-worker.ts`

On job execution:

#### Success Path (lines 100-172)

1. Search for Wolt restaurant page
2. Match best result
3. **Write to Redis cache** (lines 149)
   ```typescript
   await this.writeCacheEntry(placeId, url, status);
   ```
4. **Publish RESULT_PATCH** (lines 152)
   ```typescript
   logger.info({ event: 'wolt_patch_publish_attempt', ... });
   await this.publishPatchEvent(requestId, placeId, status, url);
   logger.info({ event: 'wolt_patch_published', ... });
   ```
5. Clean up lock

#### Failure Path (lines 172-208)

1. Catch error
2. **Write NOT_FOUND to Redis** (line 187)
   ```typescript
   await this.writeCacheEntry(placeId, null, "NOT_FOUND");
   ```
3. **Publish RESULT_PATCH with NOT_FOUND** (line 188)
   ```typescript
   logger.info({ event: 'wolt_patch_publish_attempt', ... });
   await this.publishPatchEvent(requestId, placeId, 'NOT_FOUND', null);
   logger.info({ event: 'wolt_patch_published', ... });
   ```
4. Clean up lock

### 4. Job Queue Safety Guards

**Location**: `server/src/services/search/route2/enrichment/wolt/wolt-job-queue.ts`

Two additional safety paths ensure RESULT_PATCH is published even on catastrophic failures:

#### Guard 1: Worker Unavailable (lines 148-184)

If Redis fails or worker can't initialize:

- Publishes NOT_FOUND patch as fallback
- Ensures frontend doesn't stay in PENDING state

#### Guard 2: Job Processing Error (lines 201-239)

If unexpected error before worker.processJob completes:

- Publishes emergency NOT_FOUND patch
- Handles edge cases not caught by worker error handler

Both guards now use consistent logging:

```typescript
logger.info({ event: 'wolt_patch_publish_attempt', reason: '...', ... });
// ... publish
logger.info({ event: 'wolt_patch_published', reason: '...', ... });
```

---

## Log Events Reference

### Structured Log Events

All logs use structured format with `event` field for filtering:

| Event                        | Level | When           | Purpose                    |
| ---------------------------- | ----- | -------------- | -------------------------- |
| `wolt_patch_publish_attempt` | info  | Before publish | Track publish attempts     |
| `wolt_patch_published`       | info  | After publish  | Confirm successful publish |
| `wolt_cache_hit`             | debug | Cache hit      | Observability              |
| `wolt_cache_miss`            | debug | Cache miss     | Observability              |
| `wolt_lock_acquired`         | debug | Lock acquired  | Observability              |
| `wolt_lock_skipped`          | debug | Lock held      | Prevent duplicate work     |
| `wolt_job_enqueued`          | info  | Job enqueued   | Track background jobs      |
| `wolt_job_completed`         | info  | Job success    | Track completions          |
| `wolt_job_failed`            | error | Job failure    | Track failures             |

### Log Filtering Examples

```bash
# Track all publish attempts
grep wolt_patch_publish_attempt server.log

# Track all successful publishes
grep wolt_patch_published server.log

# Track failures
grep wolt_job_failed server.log

# Full enrichment flow for specific request
grep "requestId.*abc123" server.log | grep wolt
```

---

## WebSocket Protocol

### RESULT_PATCH Message Schema

**Location**: `server/src/infra/websocket/websocket-protocol.ts`

```typescript
export interface WSServerResultPatch {
  type: "RESULT_PATCH";
  requestId: string;
  placeId: string;
  patch: {
    wolt?: {
      status: "FOUND" | "NOT_FOUND";
      url: string | null;
    };
  };
}
```

**Published to**: `search` channel  
**Client matching**: By `placeId`  
**Update behavior**: Merge `patch.wolt` into existing `restaurant.wolt`

---

## Data Contracts

### Redis Keys

**Location**: `server/src/services/search/wolt/wolt-enrichment.contracts.ts`

```typescript
WOLT_REDIS_KEYS = {
  place: (placeId: string) => `ext:wolt:place:${placeId}`,
  lock: (placeId: string) => `ext:wolt:lock:${placeId}`,
};
```

### TTL Values

```typescript
WOLT_CACHE_TTL_SECONDS = {
  FOUND: 14 * 24 * 60 * 60, // 14 days
  NOT_FOUND: 24 * 60 * 60, // 24 hours
  LOCK: 60, // 60 seconds
};
```

### Wolt Enrichment Status

```typescript
type WoltEnrichmentStatus = "FOUND" | "NOT_FOUND" | "PENDING";

interface WoltEnrichment {
  status: WoltEnrichmentStatus;
  url: string | null;
}
```

---

## Acceptance Criteria ✅

- [x] **Initial DTO always includes wolt field**  
      Fixed in `result-mapper.ts` - every restaurant now has `wolt: { status: 'PENDING', url: null }` by default

- [x] **Worker writes to Redis on success**  
      Verified in `wolt-worker.ts` line 149

- [x] **Worker writes to Redis on failure**  
      Verified in `wolt-worker.ts` line 187

- [x] **Worker publishes RESULT_PATCH on success**  
      Verified in `wolt-worker.ts` line 152

- [x] **Worker publishes RESULT_PATCH on failure**  
      Verified in `wolt-worker.ts` line 188

- [x] **Minimal logs added**
  - `wolt_patch_publish_attempt` - Added before publish (info level)
  - `wolt_patch_published` - Added after publish (info level)

---

## Testing Checklist

### Unit Tests

- [ ] Test `mapGooglePlaceToResult` includes wolt field
- [ ] Test worker publishes on success path
- [ ] Test worker publishes on catch/failure path
- [ ] Test job queue fallback publishes

### Integration Tests

- [ ] Test end-to-end enrichment flow (cache miss → job → patch)
- [ ] Test cache hit path (no job triggered)
- [ ] Test Redis failure (fallback to NOT_FOUND)
- [ ] Test WebSocket patch delivery

### Log Verification

- [ ] Confirm `wolt_patch_publish_attempt` appears before publish
- [ ] Confirm `wolt_patch_published` appears after publish
- [ ] Confirm logs include requestId, placeId, status

---

## Files Modified

1. `server/src/services/search/route2/stages/google-maps/result-mapper.ts`

   - Added default `wolt` field to all restaurant results

2. `server/src/services/search/route2/enrichment/wolt/wolt-worker.ts`

   - Added `wolt_patch_publish_attempt` log before publish
   - Updated `wolt_patch_published` log message

3. `server/src/services/search/route2/enrichment/wolt/wolt-job-queue.ts`
   - Added `wolt_patch_publish_attempt` log to worker unavailable fallback
   - Added `wolt_patch_publish_attempt` log to job processing error fallback
   - Updated both fallback paths to use consistent log pattern

---

## No Changes Required

The following were already correct:

- ✅ Worker writes to Redis on both success and failure
- ✅ Worker publishes RESULT_PATCH on both success and failure
- ✅ WebSocket protocol includes WSServerResultPatch type
- ✅ Job queue has safety guards for catastrophic failures
- ✅ Anti-thrash lock prevents duplicate parallel enrichment jobs

---

## Related Documentation

- `server/src/services/search/wolt/wolt-enrichment.contracts.ts` - Full data contract specification
- `server/WEBSOCKET_SEARCH_RESULTS_PUBLISH.md` - WebSocket publish patterns
- `server/WOLT_INTEGRATION_VERIFICATION.md` - Previous verification document
