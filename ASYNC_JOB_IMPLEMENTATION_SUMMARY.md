# Async Job Store Implementation Summary

## Files Changed/Created

### Created
1. **`server/src/services/search/job-store/inmemory-search-job.store.ts`**
   - In-memory job store with TTL (10 minutes)
   - Methods: `createJob`, `setStatus`, `setResult`, `setError`, `getJob`
   - Auto-cleanup timer for expired jobs

2. **`ASYNC_JOB_SMOKE_TEST.md`**
   - Complete smoke test documentation
   - curl commands for all endpoints
   - PowerShell test script
   - Expected WebSocket event payloads

3. **`ASYNC_JOB_IMPLEMENTATION_SUMMARY.md`** (this file)

### Modified
1. **`server/src/controllers/search/search.controller.ts`**
   - POST `/api/v1/search?mode=async` → 202 with `{ requestId }`
   - GET `/api/v1/search/:requestId` → 200 with status/progress or 404
   - GET `/api/v1/search/:requestId/result` → 200/202/404
   - Background job execution with WebSocket events at 0%, 50%, 90%, 100%
   - Error handling with `search_failed` event

2. **`server/src/contracts/search.contracts.ts`**
   - Added `progress?: number` and `status?: string` to WsSearchEvent progress type
   - Supports 0-100 progress tracking

## HTTP Routes

### POST /api/v1/search?mode=async
- **Request**: `{ query: string, userLocation?: { lat, lng }, sessionId?: string }`
- **Response**: HTTP 202 `{ requestId: string }`
- **Behavior**: Creates job, starts background execution, returns immediately

### GET /api/v1/search/:requestId
- **Response**: 
  - HTTP 200 `{ requestId, status: "PENDING"|"RUNNING"|"DONE"|"FAILED", progress?: number }`
  - HTTP 404 `{ code: "NOT_FOUND", message: "...", requestId }`

### GET /api/v1/search/:requestId/result
- **Response**:
  - HTTP 202 `{ requestId, status: "RUNNING", progress: number }` (not done yet)
  - HTTP 200 `{ ...SearchResponse }` (done, full result)
  - HTTP 404 `{ code: "NOT_FOUND", message: "...", requestId }` (unknown job)

## WebSocket Events

All events include `requestId` and are published to the `search` channel.

### 1. search_progress (0% - Job Started)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "progress",
  "requestId": "req-...",
  "ts": "2026-01-17T15:00:00.000Z",
  "stage": "accepted",
  "status": "running",
  "progress": 0,
  "message": "Search started"
}
```

### 2. search_progress (50% - Pipeline Started)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "progress",
  "requestId": "req-...",
  "ts": "2026-01-17T15:00:02.000Z",
  "stage": "route_llm",
  "status": "running",
  "progress": 50,
  "message": "Processing search"
}
```

### 3. search_progress (90% - Finalizing)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "progress",
  "requestId": "req-...",
  "ts": "2026-01-17T15:00:05.000Z",
  "stage": "google",
  "status": "running",
  "progress": 90,
  "message": "Finalizing results"
}
```

### 4. search_done (100% - Complete)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "ready",
  "requestId": "req-...",
  "ts": "2026-01-17T15:00:06.000Z",
  "stage": "done",
  "ready": "results",
  "decision": "CONTINUE",
  "resultCount": 20
}
```

### 5. search_failed (Error)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "error",
  "requestId": "req-...",
  "ts": "2026-01-17T15:00:06.000Z",
  "stage": "done",
  "code": "SEARCH_FAILED",
  "message": "Pipeline error: ..."
}
```

## Logging

All logs include `requestId` for traceability:

```
[JobStore] Job created { requestId, status: 'PENDING' }
[ASYNC] Request accepted, returning 202 { requestId, mode: 'async', query }
[JobStore] Status updated { requestId, status: 'RUNNING', progress: 0 }
[JobStore] Status updated { requestId, status: 'RUNNING', progress: 50 }
[JobStore] Status updated { requestId, status: 'RUNNING', progress: 90 }
[JobStore] Result stored { requestId, hasResult: true }
[JobStore] Status updated { requestId, status: 'DONE', progress: 100 }
[ASYNC] Job completed successfully { requestId, resultCount, durationMs }
```

On error:
```
[ASYNC] Job failed { requestId, errorCode, error }
```

## Smoke Test Results

✅ **POST → 202**: Returns `requestId` immediately  
✅ **GET /:requestId (immediate)**: Returns `{ status: "RUNNING", progress: 50 }`  
✅ **GET /:requestId/result (immediate)**: Returns HTTP 202 with `{ status: "RUNNING", progress: 50 }`  
✅ **GET /:requestId (after 7s)**: Returns `{ status: "DONE", progress: 100 }`  
✅ **GET /:requestId/result (after 7s)**: Returns HTTP 200 with full SearchResponse (20 results)  
✅ **Logs**: All transitions logged with requestId  
✅ **WebSocket**: Events published (visible when clients are subscribed)

### Sample Test Output
```
=== POST async search ===
RequestId: req-1768662065832-izr3wnxww

=== GET status (immediate) ===
{ "requestId": "req-...", "status": "RUNNING", "progress": 50 }

=== GET result (pending) ===
{ "requestId": "req-...", "status": "RUNNING", "progress": 50 }

Waiting 7 seconds...

=== GET status (done) ===
{ "requestId": "req-...", "status": "DONE", "progress": 100 }

=== GET result (complete) ===
Results: 20
פיצה
```

## Implementation Notes

### Job Store
- Uses `Map<string, SearchJob>` for in-memory storage
- TTL: 10 minutes (configurable)
- Auto-cleanup timer runs every 60 seconds
- RequestId format: `req-{timestamp}-{random9chars}`

### Background Execution
- Detached from HTTP request lifecycle (no await)
- Independent AbortController (not tied to request)
- Progress updates at meaningful milestones (0%, 50%, 90%, 100%)
- WebSocket events published at each progress update
- Error handling with stable error codes (`SEARCH_FAILED`, `TIMEOUT`)

### WebSocket Publishing
- Only sends to subscribed clients (no spam if no clients)
- Uses existing `publishToChannel` infrastructure
- Keyed by `requestId` (clients subscribe with `{ action: "subscribe", channel: "search", requestId: "..." }`)
- Logs `websocket_published` only when clients are connected

### Idempotency
- No explicit idempotency-key middleware exists (skipped as per requirements)
- Each POST creates a new job with unique requestId

## Next Steps (Not Implemented)

- [ ] Persistent storage (Redis/DB) for job state
- [ ] Idempotency-Key header support
- [ ] Job cancellation endpoint
- [ ] Integration tests (if test harness exists)
- [ ] Metrics/monitoring (job queue depth, completion rate, etc.)
