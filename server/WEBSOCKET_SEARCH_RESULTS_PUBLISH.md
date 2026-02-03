# WebSocket Search Results Publishing - Bug Fix

**Date:** 2026-02-03  
**Status:** ✅ COMPLETE

---

## Problem Statement

**Bug:** WS search channel never publishes final results, even though JobStore has `hasResult=true` and `getResult` shows `resultCount=20`.

**Symptoms:**

- Logs show `ws_subscribe_ack` for `channel=search`
- No WS publish for actual results (only assistant messages published)
- Frontend receives subscription acknowledgment but never gets the search results data

**Root Cause:** The Route2 orchestrator only published a `status: 'completed'` message to WebSocket, but never sent the actual search results array.

---

## Solution Overview

Added `SEARCH_RESULTS` WebSocket event type that publishes the full results array to subscribed clients for BOTH cache and google_api paths.

**Changes:**

1. Added `WSServerSearchResults` message type to WS protocol
2. Modified Google Maps stage handlers to return `servedFrom` metadata
3. Propagated `servedFrom` through the pipeline
4. Added structured logs before/after WS publish
5. Published `SEARCH_RESULTS` event in `buildFinalResponse`

---

## Modified Files (8 files)

### 1. `server/src/infra/websocket/websocket-protocol.ts`

**Added new WS message type:**

```typescript
/**
 * WebSocket event for publishing final search results
 * Sent when search completes (both cache and API paths)
 */
export interface WSServerSearchResults {
  type: 'SEARCH_RESULTS';
  requestId: string;
  resultCount: number;
  results: any[]; // Full restaurant result array
  servedFrom: 'cache' | 'google_api';
}

export type WSServerMessage =
  | ... (existing types)
  | WSServerSearchResults; // ← NEW
```

**Purpose:** Defines the contract for publishing search results to WebSocket subscribers.

---

### 2. `server/src/services/search/route2/types.ts`

**Added `servedFrom` to GoogleMapsResult:**

```typescript
export interface GoogleMapsResult {
  results: any[];
  providerMethod: "textSearch" | "nearbySearch" | "landmarkPlan";
  durationMs: number;
  servedFrom?: "cache" | "google_api"; // ← NEW
}
```

**Purpose:** Track whether results came from cache or API for observability.

---

### 3. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

**Modified return value:**

```typescript
// Before:
return results;

// After:
const servedFrom = fromCache ? ("cache" as const) : ("google_api" as const);
return { results, servedFrom };
```

**Purpose:** Return structured object with `servedFrom` metadata instead of just array.

---

### 4. `server/src/services/search/route2/stages/google-maps/nearby-search.handler.ts`

**Modified return value:**

```typescript
// Before:
return results;

// After:
const servedFrom = fromCache ? ("cache" as const) : ("google_api" as const);
return { results, servedFrom };
```

**Purpose:** Return structured object with `servedFrom` metadata instead of just array.

---

### 5. `server/src/services/search/route2/stages/google-maps/landmark-plan.handler.ts`

**Modified return value:**

```typescript
// Before:
return results;

// After:
const servedFrom = fromCache ? ("cache" as const) : ("google_api" as const);
return { results, servedFrom };
```

**Purpose:** Return structured object with `servedFrom` metadata instead of just array.

---

### 6. `server/src/services/search/route2/stages/google-maps.stage.ts`

**Modified to collect and propagate `servedFrom`:**

```typescript
// Before:
let results: any[] = [];
switch (mapping.providerMethod) {
  case "textSearch":
    results = await executeTextSearch(mapping, ctx);
    break;
  // ...
}
return { results, providerMethod, durationMs };

// After:
let results: any[] = [];
let servedFrom: "cache" | "google_api" | undefined;
switch (mapping.providerMethod) {
  case "textSearch": {
    const result = await executeTextSearch(mapping, ctx);
    results = result.results;
    servedFrom = result.servedFrom;
    break;
  }
  // ... (same for nearbySearch, landmarkPlan)
}
return { results, providerMethod, durationMs, servedFrom };
```

