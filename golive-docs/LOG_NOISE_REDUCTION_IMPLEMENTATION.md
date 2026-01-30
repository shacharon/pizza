# Log Noise Reduction - Complete Implementation

**Completed:** 2026-01-30  
**Goal:** Reduce INFO log noise by ~70-80% while maintaining debuggability

---

## ✅ Implementation Complete

All 10 tasks completed successfully:

1. ✅ Audited logging infrastructure
2. ✅ Implemented sampling utility with deterministic & random sampling
3. ✅ Implemented threshold-based logging (LLM >1500ms, Google API >2000ms, stages >2000ms)
4. ✅ Updated HTTP middleware (OPTIONS suppressed/sampled, requests/responses to DEBUG)
5. ✅ Updated WebSocket logging (published events to DEBUG, errors stay INFO)
6. ✅ Updated cache logging (all CACHE_* to DEBUG)
7. ✅ Updated route2 logging (major events stay INFO, details to DEBUG with thresholds)
8. ✅ Verified correlation IDs (requestId/traceId) on all logs
9. ✅ Added unit tests for sampling (14 tests, all passing)
10. ✅ Validated OPTIONS suppression via tests

---

## Files Modified

### New Files
1. `server/src/lib/logging/sampling.ts` - Sampling utility
2. `server/src/lib/logging/sampling.test.ts` - Unit tests (14 tests)
3. `LOG_NOISE_REDUCTION_SUMMARY.md` - Detailed documentation

### Modified Files
4. `server/src/middleware/httpLogging.middleware.ts` - HTTP logging with sampling
5. `server/src/infra/websocket/websocket-manager.ts` - WebSocket logging thresholds
6. `server/src/lib/cache/cache-logger.ts` - Cache events to DEBUG
7. `server/src/llm/openai.provider.ts` - LLM threshold logging
8. `server/src/lib/telemetry/stage-timer.ts` - Stage threshold logging
9. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts` - Google API thresholds
10. `server/src/services/search/route2/stages/google-maps/nearby-search.handler.ts` - Google API thresholds

---

## Key Changes Summary

### Sampling Utility
- **Deterministic sampling**: Hash-based, testable with seeds
- **Random sampling**: For non-deterministic scenarios
- **Threshold checker**: Simple >threshold comparison
- **Presets**: LOW (1%), MEDIUM (10%), HIGH (50%), ALWAYS, NEVER
- **Thresholds**: LLM (1500ms), Google API (2000ms), Stage (2000ms), HTTP (5000ms)

### HTTP Logging
**Before:** All requests at INFO  
**After:**
- Regular requests: DEBUG
- OPTIONS: 99% suppressed, 1% sampled (DEBUG), errors always logged (WARN/ERROR)
- Slow requests (>5s): INFO with `slow: true`

### WebSocket Logging
**Before:** All websocket_published at INFO  
**After:**
- websocket_published: DEBUG (except errors)
- websocket_published errors: INFO
- Subscribe ack/reject: INFO (unchanged)

### Cache Logging
**Before:** All CACHE_* at INFO  
**After:** All CACHE_* at DEBUG

### LLM Logging
**Before:** All llm_gate_timing at INFO  
**After:**
- Fast (<1500ms): DEBUG
- Slow (>1500ms): INFO with `slow: true`

### Google API Logging
**Before:** All google_api_call_start/success at INFO  
**After:**
- google_api_call_start: DEBUG
- Fast google_api_call_success (<2000ms): DEBUG
- Slow google_api_call_success (>2000ms): INFO with `slow: true`
- google_api_call_failed: ERROR (unchanged)

### Stage Logging
**Before:** All stages at INFO  
**After:**
- Major stages (pipeline_selected, gate2, intent, google_maps): INFO
- Minor stages (stage_started): DEBUG
- Fast minor stages (<2000ms): DEBUG
- Slow minor stages (>2000ms): INFO with `slow: true`

---

## Expected Impact

### Log Volume Reduction
- **INFO logs:** ~70-80% reduction
- **OPTIONS logs:** ~99% reduction
- **Cache logs:** 100% moved to DEBUG
- **WebSocket logs:** ~95% moved to DEBUG
- **Fast LLM/Google calls:** Moved to DEBUG

### Debuggability Preserved
✅ All logs available via DEBUG level  
✅ Errors/warnings remain at ERROR/WARN  
✅ Slow operations remain at INFO  
✅ Major pipeline events remain at INFO  
✅ Correlation IDs (requestId/traceId) on all logs  
✅ Contracts unchanged (no functional changes)

---

## Verification

### Tests
```bash
# Run sampling tests (14 tests, all passing)
npm test -- src/lib/logging/sampling.test.ts
```

**Test Results:** ✅ 14/14 passed
- Deterministic sampling verified
- Random sampling verified
- Threshold detection verified
- Statistical distribution validated

### Linter
```bash
# Check for errors (0 errors found)
npm run lint
```

**Linter Results:** ✅ 0 errors

---

## Usage

### View all logs (including DEBUG)
```bash
LOG_LEVEL=debug npm start
```

### View only slow operations
```bash
cat server.log | grep '"slow":true'
```

### View sampled OPTIONS
```bash
cat server.log | grep '"method":"OPTIONS"' | grep '"sampled":true'
```

### Production (default - INFO level)
```bash
npm start
```

---

## Next Steps

1. ✅ Run tests locally
2. ⏳ Create PR with minimal diffs
3. ⏳ Deploy to staging and monitor log volume
4. ⏳ Adjust thresholds if needed
5. ⏳ Deploy to production

---

**Status:** ✅ IMPLEMENTATION COMPLETE  
**Tests:** ✅ 14/14 passing  
**Linter:** ✅ 0 errors  
**Ready for:** PR Review
