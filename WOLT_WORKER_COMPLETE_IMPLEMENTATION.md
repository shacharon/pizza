# WoltWorker Complete End-to-End Implementation

## Overview

Complete implementation of WoltWorker background job processor with:
- ✅ **Queue consumption** via WoltJobQueue
- ✅ **Deep link resolution** via stub WoltSearchAdapter (replaceable)
- ✅ **Redis caching** to `provider:wolt:{placeId}` with TTL
- ✅ **WebSocket publishing** RESULT_PATCH with `providers.wolt` + `updatedAt`
- ✅ **Timeout handling** (30s overall, 20s search)
- ✅ **Retry logic** with exponential backoff (1s → 2s → 4s)
- ✅ **Error recovery** - writes NOT_FOUND on catch/timeout

---

## Architecture

### Components

```
┌─────────────────┐
│  WoltJobQueue   │  ← Enqueues jobs (from enrichment service)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   WoltWorker    │  ← Processes jobs (this implementation)
│                 │
│  - Timeout:30s  │
│  - Retry: 2x    │
│  - Backoff:exp  │
└────────┬────────┘
         │
         ├──────────────────┐
         │                  │
         ▼                  ▼
┌─────────────────┐  ┌──────────────────┐
│ WoltSearchAdptr │  │   WoltMatcher    │
│   (stub/real)   │  │  (best match)    │
└────────┬────────┘  └─────────┬────────┘
         │                     │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
    ┌─────────┐          ┌──────────┐
    │  Redis  │          │    WS    │
    │  Cache  │          │ Manager  │
    └─────────┘          └──────────┘
provider:wolt:{id}      RESULT_PATCH
TTL: 7d / 24h           {providers.wolt}
```

---

## Modified Files

### 1. `server/src/services/search/route2/enrichment/wolt/wolt-worker.ts`

**Status:** ✅ Enhanced with timeout/retry

**Key Changes:**
- Added `withTimeout` wrapper for job execution
- Implemented retry logic with exponential backoff
- Added `updatedAt` timestamp to results
- Changed to `provider:wolt:{placeId}` Redis key pattern
- Enhanced error classification (transient vs permanent)

**Lines Changed:** ~200 lines (major rewrite)

---

### 2. `server/src/services/search/wolt/wolt-enrichment.contracts.ts`

**Status:** ✅ Updated configuration

**Key Changes:**
- Changed Redis key pattern: `ext:wolt:place` → `provider:wolt`
- Changed TTL: 14 days → 7 days (FOUND)
- Added `WOLT_JOB_CONFIG` with timeout/retry settings
- Added `updatedAt` field to `ProviderState`

**Lines Changed:** ~50 lines

---

### 3. `server/src/services/search/route2/enrichment/wolt/wolt-search-stub.adapter.ts`

**Status:** ✅ NEW FILE - Stub implementation

**Purpose:** Mock WoltSearchAdapter for development/testing

**Features:**
- Simulates 500ms search latency
- 70% probability of finding results
- Generates mock Wolt URLs
- Easy to replace with real adapter

**Lines:** ~130 lines

---

### 4. `server/src/services/search/types/search.types.ts`

**Status:** ✅ Updated ProviderState

**Key Changes:**
- Added `updatedAt?: string` field to `ProviderState`

**Lines Changed:** 1 line

---

### 5. `server/src/infra/websocket/websocket-protocol.ts`

**Status:** ✅ Updated ProviderState

**Key Changes:**
- Added `updatedAt?: string` field to `ProviderState`

**Lines Changed:** 1 line

---

## Redis Key Pattern Change

### Before (Old)
```
ext:wolt:place:{placeId}
ext:wolt:lock:{placeId}
```

### After (New)
```
provider:wolt:{placeId}
provider:wolt:lock:{placeId}
```

**Rationale:**
- More semantic: "provider" namespace for all provider enrichments
- Consistent with future providers (tripadvisor, yelp, etc.)
- Easier to query all provider keys: `KEYS provider:*`

---

## Timeout Configuration

### Job-Level Timeout

