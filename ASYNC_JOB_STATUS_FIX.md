# Async Job Status Semantics Fix

## Summary
Fixed async job status handling to distinguish between successful results, clarification requests, and infrastructure failures. Gate2 timeouts now correctly map to `DONE_FAILED` instead of triggering false "clarify" responses.

## Problem
**Before**:
- Single `DONE` status for all completions (success, clarify, failure)
- Gate2 timeout → `UNCERTAIN` → `ASK_CLARIFY` → false clarification request
- No way for frontend to distinguish "needs user input" from "infrastructure error"
- WebSocket events didn't reflect actual job outcome

## Solution
**After**:
- **Terminal States**: `DONE_SUCCESS`, `DONE_CLARIFY`, `DONE_FAILED`
- **Gate2 timeout** → `DONE_FAILED` with `errorType: GATE_ERROR`
- **WebSocket Events**: `ready` (success), `clarify` (needs input), `error` (failed)
- **Controller responses** aligned with job status

## Terminal States

### DONE_SUCCESS
- **Trigger**: Pipeline completes with results
- **Condition**: `response.results.length > 0` OR `response.assist?.type !== 'clarify'`
- **WS Event**: `type: 'ready'` with `resultCount`
- **HTTP**: 200 OK with full `SearchResponse`

### DONE_CLARIFY
- **Trigger**: Pipeline completes but needs user clarification
- **Condition**: `response.results.length === 0 AND response.assist?.type === 'clarify'`
- **WS Event**: `type: 'clarify'` with `message`
- **HTTP**: 200 OK with `SearchResponse` (empty results + assist message)

### DONE_FAILED
- **Trigger**: Pipeline throws error (timeout, gate2 failure, etc.)
- **Condition**: Exception caught in async job handler
- **WS Event**: `type: 'error'` with `code`, `message`, `errorType`
- **HTTP**: 500 Internal Server Error with error details

## Error Type Classification

```typescript
if (err.message.includes('GATE_TIMEOUT') || err.message.includes('gate2')) {
  errorType = 'GATE_ERROR';
  errorCode = 'GATE_TIMEOUT';
} else if (err.message.includes('timeout') || err.message.includes('abort')) {
  errorType = 'LLM_TIMEOUT';
  errorCode = 'LLM_TIMEOUT';
} else {
  errorType = 'SEARCH_FAILED';
  errorCode = 'SEARCH_FAILED';
}
```

## WebSocket Event Types

### 1. `search_progress` (unchanged)
```typescript
{
  channel: "search",
  contractsVersion: "search_contracts_v1",
  type: "progress",
  requestId: "req-...",
  ts: "2026-01-17T18:00:00.000Z",
  stage: "gate2" | "intent" | "google",
  status: "running",
  progress: 50,
  message?: "Processing..."
}
```

### 2. `search_ready` (success)
```typescript
{
  channel: "search",
  contractsVersion: "search_contracts_v1",
  type: "ready",
  requestId: "req-...",
  ts: "2026-01-17T18:00:05.000Z",
  stage: "done",
  ready: "results",
  decision: "CONTINUE",
  resultCount: 20
}
```

### 3. `search_clarify` (NEW - needs user input)
```typescript
{
  channel: "search",
  contractsVersion: "search_contracts_v1",
  type: "clarify",
  requestId: "req-...",
  ts: "2026-01-17T18:00:05.000Z",
  stage: "done",
  message: "Could you please clarify what type of food you're looking for?"
}
```

### 4. `search_error` (infrastructure failure)
```typescript
{
  channel: "search",
  contractsVersion: "search_contracts_v1",
  type: "error",
  requestId: "req-...",
  ts: "2026-01-17T18:00:05.000Z",
  stage: "done",
  code: "GATE_TIMEOUT" | "LLM_TIMEOUT" | "SEARCH_FAILED",
  message: "Classification timed out - please retry",
  errorType: "GATE_ERROR" | "LLM_TIMEOUT" | "SEARCH_FAILED"
}
```

## Controller Response Logic

### GET /api/v1/search/:requestId/result

```typescript
// 404: Job not found or expired
if (!statusInfo) {
  return res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Job not found or expired',
    requestId
  });
}

// 500: Infrastructure failure
if (statusInfo.status === 'DONE_FAILED') {
  return res.status(500).json({
    requestId,
    status: 'FAILED',
    error: statusInfo.error,
    contractsVersion: CONTRACTS_VERSION
  });
}

// 202: Still processing
if (statusInfo.status === 'PENDING' || statusInfo.status === 'RUNNING') {
  return res.status(202).json({
    requestId,
    status: 'PENDING',
    progress: statusInfo.progress,
    contractsVersion: CONTRACTS_VERSION
  });
}

// 200: Done (success or clarify)
// DONE_SUCCESS or DONE_CLARIFY both return full SearchResponse
const result = await searchJobStore.getResult(requestId);
return res.status(200).json(result);
```

## Files Changed

### 1. `server/src/services/search/job-store/job-store.interface.ts`
**Change**: Updated `JobStatus` type
```typescript
// Before
export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

// After
export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE_SUCCESS' | 'DONE_CLARIFY' | 'DONE_FAILED';
```

### 2. `server/src/controllers/search/search.controller.ts`
**Changes**:
- Determine terminal status based on response content
- Set `DONE_SUCCESS` for results, `DONE_CLARIFY` for clarification
- Set `DONE_FAILED` for errors with `errorType` classification
- Publish appropriate WS events (`ready`, `clarify`, `error`)
- Update GET `/result` endpoint to handle new statuses

