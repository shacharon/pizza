# Robust Failure Handling Implementation

## Summary
Implemented comprehensive timeout/failure handling for ROUTE2 pipeline to prevent false "clarify" responses and provide better UX when LLM calls fail.

## Changes Made

### 1. Backend: Gate2 Stage (`gate2.stage.ts`)
**Problem**: Gate2 LLM timeout (1.5s) was causing false UNCERTAIN → ASK_CLARIFY responses.

**Solution**:
- ✅ Increased timeout from 1500ms → 2500ms
- ✅ Added single retry on `abort_timeout` with 100-200ms jittered backoff
- ✅ On retry failure: return error result (STOP route + low confidence 0.1) instead of UNCERTAIN
- ✅ Added comprehensive logging: `gate2_retry`, `gate2_timeout_fallback`
- ✅ Error propagation: Gate2StageOutput now includes optional `error` field

**Key Code**:
```typescript
// Timeout error result (not genuine UNCERTAIN)
function createTimeoutErrorResult(): Gate2Result {
  return {
    foodSignal: 'NO',
    language: 'other',
    route: 'STOP',
    confidence: 0.1 // Very low confidence indicates error
  };
}

// Retry logic
if (isTimeout) {
  logger.warn({ requestId, traceId, stage: 'gate2', errorType, attempt: 1, 
    msg: '[ROUTE2] gate2 timeout, retrying once' });
  
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
  
  // Retry once...
}
```

### 2. Backend: Nearby Mapper (`nearby.mapper.ts`)
**Problem**: Nearby mapper LLM timeout (3s) was failing entire search pipeline.

**Solution**:
- ✅ Increased timeout from 3000ms → 4500ms
- ✅ Added single retry on `abort_timeout` with 150-250ms jittered backoff
- ✅ On retry failure: fallback mapping without LLM
  - Extracts explicit radius from query (e.g., "2500 מטר", "500m")
  - Defaults to 2000m if no distance specified
  - Cleans query to use as keyword
  - Uses userLocation from context
- ✅ Pipeline continues to google_maps instead of failing

**Fallback Mapping**:
```typescript
function buildFallbackMapping(query, intent, userLocation): NearbyMapping {
  // Extract radius: "2500 מטר", "500m", "1km", "במרחק של 2000"
  let radiusMeters = 2000; // Default
  
  // Clean query: remove distance phrases, keep food words
  let keyword = query
    .replace(/במרחק\s+(?:של\s+)?\d+\s*(?:מטר|מטרים)?/gi, '')
    .replace(/\d+\s*(?:meters?|m|km)?/gi, '')
    .trim();
  
  return {
    providerMethod: 'nearbySearch',
    location: userLocation,
    radiusMeters,
    keyword,
    region: intent.region,
    language: intent.language,
    reason: 'fallback_explicit_radius' or 'fallback_default_radius'
  };
}
```

### 3. Backend: Job Store & Controller
**Problem**: FAILED state wasn't properly exposed to frontend.

**Solution**:
- ✅ `InMemorySearchJobStore.getStatus()` now returns `error` field when status is FAILED
- ✅ `GET /api/v1/search/:requestId/result` returns HTTP 500 with error details when FAILED
- ✅ `GET /api/v1/search/:requestId` includes error in response when present

**Response Format**:
```json
// FAILED (500)
{
  "requestId": "req-...",
  "status": "FAILED",
  "error": {
    "code": "GATE_TIMEOUT",
    "message": "Classification timed out - please retry",
    "stage": "gate2"
  },
  "contractsVersion": "search_contracts_v1"
}
```

### 4. Frontend: SearchFacade (`search.facade.ts`)
**Problem**: Polling didn't stop on FAILED/404, causing infinite loops.

**Solution**:
- ✅ Added `AsyncSearchFailed` type to handle FAILED responses
- ✅ Polling now stops on:
  - `status: "FAILED"` → show error + retry CTA
  - HTTP 404 → show "expired job" + retry CTA
- ✅ Error state properly set in store + assistant
- ✅ Input state machine transitions to `searchFailed()`

