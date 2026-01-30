# Sample Logs - Deduplication Staleness Fix

## Scenario: User Submits Duplicate Search with Stale RUNNING Job

### Timeline
1. **T=0**: Original search starts (req-old)
2. **T=1,160s**: Original search stalls (no heartbeat for ~19min)
3. **T=1,165s**: User retries same search (duplicate detected)

---

## Before Fix (BROKEN) ❌

### Duplicate Search Request
```json
{
  "level": "info",
  "time": "2026-01-30T20:23:07.811Z",
  "requestId": "req-1769803427313-h3tqdflmf",
  "originalRequestId": "req-1769804587808-j0vt7yjw1",
  "event": "duplicate_search_deduped",
  "status": "RUNNING",
  "ageMs": 1160413,
  "sessionHash": "2c3b20d765e7",
  "msg": "[Deduplication] Reusing existing requestId for duplicate search"
}
```

**Problem**: Stale RUNNING job (19 minutes old) is REUSED! Search will hang forever.

### Client Polling (Infinite Loop)
```json
// Poll 1
{
  "level": "info",
  "requestId": "req-1769803427313-h3tqdflmf",
  "status": "RUNNING"
}

// Poll 2 (5s later)
{
  "level": "info",
  "requestId": "req-1769803427313-h3tqdflmf",
  "status": "RUNNING"
}

// Poll N (forever...)
{
  "level": "info",
  "requestId": "req-1769803427313-h3tqdflmf",
  "status": "RUNNING"
}
```

**Result**: Client polls forever, search never completes. Poor UX! 😞

---

## After Fix (WORKING) ✅

### Step 1: Candidate Found
```json
{
  "level": "info",
  "time": "2026-01-30T20:42:15.234Z",
  "requestId": "req-new-1769805735234-abc123",
  "candidateRequestId": "req-1769803427313-h3tqdflmf",
  "event": "dedup_candidate_found",
  "status": "RUNNING",
  "ageMs": 1160413,
  "updatedAgeMs": 1160000,
  "progress": 0,
  "sessionHash": "2c3b20d765e7",
  "msg": "[Deduplication] Found candidate job for deduplication"
}
```

### Step 2: Staleness Detected
```json
{
  "level": "info",
  "time": "2026-01-30T20:42:15.236Z",
  "requestId": "req-new-1769805735234-abc123",
  "originalRequestId": "req-new-1769805735234-abc123",
  "candidateRequestId": "req-1769803427313-h3tqdflmf",
  "event": "dedup_decision",
  "decision": "NEW_JOB",
  "reason": "STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: 1160000ms > 90000ms)",
  "status": "RUNNING",
  "ageMs": 1160413,
  "updatedAgeMs": 1160000,
  "maxAgeMs": 90000,
  "msg": "[Deduplication] Decision: NEW_JOB - STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: 1160000ms > 90000ms)"
}
```

**Key**: Decision is `NEW_JOB` because `updatedAgeMs (1,160,000ms) > maxAgeMs (90,000ms)`

### Step 3: Stale Job Marked Failed
```json
{
  "level": "warn",
  "time": "2026-01-30T20:42:15.238Z",
  "requestId": "req-1769803427313-h3tqdflmf",
  "event": "stale_running_marked_failed",
  "ageMs": 1160413,
  "updatedAgeMs": 1160000,
  "maxAgeMs": 90000,
  "reason": "STALE_RUNNING_DEDUP_RESET",
  "msg": "[Deduplication] Marked stale RUNNING job as DONE_FAILED"
}
```

**Cleanup**: Old stale job is marked as DONE_FAILED to prevent future reuse.

### Step 4: New Job Created
```json
{
  "level": "info",
  "time": "2026-01-30T20:42:15.240Z",
  "requestId": "req-new-1769805735234-abc123",
  "sessionHash": "2c3b20d765e7",
  "hasUserId": false,
  "operation": "createJob",
  "decision": "ACCEPTED",
  "hasIdempotencyKey": true,
  "event": "job_created",
  "msg": "[Observability] Job created with JWT session binding and idempotency key"
}
```

**Fresh Start**: New job created with fresh requestId. Search proceeds normally.

### Step 5: Client Polling (Success)
```json
// Poll 1 - Job starting
{
  "level": "info",
  "time": "2026-01-30T20:42:17.100Z",
  "requestId": "req-new-1769805735234-abc123",
  "event": "getResult_status",
  "status": "RUNNING",
  "hasResult": false,
  "ageMs": 1860,
  "updatedAgeMs": 500,
  "progress": 20,
  "isStale": false,
  "msg": "[HTTP] GET /result - status: RUNNING, ageMs: 1860, updatedAgeMs: 500"
}

// Poll 2 - Making progress
{
  "level": "info",
  "time": "2026-01-30T20:42:22.150Z",
  "requestId": "req-new-1769805735234-abc123",
  "event": "getResult_status",
  "status": "RUNNING",
  "hasResult": false,
  "ageMs": 6916,
  "updatedAgeMs": 2100,
  "progress": 75,
  "isStale": false,
  "msg": "[HTTP] GET /result - status: RUNNING, ageMs: 6916, updatedAgeMs: 2100"
}

// Poll 3 - Complete!
{
  "level": "info",
  "time": "2026-01-30T20:42:25.300Z",
  "requestId": "req-new-1769805735234-abc123",
  "event": "getResult_returned",
  "hasResult": true,
  "status": "DONE_SUCCESS",
  "resultCount": 12,
  "photoUrlsSanitized": true,
  "msg": "[Observability] GET /result returned successfully with results"
}
```

**Result**: Search completes in ~10 seconds. Great UX! 🎉

---

## Scenario 2: Fresh RUNNING Job (Should Reuse)