**Key Logic**:
```typescript
// Determine terminal status
let terminalStatus: 'DONE_SUCCESS' | 'DONE_CLARIFY' = 'DONE_SUCCESS';
if (response.results.length === 0 && response.assist?.type === 'clarify') {
  terminalStatus = 'DONE_CLARIFY';
}

await searchJobStore.setStatus(requestId, terminalStatus, 100);

// Publish appropriate event
if (terminalStatus === 'DONE_CLARIFY') {
  publishSearchEvent(requestId, {
    type: 'clarify',
    message: response.assist?.message || 'Please clarify your search'
  });
} else {
  publishSearchEvent(requestId, {
    type: 'ready',
    resultCount: response.results.length
  });
}
```

### 3. `server/src/contracts/search.contracts.ts`
**Change**: Added `clarify` event type to `WsSearchEvent`
```typescript
export type WsSearchEvent =
  | { /* progress */ }
  | { /* ready */ }
  | { /* clarify - NEW */ 
      type: "clarify";
      message: string;
    }
  | { /* error */ 
      errorType?: string; // Added
    };
```

## Frontend Impact

### Expected Behavior
1. **Success Flow**:
   - WS: `progress` → `progress` → `ready` (resultCount: 20)
   - Poll: 202 → 202 → 200 (with results)
   - UI: Show results

2. **Clarify Flow**:
   - WS: `progress` → `progress` → `clarify` (message: "...")
   - Poll: 202 → 202 → 200 (empty results + assist)
   - UI: Show clarification prompt

3. **Failure Flow**:
   - WS: `progress` → `error` (errorType: GATE_ERROR)
   - Poll: 202 → 500 (with error details)
   - UI: Show "Temporary issue, please retry" (not clarification)

### Frontend Changes Needed
```typescript
// Handle new WS event types
case 'search_clarify':
  // Show clarification UI (not error UI)
  this.assistantStatus.set('clarify');
  this.searchStore.setClarifyMessage(event.message);
  break;

case 'search_error':
  // Check errorType for better UX
  if (event.errorType === 'GATE_ERROR' || event.errorType === 'LLM_TIMEOUT') {
    this.searchStore.setError('Temporary issue - please retry');
  } else {
    this.searchStore.setError(event.message);
  }
  break;
```

## Testing

### Test 1: Successful Search
```bash
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza in tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}'

# Response: {"requestId":"req-...","resultUrl":"/api/v1/search/req-.../result"}

# Wait 5-10s, then poll
curl http://localhost:3000/api/v1/search/req-.../result

# Expected: 200 OK with results
# WS: progress → progress → ready (resultCount: 20)
# JobStore: DONE_SUCCESS
```

### Test 2: Clarification Needed
```bash
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"אני רעב","userLocation":{"lat":32.0853,"lng":34.7818}}'

# Wait 5-10s, then poll
curl http://localhost:3000/api/v1/search/req-.../result

# Expected: 200 OK with empty results + assist.type='clarify'
# WS: progress → progress → clarify (message: "...")
# JobStore: DONE_CLARIFY
```

### Test 3: Gate2 Timeout (simulated)
```bash
# Temporarily set gate2 timeout to 1ms in gate2.stage.ts
# Then run:
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"sushi","userLocation":{"lat":32.0853,"lng":34.7818}}'

# Wait 5-10s, then poll
curl http://localhost:3000/api/v1/search/req-.../result

# Expected: 500 Internal Server Error
# Response: {"status":"FAILED","error":{"code":"GATE_TIMEOUT","errorType":"GATE_ERROR"}}
# WS: progress → error (errorType: GATE_ERROR)
# JobStore: DONE_FAILED
```

## Logs to Verify

### Success
```json
{"msg":"[ASYNC] Job completed successfully","requestId":"req-...","resultCount":20}
```

### Clarify
```json
{"msg":"[ASYNC] Job completed - clarification needed","requestId":"req-..."}
```

### Failure
```json
{"msg":"[ASYNC] Job failed","requestId":"req-...","errorCode":"GATE_TIMEOUT","errorType":"GATE_ERROR"}
```

## Benefits

1. **Clear Semantics**: Terminal states explicitly indicate outcome
2. **Better UX**: Frontend can show appropriate UI (results vs clarify vs error)
3. **No False Clarify**: Gate2 timeout → error (not clarification request)
4. **Observability**: Logs and WS events clearly distinguish outcomes
5. **Error Recovery**: `errorType` allows targeted retry strategies

## Migration Notes

### Backward Compatibility
- Old `DONE` status is now split into `DONE_SUCCESS` and `DONE_CLARIFY`
- Old `FAILED` status is now `DONE_FAILED`
- HTTP responses remain compatible (200 for done, 500 for failed)
- Frontend must handle new `clarify` WS event type

### Rollout Strategy
1. Deploy backend with new status types
2. Update frontend to handle `clarify` event (graceful degradation if missing)
3. Monitor logs for `DONE_CLARIFY` and `DONE_FAILED` occurrences
4. Adjust gate2 timeout/retry logic based on `GATE_ERROR` frequency

## Future Enhancements

- [ ] Add `DONE_PARTIAL` for searches with some results but warnings
- [ ] Include `retryable: boolean` in error responses
- [ ] Add telemetry for terminal state distribution
- [ ] Implement automatic retry for `GATE_ERROR` / `LLM_TIMEOUT`
- [ ] Add user feedback loop for `DONE_CLARIFY` responses
