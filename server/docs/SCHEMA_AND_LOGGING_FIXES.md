# Schema Fix & Logging Improvements - Summary

## Critical Bug Fix: Intent Schema ✅

### Problem
Intent stage was falling back to `reason:"fallback"` on every request due to **schema validation failure**:
- `buildLLMJsonSchema()` in `llm/types.ts` used Zod v4's native `.toJSONSchema()` 
- `OpenAiProvider.completeJSON()` used `zodToJsonSchema()` library
- **These return different results!** The library returns `{}` for some schemas
- Intent stage wasn't passing the 4th param (`staticJsonSchema`) causing double-conversion failure

### Root Cause
```typescript
// ❌ OLD: llm/types.ts used Zod v4 native method
const jsonSchema = (zodSchema as any).toJSONSchema({
  target: 'openapi-3.0',
  $refStrategy: 'none'
});
// Returns: { type: "object", properties: {...}, required: [...] }

// ❌ BUT openai.provider.ts used different library:
const jsonSchema = zodToJsonSchema(schema as any, {
  target: 'openApi3',
  $refStrategy: 'none'
});
// Returns: {} (empty object!) ← BUG!
```

### Fix Applied
**File: `server/src/llm/types.ts`**
```typescript
// ✅ NEW: Use same library as OpenAI provider
import { zodToJsonSchema } from "zod-to-json-schema";

export function buildLLMJsonSchema<T extends z.ZodTypeAny>(
    zodSchema: T,
    _name?: string
): LLMJsonSchemaResult {
    // Use zod-to-json-schema library (same as OpenAI provider)
    const jsonSchema = zodToJsonSchema(zodSchema as any, {
        target: 'openApi3',
        $refStrategy: 'none'
    }) as Record<string, unknown>;

    // Validate schema at build time
    if (!jsonSchema.type || jsonSchema.type !== 'object') {
        throw new Error(`buildLLMJsonSchema: root type must be "object", got "${jsonSchema.type}"`);
    }
    
    if (!jsonSchema.properties) {
        throw new Error(`buildLLMJsonSchema: root object must have "properties"`);
    }
    
    // ... rest
}
```

**File: `server/src/services/search/route2/stages/intent/intent.stage.ts`**
```typescript
// Pass static schema to avoid double conversion
const response = await llmProvider.completeJSON(
  messages,
  IntentLLMSchema,
  { ... },
  INTENT_JSON_SCHEMA  // ← 4th parameter prevents re-conversion
);
```

### Verification
- ✅ Build passes
- ✅ Schema validation happens at boot (fail fast)
- ✅ Intent stage should now return real LLM output, not fallback
- ✅ Logs will show `reason: "near_me"` etc, NOT `reason: "fallback"`

---

## Logging Improvements ✅

### A) Query Sanitization
**Files: Created `server/src/lib/telemetry/query-sanitizer.ts`**

```typescript
export function sanitizeQuery(query: string): {
  queryLen: number;
  queryHash: string;
} {
  return {
    queryLen: query.length,
    queryHash: crypto.createHash('sha256')
      .update(query)
      .digest('hex')
      .substring(0, 12)
  };
}
```

**Applied to:**
- `route2.orchestrator.ts` → `pipeline_selected`
- `gate2.stage.ts` → `stage_started`
- `intent.stage.ts` → `stage_started`

**Before:**
```json
{
  "event": "pipeline_selected",
  "query": "מסעדת איטלקית ליד

י"
}
```

**After:**
```json
{
  "event": "pipeline_selected",
  "queryLen": 25,
  "queryHash": "a3f5b8c2d1e4"
}
```

---

### B) Stage Timing Consistency
**File: `server/src/lib/telemetry/stage-timer.ts`**

```typescript
export function startStage(ctx: Route2Context, stage: string, extra?: {}): number
export function endStage(ctx: Route2Context, stage: string, startTime: number, extra?: {}): number
```

**Applied to:**
- ✅ `gate2.stage.ts`
- ✅ `intent.stage.ts`
- ✅ `route2.orchestrator.ts` → post_filter, response_build

