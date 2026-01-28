# Async Search Flow - Fixed ✅

## Problem (CRITICAL BUG - RESOLVED)
Clients were getting stuck with "pending" results when using `mode=async` because:
- **ROOT CAUSE**: The async pipeline was still tied to the HTTP request lifecycle. When the 202 response was sent, the request was considered "finished" and any request-scoped AbortSignal was cancelled, causing the pipeline to abort mid-execution.
- Store stayed PENDING forever because `setDone()`/`setFailed()` were never called
- Pipeline logs showed stages starting but never completing
- No reliable polling endpoint
- Store transitions weren't logged properly
- WebSocket events didn't include resultCount

## Solution

### CRITICAL FIX: Detached Async Execution

Created `runAsyncSearch()` helper that executes the pipeline in a **completely detached context**:

1. **No request-scoped resources**: Creates new AbortController NOT tied to HTTP request
2. **Independent timeout**: 30-second timeout managed by the async job itself
3. **Complete lifecycle management**: Always calls `setDone()` or `setFailed()` in try/catch/finally
4. **Proper cleanup**: Clears timeout in finally block

**Key code structure:**
```typescript
async function runAsyncSearch(params) {
  const abortController = new AbortController(); // NEW, detached
  const timeoutId = setTimeout(() => abortController.abort(), 30000);
  
  try {
    const detachedContext = { requestId, llmProvider, ... }; // NO req/res
    const response = await searchRoute2(query, detachedContext);
    searchAsyncStore.setDone(requestId, response, resultCount);
    // ... publish WS event
  } catch (err) {
    searchAsyncStore.setFailed(requestId, code, message);
    // ... publish WS error
  } finally {
    clearTimeout(timeoutId); // Always cleanup
  }
}
```

### 1. Store Status Naming (searchAsync.store.ts)
- Changed status values: `"running"` → `"PENDING"`, `"done"` → `"DONE"`, `"failed"` → `"FAILED"`
- Added structured logging for all state transitions:
  - `init()` logs "PENDING"
  - `setDone()` logs "DONE" with resultCount
  - `setFailed()` logs "FAILED" with error details

### 2. Controller Async Flow (search.controller.ts)
**POST /api/v1/search?mode=async:**
- Returns 202 with `requestId` and `resultUrl` immediately
- Kicks off **detached** background execution via `runAsyncSearch()`
- NO request-scoped resources passed to background job
- Logs: `[ASYNC] Request accepted, returning 202`

**Background Job (`runAsyncSearch`):**
- Logs: `[AsyncJob] Started detached execution`
- Creates detached Route2Context (no req/res references)
- Executes full pipeline with independent timeout
- On success:
  - Calls `setDone(requestId, response, resultCount)` 
  - Publishes WS event with `resultUrl` and `resultCount`
  - Logs: `[AsyncJob] Completed successfully`
- On error:
  - Calls `setFailed(requestId, code, message)`
  - Publishes WS error event
  - Logs: `[AsyncJob] Failed`

**GET /api/v1/search/:requestId/result:**
- **404**: RequestId not found or expired → `{ code: "NOT_FOUND" }`
- **202**: Still processing (PENDING) → Returns stub response with `resultUrl` for retry
- **200**: Done successfully (DONE) → Returns full `SearchResponse` with all results
- **500**: Pipeline failed (FAILED) → Returns error details

### 3. WebSocket Events (search.contracts.ts)
Added `resultCount` field to the `ready` event:
```typescript
type: "ready"
resultUrl: string
resultCount: number  // NEW
```

### 4. Logging & Instrumentation
- `[ASYNC] Request accepted, returning 202`
- `[AsyncStore] init -> PENDING`
- **`[AsyncJob] Started detached execution`** ← NEW
- `[AsyncStore] transition PENDING -> DONE` (with resultCount)
- `[AsyncStore] transition PENDING -> FAILED` (with error)
- **`[AsyncJob] Completed successfully`** ← NEW
- **`[AsyncJob] Failed`** ← NEW (on error)
- `[GET /result] PENDING` / `DONE` / `FAILED` / `NOT_FOUND`

## Testing Results ✅

### Test 1: Async POST + GET Flow
```powershell
POST /api/v1/search?mode=async
→ 202 with requestId + resultUrl
→ results: [] (pending)

# Wait for pipeline...

GET /api/v1/search/{requestId}/result
→ 200 with full results
→ results: 20 burger places
```