**Purpose:** Aggregate `servedFrom` from handlers and include in stage output.

---

### 7. `server/src/services/search/route2/orchestrator.response.ts`

**Modified function signature:**

```typescript
export async function buildFinalResponse(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  finalResults: any[],
  filtersForPostFilter: any,
  ctx: Route2Context,
  wsManager: WebSocketManager,
  servedFrom?: "cache" | "google_api" // ← NEW parameter
): Promise<SearchResponse>;
```

**Added WebSocket publish with structured logs:**

```typescript
// Publish final search results to WebSocket channel
const subscriberCount =
  (wsManager as any).subscriptionManager?.getSubscribers(`search:${requestId}`)
    ?.size || 0;

// LOG 1: Before publish (ATTEMPT)
logger.info(
  {
    requestId,
    event: "search_ws_publish_attempt",
    channel: "search",
    payloadType: "SEARCH_RESULTS",
    resultCount: finalResults.length,
    servedFrom: servedFrom || "unknown",
    subscriberCount,
  },
  "[ROUTE2] Publishing search results to WebSocket"
);

// PUBLISH
wsManager.publishToChannel("search", requestId, sessionId, {
  type: "SEARCH_RESULTS",
  requestId,
  resultCount: finalResults.length,
  results: finalResults,
  servedFrom: servedFrom || "google_api",
});

// LOG 2: After publish (PUBLISHED)
logger.info(
  {
    requestId,
    event: "search_ws_published",
    channel: "search",
    payloadType: "SEARCH_RESULTS",
    resultCount: finalResults.length,
    servedFrom: servedFrom || "unknown",
    subscriberCount,
  },
  "[ROUTE2] Search results published to WebSocket"
);
```

**Purpose:** Publish actual results to WebSocket subscribers with observability logs.

---

### 8. `server/src/services/search/route2/route2.orchestrator.ts`

**Pass `servedFrom` to `buildFinalResponse`:**

```typescript
// STAGE 7: BUILD RESPONSE
return await buildFinalResponse(
  request,
  gateResult,
  intentDecision,
  mapping,
  finalResults,
  filtersForPostFilter,
  ctx,
  wsManager,
  googleResult.servedFrom // ← NEW argument
);
```

**Purpose:** Thread `servedFrom` metadata through to response builder.

---

## Exact Publish Point

**File:** `server/src/services/search/route2/orchestrator.response.ts`  
**Lines:** ~172-200 (after `endStage`, before final return)  
**Payload Type:** `SEARCH_RESULTS` (new WS message type)

**Publish Call:**

```typescript
wsManager.publishToChannel("search", requestId, sessionId, {
  type: "SEARCH_RESULTS",
  requestId,
  resultCount: finalResults.length,
  results: finalResults, // ← Full results array
  servedFrom: servedFrom || "google_api",
});
```

---

## Log Examples

### Example 1: Cache Hit (servedFrom='cache')

```json
{
  "requestId": "req-1234-abcd",
  "event": "search_ws_publish_attempt",
  "channel": "search",
  "payloadType": "SEARCH_RESULTS",
  "resultCount": 20,
  "servedFrom": "cache",
  "subscriberCount": 1
}

{
  "requestId": "req-1234-abcd",
  "event": "search_ws_published",
  "channel": "search",
  "payloadType": "SEARCH_RESULTS",
  "resultCount": 20,
  "servedFrom": "cache",
  "subscriberCount": 1
}
```

### Example 2: API Call (servedFrom='google_api')

```json
{
  "requestId": "req-5678-efgh",
  "event": "search_ws_publish_attempt",
  "channel": "search",
  "payloadType": "SEARCH_RESULTS",
  "resultCount": 15,
  "servedFrom": "google_api",
  "subscriberCount": 2
}

{
  "requestId": "req-5678-efgh",
  "event": "search_ws_published",
  "channel": "search",
  "payloadType": "SEARCH_RESULTS",
  "resultCount": 15,
  "servedFrom": "google_api",
  "subscriberCount": 2
}
```

### Example 3: No Subscribers