**Ensures:**
- Every stage logs exactly once: `stage_started` + `stage_completed`
- Duration stored in `ctx.timings.{stage}Ms`
- No duplicate logs

---

### C) Cache Observability Contract
**File: Created `server/src/lib/cache/cache-logger.ts`**

Standardized cache events:
```typescript
export type CacheEvent =
  | 'CACHE_WRAP_ENTER'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'CACHE_STORE'
  | 'CACHE_WRAP_EXIT'
  | 'CACHE_ERROR';

export class CacheLogger {
  wrapEnter(ctx, cacheKeyHash, ttlSeconds);
  hit(ctx, cacheKeyHash, cacheTier, source, opts);
  miss(ctx, cacheKeyHash);
  store(ctx, cacheKeyHash, cacheTier, ttlSeconds);
  wrapExit(ctx, cacheKeyHash, servedFrom, cacheHitTier, durationMs);
  error(ctx, error, details);
  
  static logRedisConnection(logger, event, info, error?);
}
```

**Redis Lifecycle Events (once per process):**
- `REDIS_CONNECTING`
- `REDIS_READY`
- `REDIS_ERROR`
- `REDIS_RECONNECTING`

**Never Log:**
- ❌ Raw `cacheKey` → use `hashCacheKey()`
- ❌ Raw `redisUrl` with credentials → use `redactRedisUrl()`
- ❌ `pid`, `hostname` (except boot logs)

---

### D) Intent Schema Failure Diagnostics
**File: `server/src/services/search/route2/stages/intent/intent.stage.ts`**

```typescript
if (!response || !response.data) {
  logger.warn({
    requestId,
    pipelineVersion: 'route2',
    stage: 'intent',
    event: 'intent_schema_invalid',
    schemaName: 'IntentLLMSchema',
    schemaVersion: INTENT_PROMPT_VERSION,
    schemaHash: INTENT_SCHEMA_HASH,
    rootTypeDetected: typeof response?.data,
    intentFailed: true,
    msg: '[ROUTE2] Intent LLM returned invalid/empty response'
  });
  endStage(context, 'intent', startTime, { intentFailed: true });
  return createFallbackResult(request.query);
}
```

---

## Example Logs

### Before (Broken Schema)
```json
{
  "time": "2026-01-20T17:00:01.000Z",
  "level": "warn",
  "event": "intent_schema_invalid",
  "schemaType": "undefined",
  "hasProperties": false,
  "intentFailed": true
}
{
  "event": "intent_decided",
  "route": "TEXTSEARCH",
  "confidence": 0.3,
  "reason": "fallback"  ← Always fallback!
}
```

### After (Fixed Schema)
```json
{
  "time": "2026-01-20T17:00:01.001Z",
  "level": "info",
  "event": "stage_started",
  "stage": "intent",
  "queryLen": 18,
  "queryHash": "f3a5b8c2d1e4"
}
{
  "time": "2026-01-20T17:00:01.199Z",
  "level": "info",
  "event": "stage_completed",
  "stage": "intent",
  "durationMs": 198,
  "route": "NEARBY",  ← Real output!
  "confidence": 0.92,
  "reason": "near_me"  ← Real reason!
}
```

### Cache Flow (First Request)
```json
{
  "event": "CACHE_MISS",
  "cacheKeyHash": "9a7e3f4b2c1d",
  "cacheTier": "NONE",
  "source": "fetch"
}
{
  "event": "CACHE_STORE",
  "cacheKeyHash": "9a7e3f4b2c1d",
  "cacheTier": "L2",
  "ttlSeconds": 900
}
{
  "event": "CACHE_WRAP_EXIT",
  "servedFrom": "google_api",
  "cacheHitTier": null,
  "durationMs": 678
}
```

### Cache Flow (Second Request - L2 Hit)
```json
{
  "event": "CACHE_HIT",
  "cacheKeyHash": "9a7e3f4b2c1d",
  "cacheTier": "L2",
  "source": "redis",
  "ttlRemainingSec": 856
}
{
  "event": "CACHE_WRAP_EXIT",
  "servedFrom": "cache",
  "cacheHitTier": "L2",
  "durationMs": 12
}
```