### Test 2: 404 for Unknown RequestId
```powershell
GET /api/v1/search/req-invalid-123/result
→ 404 NOT_FOUND
→ { code: "NOT_FOUND", message: "Request not found or expired" }
```

### Test 3: Log Evidence
```
[ASYNC] Request accepted, returning 202
[AsyncStore] init -> PENDING
[AsyncJob] Started detached execution          ← NEW
[ROUTE2] Pipeline completed (resultCount: 20)
[AsyncStore] transition PENDING -> DONE (resultCount: 20)
[AsyncJob] Completed successfully              ← NEW
[GET /result] DONE - returning stored response (resultCount: 20)
```

**Before fix (BROKEN):**
```
[ASYNC] Request accepted, returning 202
[AsyncStore] init -> PENDING
[ROUTE2] gate2 started
[ROUTE2] intent started
[ROUTE2] textsearch_mapper started
... (pipeline aborted here, no completion logs)
[GET /result] PENDING (forever stuck)
```

## Acceptance Criteria ✅

- ✅ POST async returns 202 + resultUrl immediately
- ✅ After pipeline completes, GET resultUrl returns 200 with non-empty results
- ✅ If client polls before completion, GET returns 202 pending
- ✅ If requestId is unknown, GET returns 404
- ✅ WS events include resultUrl and resultCount
- ✅ Store transitions are logged (PENDING → DONE/FAILED)
- ✅ GET /result endpoint logs what it returns
- ✅ No duplicate ASYNC_BRANCH_HIT logs

## API Contract

### POST /api/v1/search?mode=async
**Response 202:**
```json
{
  "requestId": "req-1768658675727-ebdmmpizx",
  "resultUrl": "/api/v1/search/req-1768658675727-ebdmmpizx/result",
  "contractsVersion": "search_contracts_v1",
  "results": [],
  "meta": { "source": "pending" }
}
```

### GET /api/v1/search/:requestId/result

**Response 202 (Still Processing):**
```json
{
  "requestId": "req-...",
  "resultUrl": "/api/v1/search/req-.../result",
  "results": [],
  "meta": { "source": "pending" }
}
```

**Response 200 (Done):**
```json
{
  "requestId": "req-...",
  "results": [...],  // Full SearchResponse
  "chips": [...],
  "meta": { ... }
}
```

**Response 404 (Not Found):**
```json
{
  "code": "NOT_FOUND",
  "message": "Request not found or expired",
  "requestId": "req-invalid-123"
}
```

**Response 500 (Failed):**
```json
{
  "code": "INTERNAL_ERROR",
  "message": "Request was aborted.",
  "requestId": "req-..."
}
```

## Files Changed
1. **`server/src/controllers/search/search.controller.ts`** - **CRITICAL FIX**: Added `runAsyncSearch()` helper for detached execution + updated async branch to use it
2. `server/src/search-async/searchAsync.store.ts` - Status naming + logging
3. `server/src/contracts/search.contracts.ts` - Added resultCount to WS ready event

## Migration Notes
- Frontend can safely poll GET /result endpoint
- WebSocket is optional (polling alone is sufficient)
- No breaking changes to existing sync mode
- TTL for stored results: 5 minutes (configurable)
- **Pipeline timeout: 30 seconds** (managed by detached job)

## Technical Details: Why This Was Critical

### The Bug
When using `mode=async`, the controller would:
1. Return 202 immediately
2. Kick off pipeline in `void (async () => { ... })()` 
3. **BUT** the pipeline was still using the request-scoped `route2Context`
4. When Express finished sending the 202 response, it considered the request "done"
5. Any AbortSignal or request-scoped resources got cancelled/cleaned up
6. Pipeline would abort mid-execution (usually during LLM calls)
7. `setDone()`/`setFailed()` never called → store stuck in PENDING forever

### The Fix
The `runAsyncSearch()` helper:
- Creates a **completely new** `Route2Context` with NO request references
- Uses its own `AbortController` with 30s timeout
- Guarantees `setDone()` or `setFailed()` is always called (try/catch/finally)
- Logs clear lifecycle: started → completed/failed
- Timeout cleanup in finally block

This ensures the pipeline runs to completion even after the HTTP response is sent.