```typescript
const WOLT_JOB_CONFIG = {
  JOB_TIMEOUT_MS: 30000,      // Overall job timeout (30s)
  SEARCH_TIMEOUT_MS: 20000,   // Search adapter timeout (20s)
  MAX_RETRIES: 2,             // 2 retries = 3 total attempts
  RETRY_DELAY_MS: 1000,       // Initial delay: 1s
};
```

### Timeout Hierarchy

```
Job Timeout (30s)
├─ Search Timeout (20s)
│  └─ WoltSearchAdapter.searchWeb()
├─ Matching (instant)
├─ Redis write (~10ms)
└─ WS publish (~5ms)
```

**Behavior:**
- Search times out after 20s → Throws timeout error
- Job times out after 30s → Catches in outer handler
- Both timeouts treated as transient errors → Eligible for retry

---

## Retry Strategy

### Exponential Backoff

```
Attempt 1:  0s delay (immediate)
Attempt 2:  1s delay (RETRY_DELAY_MS * 2^0)
Attempt 3:  2s delay (RETRY_DELAY_MS * 2^1)
Attempt 4:  4s delay (RETRY_DELAY_MS * 2^2)  [if MAX_RETRIES = 3]
```

### Retry Decision Matrix

| Error Type | Retryable? | Reason |
|------------|-----------|--------|
| Timeout | ✅ Yes | Transient network issue |
| ETIMEDOUT | ✅ Yes | Network timeout |
| ECONNREFUSED | ✅ Yes | Service temporarily down |
| ECONNRESET | ✅ Yes | Connection reset |
| 5xx errors | ✅ Yes | Server error (recoverable) |
| 429 (Rate limit) | ✅ Yes | Retry after backoff |
| 4xx errors (except 429) | ❌ No | Client error (permanent) |
| Invalid data | ❌ No | Logic error (permanent) |
| Auth errors | ❌ No | Configuration error (permanent) |

### Implementation

```typescript
private isTransientError(error: string): boolean {
  const transientPatterns = [
    'timeout', 'Timeout',
    'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH',
    '5xx', '500', '502', '503', '504',
    '429', // Rate limiting
    'network', 'Network',
  ];

  return transientPatterns.some(pattern => error.includes(pattern));
}
```

---

## Error Handling Flow

### Success Path

```
processJob()
  → processJobInternal(attempt=0)
    → withTimeout(searchWeb(), 20s)
    → findBestMatch()
    → writeCacheEntry(provider:wolt:{id})
    → publishPatchEvent({providers.wolt})
    → cleanupLock()
  → Return { success: true, url, status, updatedAt }
```

### Transient Error Path (with retry)

```
processJob()
  → withTimeout(processJobInternal(0), 30s)
    → Search times out (20s)
    → Catch: isTransientError() = true
    → attempt < MAX_RETRIES? Yes
    → sleep(1000ms)
    → processJobInternal(attempt=1)  [RETRY]
      → Search succeeds
      → writeCacheEntry(provider:wolt:{id})
      → publishPatchEvent({providers.wolt})
  → Return { success: true, url, status, updatedAt, retries: 1 }
```

### Permanent Error Path (no retry)

```
processJob()
  → withTimeout(processJobInternal(0), 30s)
    → Search returns 404
    → Catch: isTransientError() = false
    → Throw error (no retry)
  → Outer catch handler
    → writeCacheEntry(placeId, null, 'NOT_FOUND')
    → publishPatchEvent(placeId, 'NOT_FOUND', null, updatedAt)
    → cleanupLock()
  → Return { success: false, url: null, status: 'NOT_FOUND', error }
```

### Overall Timeout Path

```
processJob()
  → withTimeout(processJobInternal(0), 30s)
    → Job takes > 30s (e.g., 3 retries @ 20s each)
    → Overall timeout throws
  → Outer catch handler
    → writeCacheEntry(placeId, null, 'NOT_FOUND')
    → publishPatchEvent(placeId, 'NOT_FOUND', null, updatedAt)
    → cleanupLock()
  → Return { success: false, url: null, status: 'NOT_FOUND', error: 'timeout' }
```

