# ROUTE2 Pipeline Improvements

## Summary of Changes

### 1. **Fixed Pipeline Duration Accounting** ✅
- **Problem**: `pipeline_completed` log showed zeros for all stage durations (`gate2Ms`, `intentMs`, etc.)
- **Root Cause**: Stages calculated `durationMs` but never stored them in context
- **Solution**:
  - Added `timings` field to `Route2Context` type
  - Each stage now stores its duration: `context.timings.stageNameMs = durationMs`
  - `pipeline_completed` reads from `context.timings` instead of trying to read from result objects
  - Added `unaccountedMs` calculation to identify gaps: `totalDuration - sum(knownStages)`

**Files Changed**:
- `server/src/services/search/route2/types.ts` - Added `timings` field to context
- `server/src/services/search/route2/stages/gate2.stage.ts` - Store `gate2Ms` in context
- `server/src/services/search/route2/route2.orchestrator.ts` - Wrap each stage with timing, store in context, use in `pipeline_completed` log

**Example Log Output**:
```json
{
  "event": "pipeline_completed",
  "durationMs": 5234,
  "durations": {
    "gate2Ms": 245,
    "intentMs": 198,
    "routeLLMMs": 421,
    "baseFiltersMs": 312,
    "googleMapsMs": 678,
    "postFilterMs": 12,
    "responseBuildMs": 8,
    "unaccountedMs": 3360
  }
}
```

---

### 2. **Enhanced Redis L2 Cache Configuration** ✅
- **Problem**: Redis cache was hardcoded, no config control
- **Solution**: Added new environment variables and config exports

**New Config Options**:
```env
ENABLE_REDIS_CACHE=true          # Enable/disable Redis L2 cache (default: true if REDIS_URL set)
REDIS_CACHE_PREFIX=cache:        # Key prefix for cache entries (default: "cache:")
GOOGLE_CACHE_TTL_SECONDS=900     # TTL for Google API cache (default: 900 = 15min)
ENABLE_GOOGLE_CACHE=true         # Master switch for Google cache (default: true)
```

**Files Changed**:
- `server/src/config/env.ts` - Added new config options
- `server/.env` - Added default values

---

### 3. **Improved Cache Observability** ✅
- **Problem**: Cache logs didn't show tier (L1 vs L2) or TTL remaining
- **Solution**: Enhanced cache logs with `cacheTier`, `cacheAgeMs`, `ttlRemainingSec`

**Cache Log Enhancements**:
```typescript
// L1 HIT
{
  "event": "L1_CACHE_HIT",
  "key": "...",
  "cacheTier": "L1",
  "cacheAgeMs": 1234,
  "ttlRemainingSec": 876
}

// L2 HIT (Redis)
{
  "event": "CACHE_HIT",
  "key": "...",
  "source": "redis",
  "cacheTier": "L2",
  "ttlRemainingSec": 543
}

// CACHE STORE
{
  "event": "CACHE_STORE",
  "key": "...",
  "cacheTier": "L2",
  "ttlUsed": 900
}
```

**Files Changed**:
- `server/src/lib/cache/googleCacheService.ts` - Added `ttl()` call for L2 hits, added `cacheTier` to all cache logs

---

### 4. **Fixed Intent Stage LLM Call** ✅
- **Problem**: `response` was declared but never assigned, causing TypeScript error "'response' is possibly 'undefined'"
- **Root Cause**: LLM call logic was missing (replaced by comment placeholder)
- **Solution**:
  - Added proper `llmProvider.completeJSON()` call with correct 3-argument signature
  - Added null check for response
  - Added proper error handling with timeout detection

**Files Changed**:
- `server/src/services/search/route2/stages/intent/intent.stage.ts` - Implemented missing LLM call

---

## Testing Checklist

### Cache Behavior (L1/L2)
- [ ] First request: logs show `CACHE_MISS` → `CACHE_STORE cacheTier:L2`
- [ ] Second request (same process): logs show `L1_CACHE_HIT cacheTier:L1`
- [ ] After server restart: logs show `CACHE_HIT cacheTier:L2 ttlRemainingSec:...`
- [ ] Verify `ttlRemainingSec` decreases on subsequent requests

### Pipeline Duration Decomposition
- [ ] Run a search request
- [ ] Check `pipeline_completed` log
- [ ] Verify all stage durations are non-zero: `gate2Ms`, `intentMs`, `routeLLMMs`, `baseFiltersMs`, `googleMapsMs`, `postFilterMs`, `responseBuildMs`
- [ ] Verify `unaccountedMs` is small (<500ms for healthy run)
- [ ] If `unaccountedMs` is large, investigate what's missing (jobstore write? ws publish?)

### Intent Stage
- [ ] Send Hebrew query: verify LLM returns proper `IntentResult`
- [ ] Send English query: verify LLM returns proper `IntentResult`
- [ ] Verify no TypeScript errors about `response` being undefined

---

## Known Limitations

1. **Unaccounted Duration**: May include:
   - JobStore write time (not instrumented yet)
   - WebSocket publish time (not instrumented yet)
   - Filter resolution time (partial - only `baseFiltersMs` tracked)

2. **Cache Age Calculation**: L2 (Redis) doesn't provide creation timestamp, so `cacheAgeMs` is undefined for Redis hits

3. **Intent Stage**: No retry logic yet (gate2 and nearby have retry, but intent doesn't)

---

## Next Steps

1. ✅ Add timing for `jobstore_write` stage
2. ✅ Add timing for `ws_publish` stage
3. ✅ Update `unaccountedMs` calculation to include these
4. ⏸️  Add retry logic to intent stage (if timeout rate > 5%)
5. ⏸️  Consider adding Redis cache metrics (hit rate, avg TTL, etc.)