```json
{
  "requestId": "req-9999-zzzz",
  "event": "search_ws_publish_attempt",
  "channel": "search",
  "payloadType": "SEARCH_RESULTS",
  "resultCount": 8,
  "servedFrom": "google_api",
  "subscriberCount": 0
}

{
  "requestId": "req-9999-zzzz",
  "event": "search_ws_published",
  "channel": "search",
  "payloadType": "SEARCH_RESULTS",
  "resultCount": 8,
  "servedFrom": "google_api",
  "subscriberCount": 0
}
```

---

## Coverage

✅ **BOTH cases covered:**

| Scenario          | servedFrom                  | Publish? | Log Events                                         |
| ----------------- | --------------------------- | -------- | -------------------------------------------------- |
| Cache hit (L1/L2) | `'cache'`                   | ✅ Yes   | `search_ws_publish_attempt`, `search_ws_published` |
| Google API call   | `'google_api'`              | ✅ Yes   | `search_ws_publish_attempt`, `search_ws_published` |
| Sync mode         | `'cache'` or `'google_api'` | ✅ Yes   | Same                                               |
| Async mode        | `'cache'` or `'google_api'` | ✅ Yes   | Same                                               |

**All execution paths go through `buildFinalResponse` → All paths now publish results.**

---

## Minimal Diff Summary

**Lines Added:** ~45  
**Lines Changed:** ~15  
**Lines Removed:** 0

**Changes by category:**

1. **Protocol extension:** 1 new interface (`WSServerSearchResults`)
2. **Type enrichment:** 1 field added (`servedFrom` in `GoogleMapsResult`)
3. **Handler updates:** 3 handlers now return `{ results, servedFrom }`
4. **Stage aggregation:** 1 stage collects `servedFrom` from handlers
5. **Response builder:** 1 function receives `servedFrom`, publishes results with 2 logs
6. **Orchestrator:** 1 call site passes `servedFrom` to response builder

**No behavior changes** except:

- WebSocket subscribers now receive `SEARCH_RESULTS` event with full results
- Two new structured log events for observability

---

## Testing Verification

### Test Scenario 1: Subscribe → Search → Receive Results

**Steps:**

1. Frontend: Subscribe to `channel='search'`, `requestId='req-test-1'`
2. Frontend: Wait for `sub_ack`
3. Backend: Execute search (cache or API)
4. Frontend: Receive `SEARCH_RESULTS` event with `resultCount` and `results[]`

**Expected Logs:**

```
ws_subscribe_ack { channel: 'search', requestId: 'req-test-1', pending: false }
search_ws_publish_attempt { event: 'search_ws_publish_attempt', resultCount: 20, servedFrom: 'cache', subscriberCount: 1 }
search_ws_published { event: 'search_ws_published', resultCount: 20, servedFrom: 'cache', subscriberCount: 1 }
```

### Test Scenario 2: Cache Hit Path

**Query:** Search that hits L2 cache  
**Expected:** `servedFrom='cache'` in both log and WS payload

**Verification:**

```bash
grep "search_ws_published.*cache" logs/server.log
```

### Test Scenario 3: API Path

**Query:** New search (cache miss)  
**Expected:** `servedFrom='google_api'` in both log and WS payload

**Verification:**

```bash
grep "search_ws_published.*google_api" logs/server.log
```

---

## Constraints Met

✅ **Minimal diff:** Only touched necessary files, no refactoring  
✅ **No behavior change:** Existing HTTP responses unchanged  
✅ **Both paths covered:** Cache and API both publish  
✅ **Structured logs:** Two events with all requested fields  
✅ **Protocol extension:** New message type properly typed

---

## Summary

**Modified:** 8 files  
**Publish point:** `orchestrator.response.ts` (after response build, before return)  
**Payload type:** `SEARCH_RESULTS` (new WS message type)  
**Log events:** `search_ws_publish_attempt`, `search_ws_published`  
**Fields logged:** `requestId`, `channel`, `payloadType`, `resultCount`, `servedFrom`, `subscriberCount`

**Result:** WebSocket search channel now publishes final results for all execution paths (sync, async, cache, API).
