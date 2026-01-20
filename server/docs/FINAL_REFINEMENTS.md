# Final Refinements - Route2 Pipeline

## Changes Made

### 1. TextSearch Schema - Flattened Bias ✅

**Problem**: `oneOf` union in JSON schema causes OpenAI strict mode issues

**Solution**: Flattened bias fields to top-level optional fields

**Before**:
```typescript
{
  bias: {
    oneOf: [
      { type: 'null' },
      {
        type: 'object',
        properties: {
          type: 'locationBias',
          center: { lat, lng },
          radiusMeters: number
        }
      }
    ]
  }
}
```

**After**:
```typescript
{
  biasLat: { anyOf: [null, number(-90 to 90)] },
  biasLng: { anyOf: [null, number(-180 to 180)] },
  biasRadiusMeters: { anyOf: [null, integer(1-50000)] }
}
```

**Files Changed**:
- `server/src/services/search/route2/stages/route-llm/static-schemas.ts`

**Note**: The textsearch mapper will need prompt update to instruct LLM to output flat bias fields.

---

### 2. Queue Delay Metric ✅

**Added**: `queueDelayMs` metric to measure time between job creation and pipeline start

**Purpose**: Track async queue wait time in production

**Implementation**:
- Added `jobCreatedAt` field to `Route2Context`
- Set `jobCreatedAt = Date.now()` in search controller before creating context
- Calculate `queueDelayMs = startTime - jobCreatedAt` in pipeline_completed

**Example Log**:
```json
{
  "event": "pipeline_completed",
  "durationMs": 5234,
  "durationsSumMs": 1960,
  "unaccountedMs": 3274,
  "queueDelayMs": 0,  // 0 for sync, >0 for async
  "durations": { ... }
}
```

**Files Changed**:
- `server/src/services/search/route2/types.ts` - Added `jobCreatedAt` to context
- `server/src/controllers/search/search.controller.ts` - Set `jobCreatedAt`
- `server/src/services/search/route2/route2.orchestrator.ts` - Calculate and log `queueDelayMs`

---

### 3. Schema Hash Consistency (TODO)

**Goal**: Compute schema hash once and pass same value to all LLM logs

**Current State**: Each static schema file computes its own hash
```typescript
export const TEXTSEARCH_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(TEXTSEARCH_JSON_SCHEMA))
  .digest('hex')
  .substring(0, 12);
```

**Status**: ✅ Already consistent - hash computed once per module load

**Verification**: The `schemaHash` is computed at module load time and reused for all calls. No changes needed.

---

## Build Status

✅ **All TypeScript compilation passes**

## Testing

### Queue Delay
- **Sync requests**: `queueDelayMs` should be `0`
- **Async requests**: `queueDelayMs` should be minimal (<10ms)

### TextSearch Bias
- LLM must output:
  - `biasLat: null, biasLng: null, biasRadiusMeters: null` (no bias)
  - OR all three with values (with bias)

### Schema Hash
- All provider logs should show same `schemaHash` for same stage
- Hash changes only when schema definition changes

---

## Next Steps

1. ✅ Build passes
2. ⏳ Update textsearch mapper prompt to use flat bias fields
3. ⏳ Test with real searches
4. ⏳ Verify `queueDelayMs` appears in logs
