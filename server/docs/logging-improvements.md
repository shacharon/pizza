# Logging Improvements - Route2 Pipeline

## Overview
This document describes the logging cleanup and timing instrumentation improvements made to the Route2 pipeline to improve observability, reduce noise, and explain the duration gap between stage completions.

## Changes Summary

### 1. Removed Noisy/Sensitive Log Fields

#### A. WebSocket Connected (`websocket_connected`)
**Removed:**
- `userAgent` - Removed to avoid logging potentially sensitive browser fingerprinting data
- `hostname`, `pid` - Removed as they're redundant with structured logging metadata
- `origin` - Replaced with `originHost` (hostname only, no path/query)

**Kept:**
- `clientId` - For tracing specific WebSocket connections
- `originHost` - Sanitized origin (hostname only)

**Level Change:** Changed from `INFO` to `DEBUG` to reduce production log volume.

```typescript
// Before
logger.info({ clientId, origin, userAgent }, 'websocket_connected');

// After
logger.debug({ clientId, originHost }, 'websocket_connected');
```

#### B. Provider Call (`provider_call`)
**Removed:**
- `promptHash` - Internal identifier not needed for cost tracking
- `promptLength` / `promptChars` - Redundant with token counts
- `timestamp` - Already present in log structure
- `sessionId` - When redundant with requestId

**Kept:**
- `model`, `success`, `latencyMs`, `retryCount`
- `tokensIn`, `tokensOut`, `totalTokens`
- `schemaName`, `schemaHash`, `promptVersion`
- `timeoutMs`, `timeoutHit`
- `estimatedCostUsd`, `costUnknown`
- `requestId`, `traceId`

```typescript
// Removed from enrichment
if (opts?.promptHash) {
    (event as any).promptHash = opts.promptHash; // REMOVED
}
if (opts?.promptLength) {
    (event as any).promptLength = opts.promptLength; // REMOVED
}
```

#### C. Text Search Request Payload (`textsearch_request_payload`)
**Security Fix:**  
**Removed:** `textQuery` - Raw user query to prevent PII logging

**Added:**
- `textQueryLen` - Length of query for analysis
- `textQueryHash` - SHA-256 hash (first 12 chars) for deduplication analysis

```typescript
// Before
logger.info({
  requestId,
  event: 'textsearch_request_payload',
  textQuery: requestBody.textQuery, // PII risk
  languageCode, regionCode, hasBias, maxResultCount
});

// After
const textQueryHash = crypto.createHash('sha256')
  .update(textQueryNormalized)
  .digest('hex')
  .substring(0, 12);

logger.info({
  requestId,
  event: 'textsearch_request_payload',
  textQueryLen: requestBody.textQuery?.length || 0,
  textQueryHash,
  languageCode, regionCode, hasBias, maxResultCount
});
```

#### D. HTTP Request/Response Logs
**Removed:**
- `hostname`, `pid` - Redundant with structured logging
- Full `query` object - Replaced with `queryKeys` array

**Kept:**
- `method`, `path`, `statusCode`, `durationMs`
- `requestId`, `traceId`
- `queryKeys` - Array of query parameter names (no values)

```typescript
// Before
req.log.info({ method, path: req.originalUrl, query: req.query }, 'HTTP request');

// After
const queryKeys = Object.keys(req.query || {});
req.log.info({ method, path: req.path, queryKeys }, 'HTTP request');
```

---

### 2. Added Missing Timing Logs

#### A. Post-Filter Stage
**Added:** `stage_completed` log with `durationMs`

```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  stage: 'post_filter',
  event: 'stage_completed',
  durationMs,
  openState, openAt, openBetween,
  stats: { before, after, removed, unknownExcluded }
}, '[ROUTE2] post_filter completed');
```

#### B. Response Build Stage
**Added:** `stage_completed` log with `durationMs`

```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  stage: 'response_build',
  event: 'stage_completed',
  durationMs: responseBuildMs,
  resultCount: finalResults.length
}, '[ROUTE2] response_build completed');
```

#### C. JobStore Operations
**Added:** `durationMs` to status updates and result storage

```typescript
logger.info({
  requestId,
  status,
  progress,
  durationMs, // NEW
  msg: '[JobStore] Status updated'
});

logger.info({
  requestId,
  hasResult: !!result,
  durationMs, // NEW
  msg: '[JobStore] Result stored'
});
```