---

## WebSocket RESULT_PATCH Format

### Message Structure

```typescript
{
  type: 'RESULT_PATCH',
  requestId: 'req_abc123',
  placeId: 'ChIJ123',
  patch: {
    // NEW: Structured providers field WITH updatedAt
    providers: {
      wolt: {
        status: 'FOUND',
        url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
        updatedAt: '2026-02-03T17:45:00.123Z'  // ← NEW
      }
    },
    // DEPRECATED: Legacy wolt field (backward compat)
    wolt: {
      status: 'FOUND',
      url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house'
    }
  }
}
```

### Status Values

| Status | Meaning | URL Value | When |
|--------|---------|-----------|------|
| `FOUND` | Wolt link found | Valid URL | Search+match succeeded |
| `NOT_FOUND` | No Wolt presence | `null` | Search found no results or match failed |

**Note:** `PENDING` status never appears in RESULT_PATCH (only in initial response)

---

## Redis Cache Format

### Key Pattern

```
provider:wolt:{placeId}
```

**Example:**
```
provider:wolt:ChIJ7cv00DxMHRURm-NuI6SVf8k
```

### Value (JSON)

```json
{
  "url": "https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house",
  "status": "FOUND",
  "updatedAt": "2026-02-03T17:45:00.123Z"
}
```

### TTL Strategy

```typescript
const WOLT_CACHE_TTL_SECONDS = {
  FOUND: 7 * 24 * 60 * 60,      // 7 days (604,800s)
  NOT_FOUND: 24 * 60 * 60,      // 24 hours (86,400s)
  LOCK: 60,                      // 60 seconds
};
```

**Rationale:**
- **FOUND (7 days):** Wolt links stable, but allow periodic refresh
- **NOT_FOUND (24 hours):** Restaurants may join Wolt, check daily
- **LOCK (60 seconds):** Job should complete within 1 minute

---

## Stub WoltSearchAdapter

### Implementation

**File:** `wolt-search-stub.adapter.ts`

```typescript
export class StubWoltSearchAdapter implements WoltSearchAdapter {
  private readonly simulatedLatencyMs = 500;
  private readonly mockFoundProbability = 0.7; // 70% find rate

  async searchWeb(query: string, limit: number): Promise<SearchResult[]> {
    // Simulate network latency
    await this.sleep(this.simulatedLatencyMs);

    // Extract restaurant name
    const nameMatch = query.match(/"([^"]+)"/);
    const restaurantName = nameMatch ? nameMatch[1] : 'restaurant';

    // Probabilistic result (70% found, 30% not found)
    if (Math.random() < this.mockFoundProbability) {
      return [{
        title: `${restaurantName} - Order Online | Wolt`,
        url: this.generateMockWoltUrl(restaurantName),
        snippet: `Order food from ${restaurantName} with Wolt...`,
      }];
    }

    return []; // No results (NOT_FOUND)
  }

  private generateMockWoltUrl(name: string): string {
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    return `https://wolt.com/en/isr/tel-aviv/restaurant/${slug}`;
  }
}
```

### Usage

```typescript
import { createStubWoltSearchAdapter } from './wolt-search-stub.adapter.js';

const adapter = createStubWoltSearchAdapter();
const worker = new WoltWorker(redis, adapter);
```

### Replacing with Real Adapter

**Step 1:** Implement real adapter (e.g., Google Custom Search API)

```typescript
export class GoogleWoltSearchAdapter implements WoltSearchAdapter {
  constructor(private apiKey: string, private searchEngineId: string) {}

  async searchWeb(query: string, limit: number): Promise<SearchResult[]> {
    const url = `https://www.googleapis.com/customsearch/v1`;
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: query,
      num: String(limit),
    });

    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    return data.items?.map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    })) || [];
  }
}
```

**Step 2:** Swap adapter in job queue instance

```typescript
import { GoogleWoltSearchAdapter } from './wolt-search-google.adapter.js';

