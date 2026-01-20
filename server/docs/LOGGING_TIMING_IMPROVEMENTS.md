# Route2 Logging & Timing Improvements

## Summary of Changes

### A) Log Cleanup ✅

**Removed Fields (Noise/PII Reduction)**:
- ❌ `pid`, `hostname` - removed from all logs
- ❌ Raw `query` - replaced with `queryLen` + `queryHash` (SHA256, first 12 chars)
- ❌ `promptHash`, `promptChars`, `promptLength` - removed from provider logs
- ❌ Raw `textQuery` in Google logs (already using hash)

**Kept Fields (Signal)**:
- ✅ `model`, `success`, `latencyMs`, `tokensIn`/`out`/`total`
- ✅ `retryCount`, `schemaName`, `schemaHash`, `promptVersion`
- ✅ `timeoutMs`/`timeoutHit`, `estimatedCostUsd`
- ✅ `requestId`, `traceId`, `sessionId` (when relevant)

**New Sanitization Helpers**:
```typescript
// server/src/lib/telemetry/query-sanitizer.ts
sanitizeQuery(query: string) => { queryLen, queryHash }
redactRedisUrl(url: string) => { redisHost, redisPort, redacted }
```

---

### B) Timing Instrumentation ✅

**New Timer Helper**:
```typescript
// server/src/lib/telemetry/stage-timer.ts
startStage(ctx, stage, extra) => startTime  // Logs stage_started
endStage(ctx, stage, startTime, extra) => durationMs  // Logs stage_completed, stores in ctx.timings
```

**Added Timing For**:
1. ✅ **post_filter**: `stage_started` + `stage_completed` with `stats`
2. ✅ **response_build**: `stage_started` + `stage_completed` with `resultCount`
3. ⏳ **jobstore_write**: Need to instrument RedisJobStore operations
4. ⏳ **ws_publish**: Need to measure publish end-to-end

**Pipeline Summary**:
```json
{
  "event": "pipeline_completed",
  "durationMs": 5234,
  "durationsSumMs": 1960,
  "unaccountedMs": 3274,
  "durations": {
    "gate2Ms": 245,
    "intentMs": 198,
    "routeLLMMs": 421,
    "baseFiltersMs": 312,
    "googleMapsMs": 678,
    "postFilterMs": 12,
    "responseBuildMs": 8
  }
}
```

---

### C) Cache Log Consistency ⏳

**Target**: Fix inconsistency where `CACHE_STORE` says `L2` but `CACHE_WRAP_EXIT` says `MISS`.

**Current Implementation** (in GoogleCacheService):
- `L1_CACHE_HIT` → `cacheTier: "L1"`
- `CACHE_HIT` (Redis) → `cacheTier: "L2"`
- `CACHE_STORE` → `cacheTier: "L2"`

**Need to Add** (in google-maps.stage.ts):
```typescript
logger.info({
  event: 'CACHE_WRAP_EXIT',
  servedFrom: fromCache ? 'cache' : 'google_api',
  cacheHitTier: fromCache ? (tier === 'L1' ? 'L1' : 'L2') : null,
  cacheStoreTier: !fromCache ? 'L2' : null
});
```

---

### D) Intent Schema Failure Diagnostics ✅

**Added**:
```typescript
// When schema is invalid/undefined:
{
  "event": "intent_schema_invalid",
  "schemaName": "IntentLLMSchema",
  "schemaVersion": "intent_v2",
  "schemaHash": "abc123...",
  "rootTypeDetected": "undefined",
  "intentFailed": true
}

// Fallback log includes:
{
  "event": "stage_completed",
  "stage": "intent",
  "intentFailed": true
}
```

---

## Files Changed

### Core Infrastructure
1. ✅ `server/src/lib/telemetry/stage-timer.ts` - NEW: Stage timing utilities
2. ✅ `server/src/lib/telemetry/query-sanitizer.ts` - NEW: PII sanitization
3. ✅ `server/src/lib/telemetry/timing.ts` - EXISTING: Generic timers (kept for compatibility)

### Route2 Pipeline
4. ✅ `server/src/services/search/route2/route2.orchestrator.ts` - Pipeline orchestration
   - Added `sanitizeQuery` for pipeline_selected log
   - Added `startStage`/`endStage` for post_filter and response_build
   - Fixed duration decomposition to use correct property names
   - Added `durationsSumMs` and `unaccountedMs` to pipeline_completed