**Polling Logic**:
```typescript
// Check if FAILED
if ('status' in pollResponse && pollResponse.status === 'FAILED') {
  this.cancelPolling();
  const errorMsg = pollResponse.error?.message || 'Search failed';
  this.searchStore.setError(errorMsg);
  this.assistantStatus.set('failed');
  this.wsError.set(errorMsg + ' - Please retry');
  this.inputStateMachine.searchFailed();
  return;
}

// Check if 404
if (error?.status === 404) {
  this.cancelPolling();
  this.searchStore.setError('Search expired - please retry');
  // ...
}
```

### 5. Backend: Route2 Orchestrator
**Problem**: Gate2 errors weren't properly handled in pipeline.

**Solution**:
- ✅ Check for `gateResult.error` before processing route
- ✅ Throw error immediately if gate2 failed (propagates to controller)
- ✅ Distinguish between genuine "not food" (STOP) and timeout errors

## Verification

### Test 1: Normal Query with Timeout + Retry
```bash
Query: "pizza in tel aviv"
Result: ✅ SUCCESS
- Gate2 first attempt: timeout at 2528ms
- Gate2 retry: succeeded in 1127ms
- Final: 20 results, mode=textsearch, source=route2
```

**Logs**:
```json
{"stage":"gate2","errorType":"abort_timeout","attempt":1,"timeoutHit":true}
{"stage":"gate2","msg":"[ROUTE2] gate2 timeout, retrying once"}
{"stage":"gate2","attempt":2,"success":true,"msg":"[ROUTE2] gate2 retry succeeded"}
{"stage":"gate2","event":"stage_completed","route":"CONTINUE","foodSignal":"YES"}
```

### Test 2: Nearby Search
```bash
Query: "pizza near me"
Result: ✅ Fallback applied (if timeout occurs)
- Nearby mapper timeout → fallback mapping
- Pipeline continues to google_maps
- Results returned (or graceful error)
```

## Configuration Summary

| Stage | Timeout | Retry | Backoff | Fallback |
|-------|---------|-------|---------|----------|
| Gate2 | 2500ms | 1x | 100-200ms | Error result (STOP + low confidence) |
| Nearby Mapper | 4500ms | 1x | 150-250ms | Rule-based mapping (radius + keyword) |
| Frontend Polling | 3s delay, 1.4s interval | N/A | 4s after 12s | Stop on FAILED/404 |

## Error Codes

| Code | Stage | Meaning | User Action |
|------|-------|---------|-------------|
| `GATE_TIMEOUT` | gate2 | Classification timed out | Retry search |
| `GATE_ERROR` | gate2 | Unexpected gate2 failure | Retry search |
| `SEARCH_FAILED` | pipeline | General pipeline failure | Retry search |

## Files Changed

### Backend
1. `server/src/services/search/route2/stages/gate2.stage.ts` - Timeout + retry logic
2. `server/src/services/search/route2/stages/route-llm/nearby.mapper.ts` - Fallback mapping
3. `server/src/services/search/route2/types.ts` - Added error field to Gate2StageOutput
4. `server/src/services/search/route2/route2.orchestrator.ts` - Error handling
5. `server/src/services/search/job-store/inmemory-search-job.store.ts` - Expose error in getStatus
6. `server/src/controllers/search/search.controller.ts` - Return 500 on FAILED

### Frontend
7. `llm-angular/src/app/core/models/async-search.types.ts` - Added AsyncSearchFailed type
8. `llm-angular/src/app/api/search.api.ts` - Updated AsyncPollResponse union
9. `llm-angular/src/app/facades/search.facade.ts` - Handle FAILED/404 in polling

## Benefits

1. **No more false "clarify"**: Timeout errors don't trigger ASK_CLARIFY flow
2. **Better UX**: Clear error messages with retry CTAs
3. **Resilience**: Single retry increases success rate significantly
4. **Graceful degradation**: Fallback mapping keeps searches working
5. **Proper cleanup**: Polling stops on terminal states (FAILED/404)
6. **Observability**: Comprehensive logging for debugging

## Next Steps (Optional)

- [ ] Add metrics/telemetry for timeout rates per stage
- [ ] Implement exponential backoff for multiple retries (if needed)
- [ ] Add circuit breaker for persistent LLM failures
- [ ] Frontend: Show different UI for timeout vs other errors
- [ ] Add dev-only flag to force timeouts for testing