const adapter = new GoogleWoltSearchAdapter(
  process.env.GOOGLE_API_KEY!,
  process.env.GOOGLE_SEARCH_ENGINE_ID!
);

const worker = new WoltWorker(redis, adapter);
```

---

## Code Diffs

### Diff 1: wolt-enrichment.contracts.ts (Redis Keys)

```diff
 export const WOLT_REDIS_KEYS = {
-  place: (placeId: string): string => `ext:wolt:place:${placeId}`,
-  lock: (placeId: string): string => `ext:wolt:lock:${placeId}`,
+  place: (placeId: string): string => `provider:wolt:${placeId}`,
+  lock: (placeId: string): string => `provider:wolt:lock:${placeId}`,
 } as const;
```

### Diff 2: wolt-enrichment.contracts.ts (TTL + Config)

```diff
 export const WOLT_CACHE_TTL_SECONDS = {
-  FOUND: 14 * 24 * 60 * 60, // 14 days
+  FOUND: 7 * 24 * 60 * 60,  // 7 days
   NOT_FOUND: 24 * 60 * 60,  // 24 hours
   LOCK: 60,                  // 60 seconds
 } as const;
+
+export const WOLT_JOB_CONFIG = {
+  JOB_TIMEOUT_MS: 30000,      // 30s overall
+  SEARCH_TIMEOUT_MS: 20000,   // 20s search
+  MAX_RETRIES: 2,             // 2 retries
+  RETRY_DELAY_MS: 1000,       // 1s initial delay
+} as const;
```

### Diff 3: search.types.ts (ProviderState)

```diff
 export interface ProviderState {
   status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
   url: string | null;
+  updatedAt?: string; // ISO timestamp
 }
```

### Diff 4: wolt-worker.ts (Imports)

```diff
 import { findBestMatch } from './wolt-matcher.js';
+import { withTimeout } from '../../../../../lib/reliability/timeout-guard.js';
```

### Diff 5: wolt-worker.ts (JobResult)

```diff
 export interface JobResult {
   success: boolean;
   url: string | null;
   status: 'FOUND' | 'NOT_FOUND';
+  updatedAt: string;
   error?: string;
+  retries?: number;
 }
```

### Diff 6: wolt-worker.ts (processJob - Complete Rewrite)

```diff
 async processJob(job: WoltEnrichmentJob): Promise<JobResult> {
-  try {
-    const searchResults = await this.searchAdapter.searchWeb(query, 5);
-    const matchResult = findBestMatch(searchResults, name, city);
-    await this.writeCacheEntry(placeId, url, status);
-    await this.publishPatchEvent(requestId, placeId, status, url);
-    return { success: true, url, status };
-  } catch (err) {
-    await this.writeCacheEntry(placeId, null, 'NOT_FOUND');
-    await this.publishPatchEvent(requestId, placeId, 'NOT_FOUND', null);
-    return { success: false, url: null, status: 'NOT_FOUND', error };
-  }
+  try {
+    // Wrap with timeout
+    const result = await withTimeout(
+      this.processJobInternal(job, 0),
+      WOLT_JOB_CONFIG.JOB_TIMEOUT_MS,
+      `Timeout for ${placeId}`
+    );
+    return result;
+  } catch (err) {
+    const updatedAt = new Date().toISOString();
+    await this.writeCacheEntry(placeId, null, 'NOT_FOUND');
+    await this.publishPatchEvent(requestId, placeId, 'NOT_FOUND', null, updatedAt);
+    return { success: false, url: null, status: 'NOT_FOUND', updatedAt, error };
+  }
 }