5. ✅ `server/src/services/search/route2/stages/gate2.stage.ts` - Gate2 stage
   - Removed raw query from logs, added queryLen/queryHash
   - Using startStage/endStage for timing
   - Removed manual timing storage (handled by endStage)

6. ✅ `server/src/services/search/route2/stages/intent/intent.stage.ts` - Intent stage
   - Added intent_schema_invalid diagnostic event
   - Using startStage/endStage for timing
   - Added intentFailed flag to fallback logs

### Pending Updates
7. ⏳ `server/src/services/search/job-store/redis-search-job.store.ts` - JobStore timing
8. ⏳ `server/src/infra/websocket/websocket-manager.ts` - WS publish timing
9. ⏳ `server/src/services/search/route2/stages/google-maps.stage.ts` - Cache tier consistency
10. ⏳ `server/src/llm/openai.provider.ts` - Provider log cleanup

---

## Example Logs

### Intent Schema Failure
```json
{
  "time": "2026-01-20T16:45:23.123Z",
  "level": "warn",
  "requestId": "req_abc123",
  "pipelineVersion": "route2",
  "stage": "intent",
  "event": "intent_schema_invalid",
  "schemaName": "IntentLLMSchema",
  "schemaVersion": "intent_v2",
  "schemaHash": "7f3a9b2c",
  "rootTypeDetected": "undefined",
  "intentFailed": true,
  "msg": "[ROUTE2] Intent LLM returned invalid/empty response"
}
```

### Stage Timing
```json
{
  "time": "2026-01-20T16:45:23.001Z",
  "level": "info",
  "requestId": "req_abc123",
  "pipelineVersion": "route2",
  "stage": "intent",
  "event": "stage_started",
  "queryLen": 25,
  "queryHash": "a3f5b8c2d1e4",
  "msg": "[ROUTE2] intent started"
}

{
  "time": "2026-01-20T16:45:23.199Z",
  "level": "info",
  "requestId": "req_abc123",
  "pipelineVersion": "route2",
  "stage": "intent",
  "event": "stage_completed",
  "durationMs": 198,
  "route": "TEXTSEARCH",
  "confidence": 0.92,
  "reason": "general_query",
  "msg": "[ROUTE2] intent completed"
}
```

### Pipeline Completed (with decomposition)
```json
{
  "time": "2026-01-20T16:45:28.234Z",
  "level": "info",
  "requestId": "req_abc123",
  "pipelineVersion": "route2",
  "event": "pipeline_completed",
  "durationMs": 5234,
  "durationsSumMs": 1960,
  "unaccountedMs": 3274,
  "resultCount": 15,
  "postFilters": {
    "applied": { "openState": "ANY" },
    "beforeCount": 20,
    "afterCount": 15
  },
  "durations": {
    "gate2Ms": 245,
    "intentMs": 198,
    "routeLLMMs": 421,
    "baseFiltersMs": 312,
    "googleMapsMs": 678,
    "postFilterMs": 12,
    "responseBuildMs": 8
  },
  "msg": "[ROUTE2] Pipeline completed"
}
```

---

## Next Steps

1. ⏳ Add JobStore timing (job_create_ms, status_update_ms, result_store_ms)
2. ⏳ Add WS publish timing (ws_publish_ms per payloadType)
3. ⏳ Fix cache tier consistency in google-maps.stage.ts
4. ⏳ Clean up provider logs (remove promptHash/promptChars)
5. ⏳ Clean up Google logs (fieldMaskPreset + fieldMaskCount)
6. ⏳ Add debug_dump level filtering (DEBUG only)
7. ✅ Test with real searches and verify timing decomposition

---

## Testing Checklist

- [ ] Run search, verify `queryLen`/`queryHash` in logs (not raw query)
- [ ] Verify `stage_started`/`stage_completed` for all stages
- [ ] Check `pipeline_completed` has correct `durations` object
- [ ] Verify `unaccountedMs` is reasonable (<1000ms for healthy run)
- [ ] Test intent schema failure (mock invalid LLM response)
- [ ] Verify `intentFailed: true` appears in logs
- [ ] Check no `pid`/`hostname` in logs
- [ ] Verify `durationsSumMs + unaccountedMs ≈ durationMs`