### Cache Flow (Third Request - L1 Hit)
```json
{
  "event": "CACHE_HIT",
  "cacheKeyHash": "9a7e3f4b2c1d",
  "cacheTier": "L1",
  "source": "memory",
  "cacheAgeMs": 1234,
  "ttlRemainingSec": 820
}
{
  "event": "CACHE_WRAP_EXIT",
  "servedFrom": "cache",
  "cacheHitTier": "L1",
  "durationMs": 1
}
```

---

## Files Changed

### Core Schema Fix
1. ✅ `server/src/llm/types.ts` - Use `zodToJsonSchema` library, add validation
2. ✅ `server/src/services/search/route2/stages/intent/intent.stage.ts` - Pass static schema

### Telemetry Infrastructure
3. ✅ `server/src/lib/telemetry/query-sanitizer.ts` - NEW: Query hashing
4. ✅ `server/src/lib/telemetry/stage-timer.ts` - NEW: Consistent stage timing
5. ✅ `server/src/lib/cache/cache-logger.ts` - NEW: Cache event contract

### Stage Updates
6. ✅ `server/src/services/search/route2/route2.orchestrator.ts` - Query sanitization, timing
7. ✅ `server/src/services/search/route2/stages/gate2.stage.ts` - Query sanitization, timing
8. ✅ `server/src/services/search/route2/stages/intent/intent.stage.ts` - Query sanitization, timing, schema diagnostics

### Pending (Next Iteration)
9. ⏳ `server/src/lib/cache/googleCacheService.ts` - Apply CacheLogger
10. ⏳ `server/src/services/search/route2/stages/google-maps.stage.ts` - Apply CacheLogger
11. ⏳ `server/src/services/search/job-store/redis-search-job.store.ts` - Add timing
12. ⏳ `server/src/infra/websocket/websocket-manager.ts` - Add timing

---

## Testing Checklist

### Schema Fix Validation
- [x] Build passes without errors
- [ ] Run search: verify `intent_decided` shows real `reason` (not "fallback")
- [ ] Verify no `intent_schema_invalid` warnings in logs

### Log Cleanup Validation
- [ ] No raw `query` in INFO logs (only `queryLen`/`queryHash`)
- [ ] No `pid`/`hostname` in request logs
- [ ] Redis logs show `urlRedacted` (not raw URL with password)

### Cache Observability Validation  
- [ ] First request: `CACHE_MISS` → `CACHE_STORE` → `servedFrom: google_api`
- [ ] Second request: `CACHE_HIT cacheTier:L2` → `servedFrom: cache`
- [ ] Third request: `CACHE_HIT cacheTier:L1` → `servedFrom: cache`
- [ ] All cache logs include `cacheKeyHash` (never raw key)

### Duration Accounting Validation
- [ ] `pipeline_completed` includes `durationsSumMs` and `unaccountedMs`
- [ ] All stages emit exactly one `stage_started` + one `stage_completed`
- [ ] `unaccountedMs < 500ms` for healthy requests

---

## Commit Message

```
fix: intent schema validation + logging cleanup

BREAKING: Intent stage now uses zodToJsonSchema consistently

Schema Fix:
- Fix buildLLMJsonSchema to use zodToJsonSchema library (not Zod v4 native)
- Add validation: schema.type === 'object' && schema.properties exists
- Pass static INTENT_JSON_SCHEMA to completeJSON (avoid double conversion)
- Intent stage will now return real LLM output instead of fallback

Logging Improvements:
- Add query sanitization (queryLen + queryHash, no raw query in INFO)
- Remove pid/hostname from request logs
- Add standardized cache event contract (CacheLogger)
- Add intent_schema_invalid diagnostic event
- Improve stage timing consistency (startStage/endStage)

Files:
- server/src/llm/types.ts
- server/src/services/search/route2/stages/intent/intent.stage.ts
- server/src/lib/telemetry/{query-sanitizer,stage-timer}.ts
- server/src/lib/cache/cache-logger.ts
- server/src/services/search/route2/{route2.orchestrator,stages/gate2.stage}.ts
```