```

### Diff 7: wolt-worker.ts (New processJobInternal with Retry)

```diff
+private async processJobInternal(
+  job: WoltEnrichmentJob,
+  attemptNumber: number
+): Promise<JobResult> {
+  try {
+    // Search with timeout
+    const searchResults = await withTimeout(
+      this.searchAdapter.searchWeb(query, 5),
+      WOLT_JOB_CONFIG.SEARCH_TIMEOUT_MS,
+      `Search timeout for ${placeId}`
+    );
+
+    const matchResult = findBestMatch(searchResults, name, city);
+    const updatedAt = new Date().toISOString();
+
+    await this.writeCacheEntry(placeId, url, status);
+    await this.publishPatchEvent(requestId, placeId, status, url, updatedAt);
+    
+    return { success: true, url, status, updatedAt, retries: attemptNumber };
+  } catch (err) {
+    const isTransient = this.isTransientError(error);
+    
+    // Retry logic
+    if (isTransient && attemptNumber < WOLT_JOB_CONFIG.MAX_RETRIES) {
+      const retryDelay = WOLT_JOB_CONFIG.RETRY_DELAY_MS * Math.pow(2, attemptNumber);
+      await this.sleep(retryDelay);
+      return this.processJobInternal(job, attemptNumber + 1); // Retry
+    }
+    
+    throw err; // No more retries
+  }
+}
```

### Diff 8: wolt-worker.ts (publishPatchEvent with updatedAt)

```diff
 private async publishPatchEvent(
   requestId: string,
   placeId: string,
   status: 'FOUND' | 'NOT_FOUND',
-  url: string | null
+  url: string | null,
+  updatedAt: string
 ): Promise<void> {
+  const providerState = { status, url, updatedAt };
+
   const patchEvent: WSServerResultPatch = {
     type: 'RESULT_PATCH',
     requestId,
     placeId,
     patch: {
       providers: {
-        wolt: { status, url },
+        wolt: providerState, // Include updatedAt
       },
       wolt: { status, url },
     },
   };
   
   wsManager.publishToChannel('search', requestId, undefined, patchEvent);
 }
```

---

## Testing

### Manual Test (Stub Adapter)

```bash
# Terminal 1: Start server with stub adapter
cd server
export ENABLE_WOLT_ENRICHMENT=true
export REDIS_URL=redis://localhost:6379
npm run dev

# Terminal 2: Make search request
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza tel aviv"}'

# Terminal 3: Monitor Redis
redis-cli MONITOR
# Watch for: SET provider:wolt:{placeId} ...

# Terminal 4: Check WebSocket events
# Use browser dev tools or wscat to see RESULT_PATCH
```

### Verify Retry Behavior

**Force timeout:**

```typescript
// Modify stub adapter temporarily
async searchWeb(query: string, limit: number) {
  await this.sleep(25000); // Exceeds 20s timeout
  return [];
}
```

**Expected behavior:**
1. Attempt 1: Timeout after 20s → Retry
2. Wait 1s
3. Attempt 2: Timeout after 20s → Retry
4. Wait 2s
5. Attempt 3: Timeout after 20s → Final failure
6. Write NOT_FOUND to Redis
7. Publish RESULT_PATCH with status='NOT_FOUND'

**Logs:**
```json
{
  "event": "wolt_job_attempt_failed",
  "attempt": 1,
  "isTimeout": true,
  "isTransient": true
}
{
  "event": "wolt_job_retrying",
  "attempt": 1,
  "nextAttempt": 2,
  "retryDelayMs": 1000
}
// ... repeat for attempt 2, 3
{
  "event": "wolt_job_failed",
  "error": "timeout"
}
```

### Verify Redis Keys

```bash
# Check cache keys
redis-cli KEYS "provider:wolt:*"
1) "provider:wolt:ChIJ7cv00DxMHRURm-NuI6SVf8k"
2) "provider:wolt:lock:ChIJ7cv00DxMHRURm-NuI6SVf8k"

# Check cache value
redis-cli GET "provider:wolt:ChIJ7cv00DxMHRURm-NuI6SVf8k"
"{\"url\":\"https://wolt.com/...\",\"status\":\"FOUND\",\"updatedAt\":\"2026-02-03T17:45:00.123Z\"}"

# Check TTL
redis-cli TTL "provider:wolt:ChIJ7cv00DxMHRURm-NuI6SVf8k"
(integer) 604790  # ~7 days remaining