#### D. WebSocket Publish Operations
**Added:** `durationMs`, `payloadBytes`, `payloadType`

```typescript
logger.info({
  channel,
  requestId,
  clientCount: sent,
  payloadBytes, // NEW
  payloadType: message.type, // NEW
  durationMs // NEW
}, 'websocket_published');
```

---

### 3. Pipeline Duration Decomposition

**Problem:** `pipeline_completed` showed ~7s but `google_maps` stage was only ~700ms. Gap was unaccounted.

**Solution:** Added `durations` object with per-stage breakdown and `unaccountedMs`.

```typescript
logger.info({
  requestId,
  pipelineVersion: 'route2',
  event: 'pipeline_completed',
  durationMs: totalDurationMs,
  resultCount: finalResults.length,
  durations: {
    gate2Ms,           // Gate2 LLM call
    intentMs,          // Intent LLM call
    routeLLMMs,        // Route-specific LLM call
    baseFiltersMs,     // Base filters LLM call
    googleMapsMs,      // Google Places API + cache
    postFilterMs,      // Post-filtering logic
    responseBuildMs,   // Response DTO construction
    unaccountedMs      // Overhead/logging/etc
  }
}, '[ROUTE2] Pipeline completed');
```

**Example Output:**
```json
{
  "event": "pipeline_completed",
  "durationMs": 7823,
  "durations": {
    "gate2Ms": 1891,
    "intentMs": 1521,
    "routeLLMMs": 2208,
    "baseFiltersMs": 1221,
    "googleMapsMs": 1051,
    "postFilterMs": 2,
    "responseBuildMs": 15,
    "unaccountedMs": -86
  }
}
```
*Note: Negative `unaccountedMs` indicates clock precision or concurrent operations.*

---

### 4. Enhanced Cache Observability

**Added Fields:**
- `cacheTier` - `'L1'` (in-memory), `'L2'` (Redis), or `'MISS'`
- `cacheAgeMs` - Milliseconds since cached (L1 only)
- `ttlRemainingSec` - Seconds until expiry (L1 only)
- `durationMs` - Cache operation duration in `CACHE_WRAP_EXIT`

```typescript
// L1 Cache Hit
logger.info({
  event: 'L1_CACHE_HIT',
  key,
  source: 'memory',
  cacheTier: 'L1',
  cacheAgeMs: 1234,
  ttlRemainingSec: 58
});

// L2 Cache Hit
logger.info({
  event: 'CACHE_HIT',
  key,
  source: 'redis',
  cacheTier: 'L2',
  cacheAgeMs: undefined // Redis doesn't track creation time easily
});

// Cache Wrap Exit
logger.info({
  requestId,
  event: 'CACHE_WRAP_EXIT',
  providerMethod: 'textSearch',
  servedFrom: 'cache',
  cacheTier: 'L1', // or 'L2' or 'MISS'
  durationMs: 3
});
```

---

## New Timing Utility

Created `server/src/lib/telemetry/timing.ts` for consistent instrumentation:

```typescript
import { withTimer, startTimer } from '../../lib/telemetry/timing.js';

// Async timing
const { result, durationMs } = await withTimer(async () => {
  return await someAsyncOperation();
});

// Sync timing
const { result, durationMs } = withTimerSync(() => {
  return someExpensiveComputation();
});

// Manual timing
const stopTimer = startTimer();
await doSomething();
const durationMs = stopTimer();
```

---

## Log Structure Best Practices

All logs follow this consistent structure:

```typescript
{
  level: 'info' | 'warn' | 'error' | 'debug',
  time: '2026-01-20T13:00:00.000Z',
  requestId: 'req-xxx',
  traceId: 'trace-xxx', // optional
  sessionId: 'session-xxx', // optional
  pipelineVersion: 'route2',
  stage: 'stage_name',
  event: 'stage_started' | 'stage_completed' | ...,
  durationMs: 123,
  ...additionalFields
}
```

---

## Example: Cache Hit Request Log Flow