### Step 1: Candidate Found (Fresh)
```json
{
  "level": "info",
  "time": "2026-01-30T20:45:10.100Z",
  "requestId": "req-dup-123",
  "candidateRequestId": "req-active-456",
  "event": "dedup_candidate_found",
  "status": "RUNNING",
  "ageMs": 15000,
  "updatedAgeMs": 2000,
  "progress": 60,
  "msg": "[Deduplication] Found candidate job for deduplication"
}
```

### Step 2: Decision - REUSE
```json
{
  "level": "info",
  "time": "2026-01-30T20:45:10.102Z",
  "requestId": "req-dup-123",
  "candidateRequestId": "req-active-456",
  "event": "dedup_decision",
  "decision": "REUSE",
  "reason": "RUNNING_FRESH (updatedAgeMs: 2000ms < 90000ms)",
  "status": "RUNNING",
  "ageMs": 15000,
  "updatedAgeMs": 2000,
  "maxAgeMs": 90000,
  "msg": "[Deduplication] Decision: REUSE - RUNNING_FRESH (updatedAgeMs: 2000ms < 90000ms)"
}
```

**Good**: Fresh job (updated 2s ago) is safely reused.

### Step 3: Duplicate Deduped
```json
{
  "level": "info",
  "time": "2026-01-30T20:45:10.104Z",
  "requestId": "req-active-456",
  "originalRequestId": "req-dup-123",
  "event": "duplicate_search_deduped",
  "status": "RUNNING",
  "ageMs": 15000,
  "updatedAgeMs": 2000,
  "msg": "[Deduplication] Reusing existing requestId for duplicate search"
}
```

**Result**: Duplicate request reuses active job. Efficient! ⚡

---

## Scenario 3: DONE_SUCCESS Cached Result

### Step 1: Candidate Found (Cached)
```json
{
  "level": "info",
  "time": "2026-01-30T20:46:20.500Z",
  "requestId": "req-dup-789",
  "candidateRequestId": "req-cached-321",
  "event": "dedup_candidate_found",
  "status": "DONE_SUCCESS",
  "ageMs": 3500,
  "updatedAgeMs": 3500,
  "progress": 100,
  "msg": "[Deduplication] Found candidate job for deduplication"
}
```

### Step 2: Decision - REUSE (Cached)
```json
{
  "level": "info",
  "time": "2026-01-30T20:46:20.502Z",
  "requestId": "req-dup-789",
  "candidateRequestId": "req-cached-321",
  "event": "dedup_decision",
  "decision": "REUSE",
  "reason": "CACHED_RESULT_AVAILABLE",
  "status": "DONE_SUCCESS",
  "ageMs": 3500,
  "updatedAgeMs": 3500,
  "maxAgeMs": 90000,
  "msg": "[Deduplication] Decision: REUSE - CACHED_RESULT_AVAILABLE"
}
```

**Good**: Completed job within 5s fresh window is reused.

### Step 3: Instant Result
```json
{
  "level": "info",
  "time": "2026-01-30T20:46:20.550Z",
  "requestId": "req-cached-321",
  "event": "getResult_returned",
  "hasResult": true,
  "status": "DONE_SUCCESS",
  "resultCount": 8,
  "msg": "[Observability] GET /result returned successfully with results"
}
```

**Result**: Instant cached result returned. Lightning fast! ⚡⚡⚡

---

## Scenario 4: DONE_FAILED Previous Job

### Step 1: Candidate Found (Failed)
```json
{
  "level": "info",
  "time": "2026-01-30T20:47:30.200Z",
  "requestId": "req-retry-555",
  "candidateRequestId": "req-failed-444",
  "event": "dedup_candidate_found",
  "status": "DONE_FAILED",
  "ageMs": 8000,
  "updatedAgeMs": 8000,
  "msg": "[Deduplication] Found candidate job for deduplication"
}
```

### Step 2: Decision - NEW_JOB
```json
{
  "level": "info",
  "time": "2026-01-30T20:47:30.202Z",
  "requestId": "req-retry-555",
  "candidateRequestId": "req-failed-444",
  "event": "dedup_decision",
  "decision": "NEW_JOB",
  "reason": "PREVIOUS_JOB_FAILED",
  "status": "DONE_FAILED",
  "ageMs": 8000,
  "updatedAgeMs": 8000,
  "maxAgeMs": 90000,
  "msg": "[Deduplication] Decision: NEW_JOB - PREVIOUS_JOB_FAILED"
}
```

**Good**: Failed job is not reused. User gets a fresh retry.

### Step 3: New Job Created
```json
{
  "level": "info",
  "time": "2026-01-30T20:47:30.205Z",
  "requestId": "req-retry-555",
  "event": "job_created",
  "msg": "[Observability] Job created with JWT session binding and idempotency key"
}
```

**Result**: New job created for retry. Second chance! 🔄

---

## Summary

| Scenario | Status | Age | Decision | Rationale |
|----------|--------|-----|----------|-----------|
| Stale RUNNING | RUNNING | 1,160s | NEW_JOB | No heartbeat > 90s TTL |
| Fresh RUNNING | RUNNING | 15s | REUSE | Updated 2s ago < 90s TTL |
| Cached SUCCESS | DONE_SUCCESS | 3.5s | REUSE | Within 5s fresh window |
| Failed Job | DONE_FAILED | 8s | NEW_JOB | Previous job failed |

**Key Improvements**:
- ✅ Stale jobs (19min old) are NOT reused
- ✅ Fresh active jobs (<90s) ARE reused
- ✅ Cached results (<5s) ARE reused
- ✅ Failed jobs are NOT reused
- ✅ Comprehensive logging for debugging
- ✅ Client gets metadata for stale jobs