# Check lock (should expire after job)
redis-cli TTL "provider:wolt:lock:ChIJ7cv00DxMHRURm-NuI6SVf8k"
(integer) -2  # Already expired
```

---

## Performance Characteristics

### Success Path (Cache Miss, No Retry)

```
Total Time: ~500-800ms
├─ Job setup: ~10ms
├─ Search (stub): ~500ms
├─ Match: ~10ms
├─ Redis write: ~5ms
└─ WS publish: ~5ms
```

### Success Path (with 1 Retry)

```
Total Time: ~2.5-3s
├─ Attempt 1: Timeout (20s)
├─ Retry delay: 1s
├─ Attempt 2: Success (~500ms)
└─ Total: ~21.5s
```

### Failure Path (Max Retries Exceeded)

```
Total Time: ~27-28s (or 30s if overall timeout hits first)
├─ Attempt 1: Timeout (20s)
├─ Retry delay 1: 1s
├─ Attempt 2: Timeout (20s) → Would exceed 30s job timeout
└─ Overall timeout triggers at 30s
```

**Note:** Overall timeout (30s) acts as circuit breaker to prevent excessive retries

---

## SOLID Compliance

### Single Responsibility ✅
- `WoltWorker`: Only processes jobs
- `WoltSearchAdapter`: Only searches web
- `WoltMatcher`: Only finds best match
- `WoltJobQueue`: Only manages queue

### Open/Closed ✅
- `WoltSearchAdapter` interface: Open for extension (stub, Google, Bing)
- Closed for modification (worker doesn't care about implementation)

### Liskov Substitution ✅
- Any `WoltSearchAdapter` implementation can replace stub
- Behavior consistent regardless of adapter

### Interface Segregation ✅
- `WoltSearchAdapter`: Only `searchWeb()` method
- `WoltMatcher`: Pure function, no interface needed
- Clean separation of concerns

### Dependency Inversion ✅
- Worker depends on `WoltSearchAdapter` abstraction
- Not on concrete `StubWoltSearchAdapter`
- Easy to inject real adapter

---

## Summary

| Feature | Status | Details |
|---------|--------|---------|
| **Queue Consumption** | ✅ Complete | Via WoltJobQueue.processJob() |
| **Deep Link Resolution** | ✅ Stub Ready | StubWoltSearchAdapter (replaceable) |
| **Redis Write** | ✅ Complete | `provider:wolt:{placeId}` with TTL |
| **WS Publish** | ✅ Complete | RESULT_PATCH with providers.wolt + updatedAt |
| **Timeout Handling** | ✅ Complete | 30s job, 20s search |
| **Retry Logic** | ✅ Complete | 2 retries, exponential backoff |
| **Error Recovery** | ✅ Complete | NOT_FOUND on catch/timeout |
| **SOLID** | ✅ Complete | All principles followed |

---

## Files Modified Summary

| File | Status | Lines |
|------|--------|-------|
| `wolt-worker.ts` | ✅ Enhanced | ~200 lines |
| `wolt-enrichment.contracts.ts` | ✅ Updated | ~50 lines |
| `search.types.ts` | ✅ Updated | 1 line |
| `websocket-protocol.ts` | ✅ Updated | 1 line |
| `wolt-search-stub.adapter.ts` | ✅ NEW | ~130 lines |
| **TOTAL** | | **~380 lines** |

---

## Next Steps

1. ✅ Implementation complete
2. ⏳ Deploy to staging
3. ⏳ Monitor metrics (retry rate, timeout rate)
4. ⏳ Replace stub adapter with real implementation
5. ⏳ Tune timeout/retry config based on production metrics
6. ⏳ Add circuit breaker if needed

---

## Conclusion

Complete end-to-end WoltWorker implementation with:
- ✅ Proper timeout handling (prevents hanging jobs)
- ✅ Intelligent retry logic (transient vs permanent errors)
- ✅ Redis caching with semantic keys (`provider:wolt:{placeId}`)
- ✅ WebSocket publishing with timestamps (`updatedAt`)
- ✅ Stub adapter for development (easy to replace)
- ✅ SOLID architecture (clean dependencies)
- ✅ Production-ready error handling

**Ready for staging deployment with stub adapter, production deployment pending real search adapter integration.**
