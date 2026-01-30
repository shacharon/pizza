# Deduplication Staleness Fix

## Problem

Search deduplication was reusing stale RUNNING jobs, causing searches to hang indefinitely. Real example from logs:
```json
{
  "requestId": "req-1769803427313-h3tqdflmf",
  "event": "duplicate_search_deduped",
  "status": "RUNNING",
  "ageMs": 1160413  // ~19 minutes old!
}
```

**Root Cause**: The `findByIdempotencyKey` method returned RUNNING jobs immediately without checking if they were stale (no heartbeat/progress updates).

## Solution

Added comprehensive staleness detection with TTL-based checks:

### 1. Configuration (`deduplication.config.ts`)

```typescript
// Max age for RUNNING jobs before considered stale
DEDUP_RUNNING_MAX_AGE_MS:
  - Dev: 90,000ms (90s)
  - Prod: 300,000ms (5min)

// Fresh window for DONE_SUCCESS cached results
DEDUP_SUCCESS_FRESH_WINDOW_MS: 5,000ms (5s)
```

### 2. Decision Matrix

| Job Status | Condition | Decision | Reason |
|------------|-----------|----------|--------|
| `DONE_SUCCESS` | updatedAt within 5s | `REUSE` | Cached result available |
| `DONE_FAILED` | Any | `NEW_JOB` | Previous job failed |
| `RUNNING` | updatedAt < TTL AND age < TTL | `REUSE` | Fresh, actively progressing |
| `RUNNING` | updatedAt > TTL OR age > TTL | `NEW_JOB` | Stale, no heartbeat |
| Other | Any | `REUSE` | Trust other terminal states |

### 3. Staleness Check Logic

```typescript
// Check both updatedAt (heartbeat) and createdAt (total age)
const updatedAgeMs = now - job.updatedAt;
const ageMs = now - job.createdAt;

const isStaleByUpdatedAt = updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS;
const isStaleByAge = ageMs > DEDUP_RUNNING_MAX_AGE_MS;

if (isStaleByUpdatedAt || isStaleByAge) {
  // Do NOT reuse - create new job
  // Mark old job as DONE_FAILED
}
```

### 4. Fail-Safe Cleanup

When a stale RUNNING job is detected:
1. **Do NOT reuse it** (create new job instead)
2. **Mark it as DONE_FAILED** with reason `STALE_RUNNING`
3. **Log the staleness** for observability

```typescript
await searchJobStore.setError(
  candidateJob.requestId,
  'STALE_RUNNING',
  `Job marked as stale during deduplication check (updatedAgeMs: ${updatedAgeMs}ms)`,
  'UNKNOWN'
);
```

## Enhanced Logging

### Deduplication Phase

#### Candidate Found
```json
{
  "event": "dedup_candidate_found",
  "requestId": "req-new-123",
  "candidateRequestId": "req-old-456",
  "status": "RUNNING",
  "ageMs": 95000,
  "updatedAgeMs": 95000,
  "progress": 50
}
```

#### Decision Made
```json
{
  "event": "dedup_decision",
  "decision": "NEW_JOB",
  "reason": "STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: 95000ms > 90000ms)",
  "status": "RUNNING",
  "ageMs": 95000,
  "updatedAgeMs": 95000,
  "maxAgeMs": 90000
}
```

#### Stale Job Marked Failed
```json
{
  "event": "stale_running_marked_failed",
  "requestId": "req-old-456",
  "ageMs": 95000,
  "updatedAgeMs": 95000,
  "maxAgeMs": 90000,
  "reason": "STALE_RUNNING_DEDUP_RESET"
}
```

### getResult Phase

#### Status Check
```json
{
  "event": "getResult_status",
  "requestId": "req-123",
  "status": "RUNNING",
  "hasResult": false,
  "ageMs": 95000,
  "updatedAgeMs": 95000,
  "progress": 50,
  "isStale": true
}
```

#### Stale Warning
```json
{
  "event": "getResult_stale_running",
  "requestId": "req-123",
  "ageMs": 95000,
  "updatedAgeMs": 95000,
  "maxAgeMs": 90000,
  "progress": 50
}
```

## Sample Logs - Before/After

### Before (Broken)
```json
// Client submits duplicate search
{
  "event": "duplicate_search_deduped",
  "requestId": "req-1769803427313-h3tqdflmf",
  "status": "RUNNING",
  "ageMs": 1160413  // 19 minutes old - REUSED!
}

// Client polls forever, job never completes
{
  "event": "getResult_status",
  "requestId": "req-1769803427313-h3tqdflmf",
  "status": "RUNNING"
  // No staleness detection
}
```

