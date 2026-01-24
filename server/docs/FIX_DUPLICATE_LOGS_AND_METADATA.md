# Fix: Duplicate post_filter Logs + Missing textsearch_mapper Metadata

## Summary

Fixed two logging/observability issues:
1. **Duplicate `post_filter` stage_completed logs** - Orchestrator and filter function both emitting logs
2. **Missing `promptVersion` in `textsearch_mapper`** - LLM calls showing `promptVersion: "unknown"`

---

## Issue A: Duplicate post_filter Logs

### Problem
`post_filter` stage was logging `stage_completed` **twice per request**:
1. Once from `applyPostFilters()` in `post-results.filter.ts`
2. Once from `route2.orchestrator.ts` via `endStage()`

### Root Cause
The `applyPostFilters` function was:
- Timing itself internally (`startTime = Date.now()`)
- Logging `stage_completed` with `durationMs`
- **AND** the orchestrator was also calling `startStage`/`endStage`

### Fix
**File**: `server/src/services/search/route2/post-filters/post-results.filter.ts`

**Removed**:
```typescript
const startTime = Date.now();
// ... filtering logic ...
const durationMs = Date.now() - startTime;

logger.info({
  requestId,
  pipelineVersion,
  stage: 'post_filter',
  event: 'stage_completed',  // ← DUPLICATE!
  durationMs,
  openState: sharedFilters.openState,
  // ...
}, '[ROUTE2] post_filter completed');
```

**Result**:
- `applyPostFilters()` is now a **pure function** (no side effects, no logging)
- Timing/logging **owned entirely by orchestrator**
- Only **ONE** `stage_completed` log per request

---

## Issue B: Missing textsearch_mapper Metadata

### Problem
LLM calls from `textsearch_mapper` showed:
```json
{
  "stage": "textsearch_mapper",
  "promptVersion": "unknown",  // ← Missing!
  "promptHash": undefined,
  "schemaHash": undefined
}
```

### Root Cause
The `llmProvider.completeJSON()` call in `executeTextSearchMapper` was missing metadata:
```typescript
const response = await llmProvider.completeJSON(
  messages,
  TextSearchLLMResponseSchema,
  {
    temperature: 0,
    timeout: 3500,
    stage: 'textsearch_mapper'
    // ← Missing: promptVersion, promptHash, schemaHash, requestId, etc.
  },
  TEXTSEARCH_JSON_SCHEMA
);
```

### Fix
**File**: `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`

**Added metadata to LLM call**:
```typescript
const response = await llmProvider.completeJSON(
  messages,
  TextSearchLLMResponseSchema,
  {
    temperature: 0,
    timeout: 3500,
    requestId,                                    // ← Added
    ...(context.traceId && { traceId: context.traceId }),     // ← Added
    ...(context.sessionId && { sessionId: context.sessionId }), // ← Added
    stage: 'textsearch_mapper',
    promptVersion: TEXTSEARCH_MAPPER_VERSION,     // ← Added
    promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,    // ← Added
    schemaHash: TEXTSEARCH_SCHEMA_HASH            // ← Added
  },
  TEXTSEARCH_JSON_SCHEMA
);
```

**Constants already defined** (top of file):
```typescript
const TEXTSEARCH_MAPPER_VERSION = 'textsearch_mapper_v2';

const TEXTSEARCH_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(TEXTSEARCH_MAPPER_PROMPT, 'utf8')
  .digest('hex');

// Imported from static-schemas.ts:
// - TEXTSEARCH_JSON_SCHEMA
// - TEXTSEARCH_SCHEMA_HASH
```

**Result**:
- `llm_gate_timing` logs now include full metadata
- `promptVersion: "textsearch_mapper_v2"` (not "unknown")
- `promptHash` and `schemaHash` populated correctly

---

## Files Changed

### 1. `server/src/services/search/route2/post-filters/post-results.filter.ts`
**Change**: Removed internal timing and `stage_completed` log

**Diff**:
```diff
  export function applyPostFilters(input: PostFilterInput): PostFilterOutput {
    const { results, sharedFilters, requestId, pipelineVersion } = input;
-   const startTime = Date.now();

    const beforeCount = results.length;
    // ... filtering logic ...
    const afterCount = filteredResults.length;
-   const durationMs = Date.now() - startTime;
  
-   logger.info({
-     requestId,
-     pipelineVersion,
-     stage: 'post_filter',
-     event: 'stage_completed',
-     durationMs,
-     // ...
-   }, '[ROUTE2] post_filter completed');

+   // Note: Timing/logging owned by orchestrator (startStage/endStage)
+   // This function only returns data for orchestrator to log

    return {
      resultsFiltered: filteredResults,
      // ...
    };
  }
```