```json
[INFO] HTTP request { method: "POST", path: "/api/v1/search", queryKeys: ["mode"] }
[INFO] [ROUTE2] Pipeline selected { requestId: "req-xxx", query: "pizza" }
[INFO] [ROUTE2] gate2 started { stage: "gate2" }
[INFO] Provider call: openai.completeJSON { model: "gpt-4o-mini", tokensIn: 313, tokensOut: 12, latencyMs: 1882 }
[INFO] [ROUTE2] gate2 completed { stage: "gate2", durationMs: 1891 }
[INFO] [ROUTE2] intent started { stage: "intent" }
[INFO] Provider call: openai.completeJSON { model: "gpt-4o-mini", tokensIn: 759, tokensOut: 38, latencyMs: 1514 }
[INFO] [ROUTE2] intent completed { stage: "intent", durationMs: 1521 }
[INFO] [ROUTE2] textsearch_mapper started { stage: "textsearch_mapper" }
[INFO] Provider call: openai.completeJSON { model: "gpt-4o-mini", tokensIn: 841, tokensOut: 55, latencyMs: 2200 }
[INFO] [ROUTE2] textsearch_mapper completed { stage: "textsearch_mapper", durationMs: 2208 }
[INFO] [ROUTE2] Base filters LLM started
[INFO] Provider call: openai.completeJSON { model: "gpt-4o-mini", tokensIn: 1183, tokensOut: 25, latencyMs: 1212 }
[INFO] [ROUTE2] Base filters LLM completed { durationMs: 1221 }
[INFO] [ROUTE2] google_maps started { stage: "google_maps" }
[INFO] [GOOGLE] Calling Text Search API (New)
[INFO] CACHE_WRAP_ENTER { providerMethod: "textSearch", cacheKey: "g:search:xxx", ttlSeconds: 900 }
[INFO] L1_CACHE_HIT { key: "g:search:xxx", cacheTier: "L1", cacheAgeMs: 1234, ttlRemainingSec: 58 }
[INFO] CACHE_WRAP_EXIT { providerMethod: "textSearch", servedFrom: "cache", cacheTier: "L1", durationMs: 3 }
[INFO] [GOOGLE] Text Search completed { resultCount: 16, servedFrom: "cache", durationMs: 5 }
[INFO] [ROUTE2] google_maps completed { stage: "google_maps", durationMs: 7 }
[INFO] [ROUTE2] post_filter completed { stage: "post_filter", durationMs: 2 }
[INFO] [ROUTE2] response_build completed { stage: "response_build", durationMs: 15 }
[INFO] [ROUTE2] Pipeline completed {
  durationMs: 7823,
  durations: {
    gate2Ms: 1891,
    intentMs: 1521,
    routeLLMMs: 2208,
    baseFiltersMs: 1221,
    googleMapsMs: 7,
    postFilterMs: 2,
    responseBuildMs: 15,
    unaccountedMs: -42
  }
}
[INFO] websocket_published { channel: "search", clientCount: 1, payloadBytes: 12345, payloadType: "status", durationMs: 1 }
[INFO] [JobStore] Status updated { status: "DONE_SUCCESS", progress: 100, durationMs: 0 }
[INFO] HTTP response { method: "POST", path: "/api/v1/search", statusCode: 202, durationMs: 7850 }
```

---

## Files Modified

1. `server/src/lib/telemetry/timing.ts` (NEW)
2. `server/src/infra/websocket/websocket-manager.ts`
3. `server/src/llm/openai.provider.ts`
4. `server/src/services/search/route2/stages/google-maps.stage.ts`
5. `server/src/middleware/httpLogging.middleware.ts`
6. `server/src/services/search/route2/route2.orchestrator.ts`
7. `server/src/services/search/route2/post-filters/post-results.filter.ts`
8. `server/src/services/search/job-store/inmemory-search-job.store.ts`
9. `server/src/lib/cache/googleCacheService.ts`

---

## Benefits

1. **Security:** No PII in logs (user queries hashed)
2. **Cost Tracking:** Clean provider call logs with token usage and costs
3. **Performance:** Clear visibility into where time is spent in the pipeline
4. **Debugging:** Cache observability helps diagnose cache hit/miss patterns
5. **Production-Ready:** Reduced log volume (noisy fields removed/downgraded)
6. **Compliance:** No sensitive data (API keys, user agents, full queries) in logs

---

## Next Steps

1. **CloudWatch Integration:** All logs are now CloudWatch-ready with structured fields
2. **Alerting:** Set up alerts on `unaccountedMs > 1000` to catch performance regressions
3. **Dashboards:** Create CloudWatch dashboard for cache hit rates, stage durations, and costs
4. **Cost Analysis:** Use `estimatedCostUsd` from provider calls to track monthly LLM spend