### After (Fixed)
```json
// Client submits duplicate search
{
  "event": "dedup_candidate_found",
  "candidateRequestId": "req-1769803427313-h3tqdflmf",
  "status": "RUNNING",
  "ageMs": 1160413,
  "updatedAgeMs": 1160000
}

{
  "event": "dedup_decision",
  "decision": "NEW_JOB",
  "reason": "STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: 1160000ms > 90000ms)",
  "maxAgeMs": 90000
}

{
  "event": "stale_running_marked_failed",
  "requestId": "req-1769803427313-h3tqdflmf",
  "reason": "STALE_RUNNING_DEDUP_RESET"
}

{
  "event": "job_created",
  "requestId": "req-new-456"
  // Fresh job created instead of reusing stale one
}
```

## Client-Side Behavior

### getResult Response with Staleness Metadata

When polling a stale RUNNING job:

```typescript
// Response (HTTP 202)
{
  "requestId": "req-123",
  "status": "RUNNING",
  "progress": 50,
  "meta": {
    "isStale": true,
    "ageMs": 95000,
    "updatedAgeMs": 95000,
    "message": "Search may be stuck. Consider restarting search if no progress after retry."
  }
}
```

**Client Action**: After detecting staleness, client can:
1. Continue polling for a few more attempts (maybe job is slow)
2. Show user a "restart search" button
3. Automatically restart search after N stale responses

## Tests

Comprehensive test suite in `search-deduplication-staleness.test.ts`:

### Test Coverage
- ✅ RUNNING older than TTL → NEW_JOB
- ✅ RUNNING fresh (< TTL) → REUSE
- ✅ DONE_SUCCESS → REUSE
- ✅ DONE_FAILED → NEW_JOB
- ✅ Real-world scenario: ageMs ~1,160,413 → NEW_JOB
- ✅ Edge cases: exactly at TTL, just over TTL
- ✅ Scenarios: stuck LLM, active progress, server restart

### Run Tests
```bash
cd server
npm test -- search-deduplication-staleness
```

## Security Considerations

✅ **No IDOR violations**: Staleness checks use existing job data, no new ownership checks needed  
✅ **Fail-safe**: If marking stale job fails, still create new job (non-fatal error)  
✅ **Observability**: All decisions logged with full context

## Performance Impact

**Minimal overhead**:
- Single additional timestamp comparison (`updatedAgeMs > TTL`)
- Only applies when deduplication candidate found (rare)
- No additional database queries

**Benefits**:
- Prevents stuck jobs from blocking new searches
- Reduces unnecessary polling (clients get faster NEW_JOB)
- Cleaner job store (stale jobs marked as failed)

## Deployment

### Environment Variables
No new env vars required. Uses existing:
- `NODE_ENV` to determine dev vs prod TTL

### Backward Compatibility
✅ **Fully backward compatible**:
- Existing API contracts unchanged
- New `meta` field in getResult is optional
- Clients that don't check `meta.isStale` still work

### Monitoring

Watch for these log events:
- `dedup_decision` with `decision: "NEW_JOB"` and `reason` containing `STALE_RUNNING`
- `stale_running_marked_failed` - indicates cleanup of stuck jobs
- `getResult_stale_running` - indicates clients polling stuck jobs

## Files Changed

1. **`server/src/config/deduplication.config.ts`** (NEW)
   - TTL constants
   - Environment-based configuration

2. **`server/src/controllers/search/search.controller.ts`**
   - Enhanced deduplication logic with staleness checks
   - Detailed decision logging
   - Stale job cleanup
   - Enhanced getResult logging with staleness detection

3. **`server/src/controllers/search/__tests__/search-deduplication-staleness.test.ts`** (NEW)
   - Comprehensive test suite
   - Edge cases and real-world scenarios

## Metrics to Monitor

Post-deployment, track:
- `dedup_decision` with `decision: "NEW_JOB"` count (should decrease over time as stuck jobs clear)
- `stale_running_marked_failed` count (initial spike expected, then low)
- Average `updatedAgeMs` for RUNNING jobs in `getResult_status`
- Client retry rates (should decrease as stale jobs are no longer reused)

## Future Enhancements

1. **Progress Heartbeat**: Add explicit heartbeat updates to RUNNING jobs
2. **Adaptive TTL**: Adjust TTL based on query complexity
3. **Client Retry Guidance**: Return suggested retry delay in `meta`
4. **Metrics Dashboard**: Track staleness detection rates over time