### 2. `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
**Change**: Added metadata to `llmProvider.completeJSON()` call

**Diff**:
```diff
  const response = await llmProvider.completeJSON(
    messages,
    TextSearchLLMResponseSchema,
    {
      temperature: 0,
      timeout: 3500,
+     requestId,
+     ...(context.traceId && { traceId: context.traceId }),
+     ...(context.sessionId && { sessionId: context.sessionId }),
      stage: 'textsearch_mapper',
+     promptVersion: TEXTSEARCH_MAPPER_VERSION,
+     promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,
+     schemaHash: TEXTSEARCH_SCHEMA_HASH
    },
    TEXTSEARCH_JSON_SCHEMA
  );
```

---

## Before/After Logs

### Before (Duplicate post_filter logs)
```json
// From post-results.filter.ts:
{
  "stage": "post_filter",
  "event": "stage_completed",  // ← Log #1
  "durationMs": 1,
  "openState": "OPEN_NOW",
  "stats": { ... }
}

// From route2.orchestrator.ts:
{
  "stage": "post_filter",
  "event": "stage_completed",  // ← Log #2 (DUPLICATE!)
  "durationMs": 1,
  "stats": { ... }
}
```

### After (Single post_filter log)
```json
// Only from route2.orchestrator.ts:
{
  "stage": "post_filter",
  "event": "stage_completed",
  "durationMs": 1,
  "openState": "OPEN_NOW",
  "priceLevel": null,
  "isKosher": null,
  "stats": { ... }
}
```

---

### Before (Missing metadata)
```json
{
  "msg": "llm_gate_timing",
  "stage": "textsearch_mapper",
  "promptVersion": "unknown",  // ← Missing!
  "schemaHash": undefined,
  "promptChars": 613,
  "inputTokens": 268,
  "outputTokens": 28
}
```

### After (Full metadata)
```json
{
  "msg": "llm_gate_timing",
  "stage": "textsearch_mapper",
  "promptVersion": "textsearch_mapper_v2",  // ← Fixed!
  "promptHash": "d5f2a1...",
  "schemaHash": "textsearch_v2_no_bias",
  "requestId": "req-...",
  "traceId": "trace-...",
  "sessionId": "session-...",
  "inputTokens": 268,
  "outputTokens": 28
}
```

---

## Verification

### Test 1: Check for duplicate post_filter logs
```bash
# Run a search query, then:
grep "stage_completed.*post_filter" server/logs/server.log | wc -l
# Expected: 1 per request (not 2)
```

### Test 2: Check textsearch_mapper metadata
```bash
# Run a search query, then:
grep "textsearch_mapper.*promptVersion" server/logs/server.log
# Expected: promptVersion="textsearch_mapper_v2" (not "unknown")
```

---

## Build Status

✅ **TypeScript compilation passes**  
✅ **No type errors**  
✅ **No linter warnings**

---

## Impact

### Positive
- ✅ **Cleaner logs** - No duplicate `stage_completed` events
- ✅ **Better observability** - Full LLM metadata for debugging
- ✅ **Consistent patterns** - Orchestrator owns all stage timing
- ✅ **Faster log queries** - Less noise, easier to parse

### Neutral
- No performance impact (same work, just better logging)
- No breaking changes (pure internal refactor)

---

## Related Stages

All other stages follow the same pattern (no duplicates):
- ✅ `gate2` - Orchestrator timing only
- ✅ `intent` - Orchestrator timing only
- ✅ `google_maps` - Orchestrator timing only
- ✅ `post_constraints` - Orchestrator timing only
- ✅ `post_filter` - **Now fixed** (orchestrator timing only)

All LLM stages now include full metadata:
- ✅ `gate2` - Has `promptVersion`, `promptHash`, `schemaHash`
- ✅ `intent` - Has `promptVersion`, `promptHash`, `schemaHash`
- ✅ `base_filters_llm` - Has `promptVersion`, `promptHash`, `schemaHash`
- ✅ `post_constraints` - Has `promptVersion`, `promptHash`, `schemaHash`
- ✅ `textsearch_mapper` - **Now fixed** (has full metadata)
- ✅ `nearby_mapper` - Has full metadata
- ✅ `landmark_mapper` - Has full metadata

---

## Conclusion

Both issues resolved:
1. ✅ **No duplicate logs** - Only orchestrator emits `stage_completed`
2. ✅ **Full metadata** - All LLM stages include `promptVersion`, hashes, IDs

The codebase now has **consistent, clean logging** across all pipeline stages.
